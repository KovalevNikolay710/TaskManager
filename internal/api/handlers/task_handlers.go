package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type TaskHandler struct {
	TaskService    services.TaskServiceImpl
	GenericService services.GenericService[models.Task]
	Logger         *slog.Logger
}

func NewTaskHandler(taskService services.TaskServiceImpl, logger *slog.Logger, genServ services.GenericService[models.Task]) *TaskHandler {
	return &TaskHandler{TaskService: taskService, Logger: logger, GenericService: genServ}
}

type TaskServiceImpl interface {
	CreateTask(input models.TaskCreateRequest) (task *models.Task, err error)
	DeleteTask(taskId int64) error
	GetTaskByID(taskId int64) (*models.Task, error)
	GetTasksByUserID(userId int64, filters models.TaskFilter) ([]*models.Task, error)
	UpdateTask(taskID int64, input models.TaskUpdateRequest) (*models.Task, error)
}

func (handler *TaskHandler) CreateTask(context *gin.Context) {
	var taskRequest models.TaskCreateRequest
	if err := context.ShouldBindJSON(&taskRequest); err != nil {
		handler.Logger.Error("Ошибка при получении задачи от пользователя",
			slog.String("error", err.Error()),
			slog.String("method", context.Request.Method),
			slog.String("path", context.Request.URL.Path))
		context.JSON(http.StatusBadRequest, gin.H{"error": err})
		return
	}

	createdTask, err := handler.TaskService.CreateTask(taskRequest)
	if err != nil {
		handler.Logger.Error("Ошибка при получении задачи из БД",
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusCreated, createdTask)
}

func (handler *TaskHandler) GetTaskById(context *gin.Context) {
	taskId, err := handler.GetIdFromContext(context)
	if err != nil {
		return
	}

	task, err := handler.TaskService.GenericService.GetByID(taskId)
	if err != nil {
		handler.Logger.Error("Ошибка при получении задачи из БД",
			slog.String("error", err.Error()),
			slog.Int64("taskId", taskId))
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера"})
		return
	}
	if task == nil {
		context.JSON(http.StatusNotFound, gin.H{"error": "Задача не найдена"})
		return
	}
	context.JSON(http.StatusOK, task)
}

func (handler *TaskHandler) UpdateTask(context *gin.Context) {
	taskId, err := handler.GetIdFromContext(context)
	if err != nil {
		return
	}

	var input models.TaskUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		handler.Logger.Error("Ошибка при привязке JSON для обновления задачи",
			slog.String("method", context.Request.Method),
			slog.String("path", context.Request.URL.Path),
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные данные в запросе"})
		return
	}

	updatedTask, err := handler.TaskService.UpdateTask(taskId, input)
	if err != nil {
		handler.Logger.Error("Ошибка при обновлении задачи",
			slog.Int64("taskId", taskId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Задача успешно обновлена",
		slog.Int64("taskId", taskId))
	context.JSON(http.StatusOK, updatedTask)
}

func (handler *TaskHandler) DeleteTask(context *gin.Context) {
	taskId, err := handler.GetIdFromContext(context)
	if err != nil {
		return
	}

	if err := handler.TaskService.GenericService.Delete(taskId); err != nil {
		handler.Logger.Error("Ошибка при удалении задачи",
			slog.Int64("taskId", taskId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Задача успешно удалена",
		slog.Int64("taskId", taskId))
	context.JSON(http.StatusOK, gin.H{"message": "Задача успешно удалена"})
}

func (handler *TaskHandler) GetTasksByUserID(context *gin.Context) {
	userId, err := strconv.ParseInt(context.Param("user_id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id пользователя в запросе",
			slog.String("method", context.Request.Method),
			slog.String("path", context.Request.URL.Path),
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id пользователя"})
		return
	}

	var filter models.TaskFilter
	if err := context.ShouldBindQuery(&filter); err != nil {
		handler.Logger.Error("Ошибка при привязке параметров фильтра задач",
			slog.Int64("userId", userId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные параметры фильтра для задач"})
		return
	}

	tasks, err := handler.TaskService.GetTasksByUserID(userId, filter)
	if err != nil {
		handler.Logger.Error("Ошибка при получении задач по userId",
			slog.Int64("userId", userId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Задачи успешно получены",
		slog.Int64("userId", userId),
		slog.Int("taskCount", len(tasks)))
	context.JSON(http.StatusOK, tasks)
}

func (handler *TaskHandler) GetIdFromContext(context *gin.Context) (int64, error) {
	taskId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Ошибка при получении id задачи из запроса",
			slog.String("error", err.Error()),
			slog.String("method", context.Request.Method),
			slog.String("path", context.Request.URL.Path))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id задачи"})
		return 0, err
	}
	return taskId, nil
}
