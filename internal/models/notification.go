package models

import "time"

// PushSubscription — подписка одного устройства (браузера) на push.
type PushSubscription struct {
	SubscriptionId int64     `gorm:"primaryKey;autoIncrement" json:"SubscriptionId"`
	UserId         int64     `gorm:"index;not null" json:"UserId"`
	Endpoint       string    `gorm:"uniqueIndex;not null" json:"Endpoint"`
	P256dh         string    `gorm:"not null" json:"-"`
	Auth           string    `gorm:"not null" json:"-"`
	UserAgent      string    `json:"UserAgent"`
	CreatedAt      time.Time `json:"CreatedAt"`
	UpdatedAt      time.Time `json:"UpdatedAt"`
}

// PushSubscriptionResponse — подписка в ответе API: без ключей шифрования P256dh и Auth.
type PushSubscriptionResponse struct {
	SubscriptionId int64     `json:"SubscriptionId"`
	UserId         int64     `json:"UserId"`
	Endpoint       string    `json:"Endpoint"`
	UserAgent      string    `json:"UserAgent"`
	CreatedAt      time.Time `json:"CreatedAt"`
	UpdatedAt      time.Time `json:"UpdatedAt"`
}

// NewPushSubscriptionResponse убирает из подписки ключи шифрования.
func NewPushSubscriptionResponse(sub *PushSubscription) PushSubscriptionResponse {
	return PushSubscriptionResponse{
		SubscriptionId: sub.SubscriptionId,
		UserId:         sub.UserId,
		Endpoint:       sub.Endpoint,
		UserAgent:      sub.UserAgent,
		CreatedAt:      sub.CreatedAt,
		UpdatedAt:      sub.UpdatedAt,
	}
}

// Значения настроек напоминаний по умолчанию (design/screens/profile.md).
const (
	DefaultMorningTime         = "08:00"
	DefaultEveningTime         = "21:00"
	DefaultDeadlineHoursBefore = 3
	DefaultQuietFrom           = "23:00"
	DefaultQuietTo             = "07:00"
	MinDeadlineHoursBefore     = 1
	MaxDeadlineHoursBefore     = 24
)

// NotificationSettings — настройки напоминаний пользователя (одна строка на пользователя).
type NotificationSettings struct {
	UserId              int64     `gorm:"primaryKey;autoIncrement:false" json:"UserId"`
	MorningEnabled      bool      `gorm:"not null;default:true" json:"MorningEnabled"`
	MorningTime         string    `gorm:"not null;default:'08:00'" json:"MorningTime"` // ЧЧ:ММ, местное время
	EveningEnabled      bool      `gorm:"not null;default:true" json:"EveningEnabled"`
	EveningTime         string    `gorm:"not null;default:'21:00'" json:"EveningTime"`
	DeadlineEnabled     bool      `gorm:"not null;default:true" json:"DeadlineEnabled"`
	DeadlineHoursBefore int       `gorm:"not null;default:3" json:"DeadlineHoursBefore"`
	QuietEnabled        bool      `gorm:"not null;default:true" json:"QuietEnabled"`
	QuietFrom           string    `gorm:"not null;default:'23:00'" json:"QuietFrom"` // ЧЧ:ММ; начало тихих часов (только для «Дедлайн скоро»)
	QuietTo             string    `gorm:"not null;default:'07:00'" json:"QuietTo"`   // ЧЧ:ММ; конец; QuietFrom > QuietTo — интервал через полночь
	Timezone            string    `json:"Timezone"`                                  // IANA, например "Europe/Moscow"; пусто — часовой пояс сервера
	UpdatedAt           time.Time `json:"UpdatedAt"`
}

