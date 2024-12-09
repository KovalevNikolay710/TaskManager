package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type TaskHandler struct {
	TaskService services.TaskServiceImpl
}

func NewTaskHandler(taskService services.TaskServiceImpl) *TaskHandler {
	return &TaskHandler{TaskService: taskService}
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
		context.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	createdTask, err := handler.TaskService.CreateTask(taskRequest)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusCreated, createdTask)
}

func (handler *TaskHandler) GetTaskById(context *gin.Context) {
	taskId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id задачи"})
		return
	}

	task, err := handler.TaskService.GetTaskByID(taskId)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if task == nil {
		context.JSON(http.StatusNotFound, gin.H{"error": "Задача не найдена"})
		return
	}
	context.JSON(http.StatusOK, task)
}

func (handler *TaskHandler) UpdateTask(context *gin.Context) {
	taskId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id задачи"})
		return
	}

	var input models.TaskUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Неправильное данные в запросе"})
		return
	}

	updatedTask, err := handler.TaskService.UpdateTask(taskId, input)

	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}

	context.JSON(http.StatusOK, updatedTask)
}

func (handler *TaskHandler) DeleteTask(context *gin.Context) {
	taskId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id задачи"})
		return
	}
	if err := handler.TaskService.DeleteTask(taskId); err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	context.JSON(http.StatusOK, gin.H{"message": "Задача успешно удаленна"})
}

func (handler *TaskHandler) GetTasksByUserID(context *gin.Context) {
	userId, err := strconv.ParseInt(context.Param("user_id"), 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id пользователя"})
		return
	}

	var filter models.TaskFilter
	if err := context.ShouldBindQuery(&filter); err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные параметры фильтра для задач"})
		return
	}

	tasks, err := handler.TaskService.GetTasksByUserID(userId, filter)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}

	context.JSON(http.StatusOK, tasks)
}
