package api

import (
	"TaskManager/internal/api/handlers"
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"log/slog"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func RegisterTaskRoutes(router *gin.Engine, taskService services.TaskServiceImpl, dayService services.DayServiceImpl, groupsServices services.GroupServiceImpl, logger *slog.Logger, db *gorm.DB) {
	taskHandler := handlers.NewTaskHandler(taskService, logger, *services.NewGenericService[models.Task](db))
	dayHandler := handlers.NewDayHandler(dayService, *services.NewGenericService[models.Day](db))
	groupHandler := handlers.NewGroupHandler(groupsServices, logger, *services.NewGenericService[models.Group](db))

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

	groupRoutes := router.Group("/groups")
	{
		groupRoutes.POST("/", groupHandler.CreateGroup)
		groupRoutes.GET("/:id", groupHandler.GetGroupByID)
		groupRoutes.PUT("/:id", groupHandler.UpdateGroup)
		groupRoutes.DELETE("/:id", groupHandler.DeleteGroup)
		groupRoutes.GET("/:id/tasks", groupHandler.GetAllGroupTasks)
		groupRoutes.GET("/user/:user_id", groupHandler.GetAllUserGroups)
	}
}
