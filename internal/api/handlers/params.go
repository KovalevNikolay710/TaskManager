package handlers

import (
	"log/slog"
	"strconv"

	"TaskManager/internal/services"

	"github.com/gin-gonic/gin"
)

// parseIDParam читает числовой параметр пути. При ошибке сам отвечает 400 через respondError
// («Неправильное id <what>») и возвращает false — вызывающему остаётся выйти.
func parseIDParam(context *gin.Context, logger *slog.Logger, param, what string) (int64, bool) {
	id, err := strconv.ParseInt(context.Param(param), 10, 64)
	if err != nil {
		respondError(context, logger, services.NewInvalidInputError("Неправильное id "+what),
			"Неправильный параметр пути", slog.String("param", param), slog.String("path", context.Request.URL.Path))
		return 0, false
	}
	return id, true
}
