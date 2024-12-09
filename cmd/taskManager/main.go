package main

import (
	"TaskManager/internal/api"
	"TaskManager/internal/repository"
	"TaskManager/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

func main() {
	// Подключение к базе данных
	repository.Connect()
	db := repository.GetDB()

	// Инициализация репозитория
	taskRepository := repository.NewTaskRepository(db)
	dayRepository := repository.NewDayRepository(db)

	// Инициализация сервиса
	taskService := services.NewTaskService(*taskRepository)
	dayService := services.NewDayService(dayRepository, taskRepository)

	// Создание роутера
	router := gin.Default()

	// Регистрация маршрутов
	api.RegisterTaskRoutes(router, taskService, *dayService)

	// Запуск сервера
	log.Println("Сервер запущен на порту :8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
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
