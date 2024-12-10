package models

import "time"

const (
	StatusDayExpierd = "expierd"
	StatusDayValid   = "valid"
)

type Day struct {
	DayId            int64     `gorm:"primaryKey;autoIncrement"`
	Date             time.Time `gorm:"uniqueIndex:idx_user_date;not null"`
	UserId           int64     `gorm:"uniqueIndex:idx_user_date;not null"`
	TimeForTasks     int       `gorm:"not null;default:0"`
	AmountOfTasks    int       `gorm:"not null;default:0"`
	Tasks            []*Task   `gorm:"many2many:day_tasks"`
	PriorityOfTheDay float64   `gorm:"not null;default:0"`
	Status           string    `gorm:"not null"`
	UpdatedAt        time.Time
}

type DayCreateRequest struct {
	Date          string  `json:"date" binding:"required"`             // Дата в формате YYYY-MM-DD, RFC3339
	UserId        int64   `json:"userId" binding:"required"`           // ID пользователя
	TimeForTasks  int     `json:"timeForTasks" binding:"required"`     // Время на выполнение задач (в минутах)
	AmountOfTasks int     `json:"amountOfTasks" binding:"required"`    // Количество задач для дня
	Priority      float64 `json:"priorityOfTheDay" binding:"required"` // Приоритет дня
}

type DayUpdateRequest struct {
	TimeForTasks  *int     `json:"timeForTasks,omitempty"`
	AmountOfTasks *int     `json:"amountOfTasks,omitempty"`
	Priority      *float64 `json:"priorityOfTheDay,omitempty"`
}
