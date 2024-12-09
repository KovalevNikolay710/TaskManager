package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DayHandler struct {
	dayService services.DayServiceImpl
}

func NewDayHandler(dayService services.DayServiceImpl) *DayHandler {
	return &DayHandler{dayService: dayService}
}

func (h *DayHandler) CreateDayHandler(c *gin.Context) {
	var day models.Day
	if err := c.ShouldBindJSON(&day); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	createdDay, err := h.dayService.CreateDay(&day)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, createdDay)
}

func (h *DayHandler) GetDayByIDHandler(c *gin.Context) {
	dayIDStr := c.Param("id")
	dayID, err := strconv.ParseInt(dayIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid day ID"})
		return
	}

	day, err := h.dayService.GetDayByID(dayID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, day)
}

func (h *DayHandler) UpdateDayHandler(c *gin.Context) {
	var day models.Day
	if err := c.ShouldBindJSON(&day); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updatedDay, err := h.dayService.UpdateDay(&day)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, updatedDay)
}

func (h *DayHandler) DeleteDayHandler(c *gin.Context) {
	dayIDStr := c.Param("id")
	dayID, err := strconv.ParseInt(dayIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid day ID"})
		return
	}

	if err := h.dayService.DeleteDay(dayID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusNoContent, nil)
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
