package main

import (
	"TaskManager/internal/api"
	"TaskManager/internal/config"
	sl "TaskManager/internal/lib/logger/slog"
	"TaskManager/internal/repository"
	"TaskManager/internal/services"
	"TaskManager/web"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
	// База часовых поясов внутри бинарника: в образе alpine нет tzdata, без неё
	// time.LoadLocation("Europe/Moscow") для настроек напоминаний вернул бы ошибку
	_ "time/tzdata"

	"github.com/gin-gonic/gin"
)

// Таймауты HTTP-сервера: защита от медленных и зависших клиентов.
const (
	readHeaderTimeout = 10 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 60 * time.Second
	shutdownTimeout   = 10 * time.Second
)

func main() {
	logger := sl.InitLogger()
	slog.SetDefault(logger)
	if err := run(logger); err != nil {
		logger.Error("Сервер остановлен с ошибкой", sl.Err(err))
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("ошибка настроек: %w", err)
	}

	// Контекст отменяется по Ctrl+C и SIGTERM (docker stop): сервер и планировщик завершаются штатно
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Подключение к базе данных и миграция схемы
	db, err := repository.Connect(ctx, cfg.DB.DSN(), logger)
	if err != nil {
		return err
	}
	if err := repository.Migrate(db, logger); err != nil {
		if !errors.Is(err, repository.ErrRepairFailed) {
			return err
		}
		// Данные остались прежними, сервер продолжает запуск
		logger.Error("Чистка данных старых версий не удалась", sl.Err(err))
	}

	// Инициализация репозитория
	taskRepository := repository.NewTaskRepository(db)
	dayRepository := repository.NewDayRepository(db)
	groupRepository := repository.NewGroupRepository(db)
	subscriptionRepository := repository.NewPushSubscriptionRepository(db)
	settingsRepository := repository.NewNotificationSettingsRepository(db)
	vapidRepository := repository.NewVapidKeysRepository(db)
	notificationLogRepository := repository.NewNotificationLogRepository(db)

	// Инициализация сервиса
	taskService := services.NewTaskService(taskRepository, groupRepository, logger)
	dayService := services.NewDayService(dayRepository, taskRepository, logger)
	groupServices := services.NewGroupService(groupRepository, taskRepository, taskService, logger)
	pushService := services.NewPushService(subscriptionRepository, vapidRepository, services.NewWebPushSender(), services.PushConfig{
		PublicKey:  cfg.VAPID.PublicKey,
		PrivateKey: cfg.VAPID.PrivateKey,
		Subject:    cfg.VAPID.Subject,
		// Домены push-сервисов сверх встроенных, через запятую
		ExtraEndpointHosts: services.ParseEndpointHosts(cfg.PushEndpointHosts),
	}, logger)
	if err := pushService.InitKeys(); err != nil {
		logger.Error("Не удалось загрузить VAPID-ключи, повторим при первом запросе", sl.Err(err))
	}
	notificationService := services.NewNotificationService(settingsRepository, logger)
	reminderService := services.NewReminderService(pushService, subscriptionRepository, settingsRepository,
		taskRepository, dayRepository, notificationLogRepository, logger)

	// Создание роутера
	router := gin.Default()

	// Регистрация маршрутов
	api.RegisterTaskRoutes(router, taskService, dayService, groupServices, pushService, notificationService, logger)
	// Фронтенд встроен в бинарник; все прочие GET-пути отдаются SPA
	api.RegisterFrontend(router, web.Dist(), logger)

	// Планировщик напоминаний: раз в минуту, до отмены контекста
	var background sync.WaitGroup
	background.Go(func() { reminderService.Run(ctx) })

	// Запуск сервера; ошибка запуска (например, порт занят) приходит через канал,
	// чтобы остановить планировщик штатно, а не аварийно из горутины
	server := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
	serverErr := make(chan error, 1)
	go func() {
		logger.Info("Сервер запущен", slog.String("addr", server.Addr))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	var runErr error
	select {
	case <-ctx.Done():
		logger.Info("Остановка сервера")
	case err := <-serverErr:
		runErr = fmt.Errorf("ошибка запуска сервера: %w", err)
	}
	stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Ошибка при остановке сервера", sl.Err(err))
	}
	background.Wait()
	return runErr
}
