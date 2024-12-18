package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DayHandler struct {
	dayService     *services.DayServiceImpl
	GenericService *services.GenericService[models.Day]
}

func NewDayHandler(dayService *services.DayServiceImpl, genServ *services.GenericService[models.Day]) *DayHandler {
	return &DayHandler{dayService: dayService, GenericService: genServ}
}

func (handler *DayHandler) CreateDayHandler(c *gin.Context) {
	var day models.DayCreateRequest
	if err := c.ShouldBindJSON(&day); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	createdDay, err := handler.dayService.CreateDay(&day)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, createdDay)
}

func (handler *DayHandler) GetDayByIDHandler(context *gin.Context) {
	dayId, err := handler.GetIdFromContext(context)
	if err != nil {
		return
	}

	day, err := handler.GenericService.GetByID(dayId)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	day, err = handler.dayService.FillDayTaskListAndCalculatePriorty(day)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusOK, day)
}

func (handler *DayHandler) UpdateDayHandler(context *gin.Context) {
	dayId, err := handler.GetIdFromContext(context)
	if err != nil {
		return
	}

	var input models.DayUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updatedDay, err := handler.dayService.UpdateDay(dayId, &input)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusOK, updatedDay)
}

func (handler *DayHandler) DeleteDayHandler(context *gin.Context) {
	dayId, err := handler.GetIdFromContext(context)
	if err != nil {
		return
	}

	if err := handler.dayService.GenericService.Delete(dayId); err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusNoContent, nil)
}

func (handler *DayHandler) GetDaysByUserIDHandler(context *gin.Context) {
	userId, err := handler.GetUserIdFromContext(context)
	if err != nil {
		return
	}

	days, err := handler.dayService.GetDaysByUserID(userId)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusOK, days)
}

func (handler *DayHandler) GetIdFromContext(context *gin.Context) (int64, error) {
	dayId, err := strconv.ParseInt(context.Param("id"), 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id дня"})
		return 0, err
	}
	return dayId, nil
}

func (handler *DayHandler) GetUserIdFromContext(context *gin.Context) (int64, error) {
	dayId, err := strconv.ParseInt(context.Param("user_id"), 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильное id пользователя"})
		return 0, err
	}
	return dayId, nil
}
