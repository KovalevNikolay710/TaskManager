package api

import (
	"TaskManager/internal/api/handlers"
	"TaskManager/internal/services"

	"github.com/gin-gonic/gin"
)

func RegisterTaskRoutes(router *gin.Engine, taskService services.TaskServiceImpl, dayService services.DayServiceImpl) {
	taskHandler := handlers.NewTaskHandler(taskService)
	dayHandler := handlers.NewDayHandler(dayService)

	taskRoutes := router.Group("/tasks")
	{
		taskRoutes.POST("/", taskHandler.CreateTask)
		taskRoutes.GET("/:id", taskHandler.GetTaskById)
		taskRoutes.PUT("/:id", taskHandler.UpdateTask)
		taskRoutes.DELETE("/:id", taskHandler.DeleteTask)
		taskRoutes.GET("/user/:user_id", taskHandler.GetTasksByUserID)
	}

	dayRoutes := router.Group("/days")
	{
		dayRoutes.POST("/", dayHandler.CreateDayHandler)
		dayRoutes.GET("/:id", dayHandler.GetDayByIDHandler)
		dayRoutes.PUT("/", dayHandler.UpdateDayHandler)
		dayRoutes.DELETE("/:id", dayHandler.DeleteDayHandler)
		dayRoutes.GET("/user", dayHandler.GetDaysByUserIDHandler)
	}
}
