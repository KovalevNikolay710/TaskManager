package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

type TaskHandler struct {
	TaskService *services.TaskServiceImpl
	Logger      *slog.Logger
}

func NewTaskHandler(taskService *services.TaskServiceImpl, logger *slog.Logger) *TaskHandler {
	return &TaskHandler{TaskService: taskService, Logger: logger}
}

func (handler *TaskHandler) CreateTask(context *gin.Context) {
	var taskRequest models.TaskCreateRequest
	if err := context.ShouldBindJSON(&taskRequest); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	createdTask, err := handler.TaskService.CreateTask(taskRequest)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при создании задачи")
		return
	}

	context.JSON(http.StatusCreated, createdTask)
}

func (handler *TaskHandler) GetTaskById(context *gin.Context) {
	taskId, ok := parseIDParam(context, handler.Logger, "id", "задачи")
	if !ok {
		return
	}

	task, err := handler.TaskService.GetById(taskId)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении задачи", slog.Int64("taskId", taskId))
		return
	}
	context.JSON(http.StatusOK, task)
}

func (handler *TaskHandler) UpdateTask(context *gin.Context) {
	taskId, ok := parseIDParam(context, handler.Logger, "id", "задачи")
	if !ok {
		return
	}

	var input models.TaskUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	updatedTask, err := handler.TaskService.UpdateTask(taskId, input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при обновлении задачи", slog.Int64("taskId", taskId))
		return
	}

	context.JSON(http.StatusOK, updatedTask)
}

func (handler *TaskHandler) DeleteTask(context *gin.Context) {
	taskId, ok := parseIDParam(context, handler.Logger, "id", "задачи")
	if !ok {
		return
	}

	if err := handler.TaskService.DeleteTask(taskId); err != nil {
		respondError(context, handler.Logger, err, "Ошибка при удалении задачи", slog.Int64("taskId", taskId))
		return
	}

	context.JSON(http.StatusOK, gin.H{"message": "Задача успешно удалена"})
}

func (handler *TaskHandler) GetTasksByUserID(context *gin.Context) {
	userId, ok := parseIDParam(context, handler.Logger, "user_id", "пользователя")
	if !ok {
		return
	}

	// Фильтр необязателен: без query-параметров отдаём все задачи пользователя
	var filter models.TaskFilter
	if err := context.ShouldBindQuery(&filter); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	tasks, err := handler.TaskService.GetTasksByUserID(userId, filter)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении задач по userId",
			slog.Int64("userId", userId), slog.Any("filter", filter))
		return
	}
	if tasks == nil {
		tasks = []*models.Task{}
	}

	handler.Logger.Info("Задачи успешно получены",
		slog.Int64("userId", userId),
		slog.Any("filter", filter),
		slog.Int("taskCount", len(tasks)))
	context.JSON(http.StatusOK, tasks)
}
