package handlers

import (
	"TaskManager/internal/services"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// UseJSONFieldNames заставляет валидатор gin называть поля по json-тегам (deadline, а не DeadLine),
// чтобы в тексте ошибки были те же имена, что отправляет клиент.
func UseJSONFieldNames() {
	validate, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok {
		return
	}
	validate.RegisterTagNameFunc(func(field reflect.StructField) string {
		name := strings.SplitN(field.Tag.Get("json"), ",", 2)[0]
		if name == "" || name == "-" {
			return field.Name
		}
		return name
	})
}

// respondBindingError отвечает 400 с понятным текстом ошибки разбора или валидации тела запроса.
func respondBindingError(context *gin.Context, logger *slog.Logger, err error) {
	logger.Warn("Неправильные данные в запросе",
		slog.String("method", context.Request.Method),
		slog.String("path", context.Request.URL.Path),
		slog.String("error", err.Error()))
	context.JSON(http.StatusBadRequest, gin.H{"error": "Неправильные данные в запросе: " + bindingErrorMessage(err)})
}

func bindingErrorMessage(err error) string {
	var validationErrors validator.ValidationErrors
	var typeError *json.UnmarshalTypeError
	var syntaxError *json.SyntaxError
	var timeError *time.ParseError

	switch {
	case errors.As(err, &validationErrors):
		messages := make([]string, 0, len(validationErrors))
		for _, fieldError := range validationErrors {
			messages = append(messages, validationMessage(fieldError))
		}
		return strings.Join(messages, "; ")
	case errors.As(err, &timeError):
		return "неверный формат даты, ожидается RFC3339"
	case errors.As(err, &typeError):
		return fmt.Sprintf("неверный тип поля «%s»", typeError.Field)
	case errors.As(err, &syntaxError), errors.Is(err, io.ErrUnexpectedEOF):
		return "некорректный JSON"
	case errors.Is(err, io.EOF):
		return "пустое тело запроса"
	default:
		return err.Error()
	}
}

func validationMessage(fieldError validator.FieldError) string {
	field := fieldError.Field()
	switch fieldError.Tag() {
	case "required":
		return fmt.Sprintf("не указано поле «%s»", field)
	case "min":
		return fmt.Sprintf("поле «%s» должно быть не меньше %s", field, fieldError.Param())
	case "max":
		return fmt.Sprintf("поле «%s» должно быть не больше %s", field, fieldError.Param())
	case "oneof":
		return fmt.Sprintf("поле «%s» должно быть одним из: %s", field, fieldError.Param())
	default:
		return fmt.Sprintf("неверное значение поля «%s»", field)
	}
}

// respondError отвечает {"error": "..."}: ошибки сервисов с видом (services.Error) — 400/404/409
// с их текстом, остальные — 500 с записью в лог.
func respondError(context *gin.Context, logger *slog.Logger, err error, logMessage string, attrs ...any) {
	var serviceError *services.Error
	if errors.As(err, &serviceError) {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(serviceError, services.ErrKindNotFound):
			status = http.StatusNotFound
		case errors.Is(serviceError, services.ErrKindInvalidInput):
			status = http.StatusBadRequest
		case errors.Is(serviceError, services.ErrKindConflict):
			status = http.StatusConflict
		}
		logger.Info(logMessage, append(attrs, slog.Int("status", status), slog.String("error", err.Error()))...)
		context.JSON(status, gin.H{"error": serviceError.Error()})
		return
	}

	logger.Error(logMessage, append(attrs, slog.String("error", err.Error()))...)
	context.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}
