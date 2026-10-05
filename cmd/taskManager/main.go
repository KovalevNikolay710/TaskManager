package main

import (
	"TaskManager/internal/api"
	"TaskManager/internal/lib/logger/slog"
	"TaskManager/internal/repository"
	"TaskManager/internal/services"
	"TaskManager/web"
	"context"
	"errors"
	"log"
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

func main() {
	// Контекст отменяется по Ctrl+C и SIGTERM (docker stop): сервер и планировщик завершаются штатно
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Подключение к базе данных
	repository.Connect()
	db := repository.GetDB()

	// Инициализация репозитория
	taskRepository := repository.NewTaskRepository(db)
	dayRepository := repository.NewDayRepository(db)
	groupRepository := repository.NewGroupRepository(db)
	subscriptionRepository := repository.NewPushSubscriptionRepository(db)
	settingsRepository := repository.NewNotificationSettingsRepository(db)
	vapidRepository := repository.NewVapidKeysRepository(db)
	notificationLogRepository := repository.NewNotificationLogRepository(db)

	logger := slog.InitLogger()

	// Инициализация сервиса
	taskService := services.NewTaskService(taskRepository, groupRepository, logger)
	dayService := services.NewDayService(dayRepository, taskRepository, logger)
	groupServices := services.NewGroupService(groupRepository, taskRepository, taskService, logger)
	pushService := services.NewPushService(subscriptionRepository, vapidRepository, services.NewWebPushSender(), services.PushConfig{
		PublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		PrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
		Subject:    os.Getenv("VAPID_SUBJECT"),
	}, logger)
	if err := pushService.InitKeys(); err != nil {
		logger.Error("Не удалось загрузить VAPID-ключи, повторим при первом запросе", slog.Err(err))
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

	// Запуск сервера
	server := &http.Server{Addr: ":8080", Handler: router}
	go func() {
		log.Println("Сервер запущен на порту :8080")
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Ошибка запуска сервера: %v", err)
		}
	}()

	<-ctx.Done()
	stop()
	logger.Info("Остановка сервера")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Ошибка при остановке сервера", slog.Err(err))
	}
	background.Wait()
}

// func main() {
// 	cfg := config.MustLoad()

// 	log := setupLogger(cfg.Env)
// 	log = log.With(slog.String("env", cfg.Env)) // к каждому сообщению будет добавляться поле с информацией о текущем окружении

// 	log.Info("initializing server", slog.String("address", cfg.Address)) // Помимо сообщения выведем параметр с адресом
// 	log.Debug("logger debug mode enabled")
// }

// func setupLogger(env string) *slog.Logger {
// 	var log *slog.Logger

// 	switch env {
// 	case envLocal:
// 		log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
// 	case envDev:
// 		log = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
// 	case envProd:
// 		log = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
// 	}

// 	return log
// }
