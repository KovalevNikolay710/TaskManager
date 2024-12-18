package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type GroupHandler struct {
	GroupService    *services.GroupServiceImpl
	TaskService     *services.TaskServiceImpl
	GenericServices *services.GenericService[models.Group]
	Logger          *slog.Logger
}

func NewGroupHandler(groupService *services.GroupServiceImpl, taskService *services.TaskServiceImpl, logger *slog.Logger, genServ *services.GenericService[models.Group]) *GroupHandler {
	return &GroupHandler{GroupService: groupService, TaskService: taskService, Logger: logger, GenericServices: genServ}
}

type GroupServiceImpl interface {
	CreateGroup(input models.GroupCreateRequest) (Group *models.Group, err error)
	DeleteGroup(GroupId int64) error
	GetGroupByID(GroupId int64) (*models.Group, error)
	UpdateGroup(GroupId int64, input models.GroupUpdateRequest) (*models.Group, error)
	GetAllGroupTasks(GroupId int64) *[]models.Task
	GetAllUserGroups(userId int64) *[]models.Group
}

func (handler *GroupHandler) CreateGroup(context *gin.Context) {
	var input models.GroupCreateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		handler.Logger.Error("Ошибка при привязке JSON для создания группы",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные данные в запросе"})
		return
	}

	group, err := handler.GroupService.CreateGroup(input)
	if err != nil {
		handler.Logger.Error("Ошибка при создании группы",
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Группа успешно создана",
		slog.Int64("groupId", group.GroupId))
	context.JSON(http.StatusOK, group)
}

func (handler *GroupHandler) DeleteGroup(context *gin.Context) {
	groupId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id группы в запросе",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id группы"})
		return
	}

	if err := handler.GenericServices.Delete(groupId); err != nil {
		handler.Logger.Error("Ошибка при удалении группы",
			slog.Int64("groupId", groupId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Группа успешно удалена",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusOK, gin.H{"message": "Группа успешно удалена"})
}

func (handler *GroupHandler) GetGroupByID(context *gin.Context) {
	groupId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id группы в запросе",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id группы"})
		return
	}

	group, err := handler.GenericServices.GetByID(groupId)
	if err != nil {
		handler.Logger.Error("Ошибка при получении группы",
			slog.Int64("groupId", groupId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Группа успешно получена",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusOK, group)
}

func (handler *GroupHandler) UpdateGroup(context *gin.Context) {
	groupId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id группы в запросе",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id группы"})
		return
	}

	var input models.GroupUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		handler.Logger.Error("Ошибка при привязке JSON для обновления группы",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные данные в запросе"})
		return
	}
	handler.Logger.Error("Приоритет",
		slog.Uint64("groupId", input.GroupPriority))
	updatedGroup, err := handler.GroupService.UpdateGroup(groupId, input)
	if err != nil {
		handler.Logger.Error("Ошибка при обновлении группы",
			slog.Int64("groupId", groupId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Группа успешно обновлена",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusOK, updatedGroup)
}

func (handler *GroupHandler) AddTaskToGroup(context *gin.Context) {
	groupId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id группы в запросе",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id группы"})
	}

	var input models.TaskCreateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		handler.Logger.Error("Ошибка при привязке JSON для обновления группы",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные данные в запросе"})
		return
	}

	input.GroupId = groupId

	task, err := handler.TaskService.CreateTask(input)
	if err != nil {
		handler.Logger.Error("Ошибка при создании задачи из БД",
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	group := models.GroupUpdateRequest{Task: task}

	updatedGroup, err := handler.GroupService.UpdateGroup(groupId, group)
	if err != nil {
		handler.Logger.Error("Ошибка при обновлении группы",
			slog.Int64("groupId", groupId),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	handler.Logger.Info("Группа успешно обновлена",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusOK, updatedGroup)
}

func (handler *GroupHandler) GetAllGroupTasks(context *gin.Context) {
	groupId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id группы в запросе",
			slog.String("error", err.Error()))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id группы"})
		return
	}

	tasks, err := handler.GroupService.GetAllGroupTasks(groupId)
	if err != nil {
		context.JSON(http.StatusNotFound, gin.H{"error": "Ошибка при поиске задач группы"})
		return
	}
	if tasks == nil || len(tasks) == 0 {
		context.JSON(http.StatusNotFound, gin.H{"error": "Задачи для группы не найдены"})
		return
	}

	handler.Logger.Info("Задачи группы успешно получены",
		slog.Int64("groupId", groupId),
		slog.Int("taskCount", len(tasks)))
	context.JSON(http.StatusOK, tasks)
}

func (handler *GroupHandler) GetAllUserGroups(context *gin.Context) {
	userID, err := strconv.ParseInt(context.Param("user_id"), 10, 64)
	if err != nil {
		handler.Logger.Error("Неправильное id пользователя в запросе",
			slog.String("error", err.Error()),
			slog.String("method", context.Request.Method),
			slog.String("path", context.Request.URL.Path))
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id пользователя"})
		return
	}

	groups, err := handler.GroupService.GetAllUserGroups(userID)
	if err != nil {
		handler.Logger.Error("Ошибка при получении всех групп пользователя",
			slog.Int64("userId", userID),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить группы пользователя"})
		return
	}

	if len(groups) == 0 {
		handler.Logger.Info("Группы пользователя не найдены",
			slog.Int64("userId", userID))
		context.JSON(http.StatusNotFound, gin.H{"error": "Группы пользователя не найдены"})
		return
	}

	handler.Logger.Info("Группы пользователя успешно получены",
		slog.Int64("userId", userID),
		slog.Int("groupCount", len(groups)))
	context.JSON(http.StatusOK, groups)
}
