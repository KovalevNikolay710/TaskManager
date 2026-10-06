package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

type GroupHandler struct {
	GroupService *services.GroupServiceImpl
	Logger       *slog.Logger
}

func NewGroupHandler(groupService *services.GroupServiceImpl, logger *slog.Logger) *GroupHandler {
	return &GroupHandler{GroupService: groupService, Logger: logger}
}

func (handler *GroupHandler) CreateGroup(context *gin.Context) {
	var input models.GroupCreateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	group, err := handler.GroupService.CreateGroup(input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при создании группы")
		return
	}

	handler.Logger.Info("Группа успешно создана",
		slog.Int64("groupId", group.GroupId))
	context.JSON(http.StatusCreated, group)
}

func (handler *GroupHandler) DeleteGroup(context *gin.Context) {
	groupId, ok := parseIDParam(context, handler.Logger, "id", "группы")
	if !ok {
		return
	}

	if err := handler.GroupService.DeleteGroup(groupId); err != nil {
		respondError(context, handler.Logger, err, "Ошибка при удалении группы", slog.Int64("groupId", groupId))
		return
	}

	handler.Logger.Info("Группа успешно удалена",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusOK, gin.H{"message": "Группа успешно удалена"})
}

func (handler *GroupHandler) GetGroupByID(context *gin.Context) {
	groupId, ok := parseIDParam(context, handler.Logger, "id", "группы")
	if !ok {
		return
	}

	group, err := handler.GroupService.GetGroupByID(groupId)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении группы", slog.Int64("groupId", groupId))
		return
	}

	context.JSON(http.StatusOK, group)
}

func (handler *GroupHandler) UpdateGroup(context *gin.Context) {
	groupId, ok := parseIDParam(context, handler.Logger, "id", "группы")
	if !ok {
		return
	}

	var input models.GroupUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	updatedGroup, err := handler.GroupService.UpdateGroup(groupId, input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при обновлении группы", slog.Int64("groupId", groupId))
		return
	}

	handler.Logger.Info("Группа успешно обновлена",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusOK, updatedGroup)
}

// ReorderGroups атомарно меняет веса нескольких групп (перенос по лесенке) и отдаёт все группы пользователя.
func (handler *GroupHandler) ReorderGroups(context *gin.Context) {
	var input models.GroupReorderRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	groups, err := handler.GroupService.ReorderGroups(input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при изменении весов групп", slog.Int64("userId", input.UserId))
		return
	}
	if groups == nil {
		groups = []*models.Group{}
	}
	context.JSON(http.StatusOK, groups)
}

func (handler *GroupHandler) AddTaskToGroup(context *gin.Context) {
	groupId, ok := parseIDParam(context, handler.Logger, "id", "группы")
	if !ok {
		return
	}

	var input models.TaskCreateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	updatedGroup, err := handler.GroupService.AddTaskToGroup(groupId, input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при добавлении задачи в группу", slog.Int64("groupId", groupId))
		return
	}

	handler.Logger.Info("Задача добавлена в группу",
		slog.Int64("groupId", groupId))
	context.JSON(http.StatusCreated, updatedGroup)
}

func (handler *GroupHandler) GetAllGroupTasks(context *gin.Context) {
	groupId, ok := parseIDParam(context, handler.Logger, "id", "группы")
	if !ok {
		return
	}

	tasks, err := handler.GroupService.GetAllGroupTasks(groupId)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении задач группы", slog.Int64("groupId", groupId))
		return
	}
	// Пустая группа — не ошибка: отдаём пустой массив, а не null
	if tasks == nil {
		tasks = []*models.Task{}
	}

	handler.Logger.Info("Задачи группы успешно получены",
		slog.Int64("groupId", groupId),
		slog.Int("taskCount", len(tasks)))
	context.JSON(http.StatusOK, tasks)
}

func (handler *GroupHandler) GetAllUserGroups(context *gin.Context) {
	userID, ok := parseIDParam(context, handler.Logger, "user_id", "пользователя")
	if !ok {
		return
	}

	groups, err := handler.GroupService.GetAllUserGroups(userID)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении всех групп пользователя", slog.Int64("userId", userID))
		return
	}

	// Отсутствие групп — не ошибка: отдаём пустой массив
	if groups == nil {
		groups = []*models.Group{}
	}

	handler.Logger.Info("Группы пользователя успешно получены",
		slog.Int64("userId", userID),
		slog.Int("groupCount", len(groups)))
	context.JSON(http.StatusOK, groups)
}
