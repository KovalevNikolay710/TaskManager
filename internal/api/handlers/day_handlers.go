package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

type DayHandler struct {
	dayService *services.DayServiceImpl
	Logger     *slog.Logger
}

func NewDayHandler(dayService *services.DayServiceImpl, logger *slog.Logger) *DayHandler {
	return &DayHandler{dayService: dayService, Logger: logger}
}

func (handler *DayHandler) CreateDayHandler(c *gin.Context) {
	var day models.DayCreateRequest
	if err := c.ShouldBindJSON(&day); err != nil {
		respondBindingError(c, handler.Logger, err)
		return
	}

	createdDay, err := handler.dayService.CreateDay(&day)
	if err != nil {
		respondError(c, handler.Logger, err, "Ошибка при создании дня")
		return
	}
	c.JSON(http.StatusCreated, createdDay)
}

// GetDayByIDHandler отдаёт сохранённый план дня: чтение план не пересобирает.
func (handler *DayHandler) GetDayByIDHandler(context *gin.Context) {
	dayId, ok := parseIDParam(context, handler.Logger, "id", "дня")
	if !ok {
		return
	}

	day, err := handler.dayService.GetDayByID(dayId)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении дня", slog.Int64("dayId", dayId))
		return
	}

	context.JSON(http.StatusOK, day)
}

func (handler *DayHandler) UpdateDayHandler(context *gin.Context) {
	dayId, ok := parseIDParam(context, handler.Logger, "id", "дня")
	if !ok {
		return
	}

	// Пустое тело — пересборка с прежним временем дня
	var input models.DayUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil && !errors.Is(err, io.EOF) {
		respondBindingError(context, handler.Logger, err)
		return
	}

	updatedDay, err := handler.dayService.UpdateDay(dayId, &input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при обновлении дня", slog.Int64("dayId", dayId))
		return
	}

	context.JSON(http.StatusOK, updatedDay)
}

func (handler *DayHandler) DeleteDayHandler(context *gin.Context) {
	dayId, ok := parseIDParam(context, handler.Logger, "id", "дня")
	if !ok {
		return
	}

	if err := handler.dayService.DeleteDay(dayId); err != nil {
		respondError(context, handler.Logger, err, "Ошибка при удалении дня", slog.Int64("dayId", dayId))
		return
	}

	handler.Logger.Info("День успешно удалён", slog.Int64("dayId", dayId))
	context.JSON(http.StatusOK, gin.H{"message": "День успешно удалён"})
}

func (handler *DayHandler) GetDaysByUserIDHandler(context *gin.Context) {
	userId, ok := parseIDParam(context, handler.Logger, "user_id", "пользователя")
	if !ok {
		return
	}

	days, err := handler.dayService.GetDaysByUserID(userId)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении дней пользователя", slog.Int64("userId", userId))
		return
	}
	if days == nil {
		days = []*models.Day{}
	}

	context.JSON(http.StatusOK, days)
}
