package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DayHandler struct {
	dayService     services.DayServiceImpl
	GenericService services.GenericService[models.Day]
}

func NewDayHandler(dayService services.DayServiceImpl, genServ services.GenericService[models.Day]) *DayHandler {
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
	dayId := handler.parseIdFromContext(context)

	day, err := handler.dayService.GenericService.GetByID(dayId)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusOK, day)
}

func (handler *DayHandler) UpdateDayHandler(context *gin.Context) {
	dayId := handler.parseIdFromContext(context)

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
	dayId := handler.parseIdFromContext(context)

	if err := handler.dayService.GenericService.Delete(dayId); err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	context.JSON(http.StatusNoContent, nil)
}

func (h *DayHandler) GetDaysByUserIDHandler(c *gin.Context) {
	userIDStr := c.Query("userId")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
		return
	}

	days, err := h.dayService.GetDaysByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, days)
}

func (handler *DayHandler) parseIdFromContext(context *gin.Context) (dayId int64) {
	dayIDStr := context.Query("userId")
	dayId, err := strconv.ParseInt(dayIDStr, 10, 64)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
		return
	}
	return dayId
}
