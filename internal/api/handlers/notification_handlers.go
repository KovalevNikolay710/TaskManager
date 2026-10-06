package handlers

import (
	"TaskManager/internal/models"
	"TaskManager/internal/services"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// PushHandler — push-подписки устройств и тестовое уведомление.
type PushHandler struct {
	pushService *services.PushServiceImpl
	Logger      *slog.Logger
}

func NewPushHandler(pushService *services.PushServiceImpl, logger *slog.Logger) *PushHandler {
	return &PushHandler{pushService: pushService, Logger: logger}
}

// GetPublicKey отдаёт публичный VAPID-ключ для pushManager.subscribe.
func (handler *PushHandler) GetPublicKey(context *gin.Context) {
	publicKey, err := handler.pushService.PublicKey()
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении VAPID-ключа")
		return
	}
	context.JSON(http.StatusOK, gin.H{"PublicKey": publicKey})
}

// Subscribe сохраняет подписку устройства: 201 — новая, 200 — уже была (обновлена).
func (handler *PushHandler) Subscribe(context *gin.Context) {
	var input models.PushSubscribeRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	subscription, created, err := handler.pushService.Subscribe(input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при сохранении подписки", slog.Int64("userId", input.UserId))
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	context.JSON(status, subscription)
}

// Unsubscribe удаляет подписку устройства.
func (handler *PushHandler) Unsubscribe(context *gin.Context) {
	var input models.PushUnsubscribeRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	if err := handler.pushService.Unsubscribe(input); err != nil {
		respondError(context, handler.Logger, err, "Ошибка при удалении подписки", slog.Int64("userId", input.UserId))
		return
	}
	context.JSON(http.StatusOK, gin.H{"message": "Подписка удалена"})
}

// SendTest отправляет тестовое уведомление на устройство (или на все устройства пользователя).
func (handler *PushHandler) SendTest(context *gin.Context) {
	var input models.PushTestRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	sent, err := handler.pushService.SendTest(context.Request.Context(), input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при отправке тестового уведомления", slog.Int64("userId", input.UserId))
		return
	}
	context.JSON(http.StatusOK, gin.H{"Sent": sent})
}

// NotificationHandler — настройки напоминаний пользователя.
type NotificationHandler struct {
	notificationService *services.NotificationServiceImpl
	Logger              *slog.Logger
}

func NewNotificationHandler(notificationService *services.NotificationServiceImpl, logger *slog.Logger) *NotificationHandler {
	return &NotificationHandler{notificationService: notificationService, Logger: logger}
}

// GetSettings отдаёт настройки; если их ещё не сохраняли — значения по умолчанию.
func (handler *NotificationHandler) GetSettings(context *gin.Context) {
	userID, ok := handler.userIDFromContext(context)
	if !ok {
		return
	}

	settings, err := handler.notificationService.GetSettings(userID)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при получении настроек уведомлений", slog.Int64("userId", userID))
		return
	}
	context.JSON(http.StatusOK, settings)
}

// UpdateSettings — частичное обновление настроек (upsert), ответ — полные настройки.
func (handler *NotificationHandler) UpdateSettings(context *gin.Context) {
	userID, ok := handler.userIDFromContext(context)
	if !ok {
		return
	}

	var input models.NotificationSettingsUpdateRequest
	if err := context.ShouldBindJSON(&input); err != nil {
		respondBindingError(context, handler.Logger, err)
		return
	}

	settings, err := handler.notificationService.UpdateSettings(userID, input)
	if err != nil {
		respondError(context, handler.Logger, err, "Ошибка при сохранении настроек уведомлений", slog.Int64("userId", userID))
		return
	}
	context.JSON(http.StatusOK, settings)
}

func (handler *NotificationHandler) userIDFromContext(context *gin.Context) (int64, bool) {
	userID, ok := parseIDParam(context, handler.Logger, "user_id", "пользователя")
	if !ok {
		return 0, false
	}
	if userID <= 0 {
		respondError(context, handler.Logger, services.NewInvalidInputError("Неправильное id пользователя"),
			"Неправильный параметр пути", slog.String("param", "user_id"), slog.String("path", context.Request.URL.Path))
		return 0, false
	}
	return userID, true
}