// DefaultNotificationSettings — настройки пользователя, у которого ещё нет строки в БД.
func DefaultNotificationSettings(userId int64) NotificationSettings {
	return NotificationSettings{
		UserId:              userId,
		MorningEnabled:      true,
		MorningTime:         DefaultMorningTime,
		EveningEnabled:      true,
		EveningTime:         DefaultEveningTime,
		DeadlineEnabled:     true,
		DeadlineHoursBefore: DefaultDeadlineHoursBefore,
		QuietEnabled:        true,
		QuietFrom:           DefaultQuietFrom,
		QuietTo:             DefaultQuietTo,
	}
}

// VapidKeys — ключи VAPID сервера (одна строка). Создаются автоматически при первом запуске.
type VapidKeys struct {
	Id         int64     `gorm:"primaryKey;autoIncrement:false" json:"Id"` // всегда 1
	PublicKey  string    `gorm:"not null" json:"PublicKey"`                // base64url
	PrivateKey string    `gorm:"not null" json:"-"`
	CreatedAt  time.Time `json:"CreatedAt"`
}

// VapidKeysID — единственная строка таблицы vapid_keys.
const VapidKeysID = 1

// Виды напоминаний в журнале notification_log.
const (
	NotificationKindMorning  = "morning"
	NotificationKindEvening  = "evening"
	NotificationKindDeadline = "deadline"
)

// NotificationLog — отправленное напоминание: защищает от повторов, в том числе после перезапуска сервера.
// Key — локальная дата YYYY-MM-DD для утра и вечера, Deadline в RFC3339 (UTC) для дедлайна.
type NotificationLog struct {
	LogId  int64  `gorm:"primaryKey;autoIncrement"`
	UserId int64  `gorm:"not null;uniqueIndex:idx_notification_log_unique,priority:1"`
	Kind   string `gorm:"not null;uniqueIndex:idx_notification_log_unique,priority:2"`
	TaskId int64  `gorm:"not null;default:0;uniqueIndex:idx_notification_log_unique,priority:3"` // 0 — не про задачу
	Key    string `gorm:"not null;uniqueIndex:idx_notification_log_unique,priority:4"`
	SentAt time.Time
}

// TableName — имя таблицы из спецификации (GORM по умолчанию назвал бы её notification_logs).
func (NotificationLog) TableName() string { return "notification_log" }

// PushKeysRequest — ключи шифрования из subscription.toJSON().
type PushKeysRequest struct {
	P256dh string `json:"p256dh" binding:"required"`
	Auth   string `json:"auth" binding:"required"`
}

// PushSubscribeRequest — subscription.toJSON() браузера, userId и userAgent.
type PushSubscribeRequest struct {
	UserId    int64           `json:"userId" binding:"required"`
	Endpoint  string          `json:"endpoint" binding:"required"`
	Keys      PushKeysRequest `json:"keys" binding:"required"`
	UserAgent string          `json:"userAgent"`
}

// PushUnsubscribeRequest — удаление подписки устройства.
type PushUnsubscribeRequest struct {
	UserId   int64  `json:"userId" binding:"required"`
	Endpoint string `json:"endpoint" binding:"required"`
}

// PushTestRequest — тестовое уведомление; без endpoint — на все устройства пользователя.
type PushTestRequest struct {
	UserId   int64  `json:"userId" binding:"required"`
	Endpoint string `json:"endpoint"`
}

// NotificationSettingsUpdateRequest — частичное обновление: nil (поле не передано) — не менять.
// Проверки значений — в сервисе, чтобы тексты ошибок совпадали со спецификацией.
type NotificationSettingsUpdateRequest struct {
	MorningEnabled      *bool   `json:"morningEnabled"`
	MorningTime         *string `json:"morningTime"`
	EveningEnabled      *bool   `json:"eveningEnabled"`
	EveningTime         *string `json:"eveningTime"`
	DeadlineEnabled     *bool   `json:"deadlineEnabled"`
	DeadlineHoursBefore *int    `json:"deadlineHoursBefore"`
	QuietEnabled        *bool   `json:"quietEnabled"`
	QuietFrom           *string `json:"quietFrom"`
	QuietTo             *string `json:"quietTo"`
	Timezone            *string `json:"timezone"`
}
