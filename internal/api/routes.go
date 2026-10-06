package api

import (
	"TaskManager/internal/api/handlers"
	"TaskManager/internal/services"
	"log/slog"

	"github.com/gin-gonic/gin"
)

func RegisterTaskRoutes(router *gin.Engine, taskService *services.TaskServiceImpl, dayService *services.DayServiceImpl, groupsServices *services.GroupServiceImpl,
	pushService *services.PushServiceImpl, notificationService *services.NotificationServiceImpl, logger *slog.Logger) {
	// Ошибки валидации называют поля так же, как их отправляет клиент (json-теги)
	handlers.UseJSONFieldNames()

	taskHandler := handlers.NewTaskHandler(taskService, logger)
	dayHandler := handlers.NewDayHandler(dayService, logger)
	groupHandler := handlers.NewGroupHandler(groupsServices, logger)
	pushHandler := handlers.NewPushHandler(pushService, logger)
	notificationHandler := handlers.NewNotificationHandler(notificationService, logger)

	// Всё API живёт под /api, чтобы не пересекаться с маршрутами SPA (/day, /tasks/:id, ...)
	apiRoutes := router.Group("/api")

	taskRoutes := apiRoutes.Group("/tasks")
	{
		taskRoutes.POST("/", taskHandler.CreateTask)
		taskRoutes.GET("/:id", taskHandler.GetTaskById)
		taskRoutes.POST("/update/:id", taskHandler.UpdateTask)
		taskRoutes.DELETE("/:id", taskHandler.DeleteTask)
		taskRoutes.POST("/user/:user_id", taskHandler.GetTasksByUserID)
	}

	dayRoutes := apiRoutes.Group("/days")
	{
		dayRoutes.POST("/", dayHandler.CreateDayHandler)
		dayRoutes.GET("/:id", dayHandler.GetDayByIDHandler)
		dayRoutes.POST("/update/:id", dayHandler.UpdateDayHandler)
		dayRoutes.DELETE("/:id", dayHandler.DeleteDayHandler)
		dayRoutes.GET("/user/:user_id", dayHandler.GetDaysByUserIDHandler)
	}

	groupRoutes := apiRoutes.Group("/groups")
	{
		groupRoutes.POST("/", groupHandler.CreateGroup)
		groupRoutes.GET("/:id", groupHandler.GetGroupByID)
		groupRoutes.POST("/update/:id", groupHandler.UpdateGroup)
		groupRoutes.POST("/reorder", groupHandler.ReorderGroups)
		groupRoutes.POST("/add/:id", groupHandler.AddTaskToGroup)
		groupRoutes.DELETE("/:id", groupHandler.DeleteGroup)
		groupRoutes.GET("/tasks/:id", groupHandler.GetAllGroupTasks)
		groupRoutes.GET("/user/:user_id", groupHandler.GetAllUserGroups)
	}

	pushRoutes := apiRoutes.Group("/push")
	{
		pushRoutes.GET("/key", pushHandler.GetPublicKey)
		pushRoutes.POST("/subscribe", pushHandler.Subscribe)
		pushRoutes.DELETE("/subscribe", pushHandler.Unsubscribe)
		pushRoutes.POST("/test", pushHandler.SendTest)
	}

	notificationRoutes := apiRoutes.Group("/notifications")
	{
		notificationRoutes.GET("/settings/:user_id", notificationHandler.GetSettings)
		notificationRoutes.POST("/settings/:user_id", notificationHandler.UpdateSettings)
	}
}
