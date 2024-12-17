package models

import "time"

const (
	StatusDayValid = iota
	StatusDayExpierd
)

type Day struct {
	DayId            int64     `gorm:"primaryKey;autoIncrement"`
	UserId           int64     `gorm:"not null"`
	Date             time.Time `gorm:"not null"`
	TimeForTasks     int       `gorm:"not null;default:0"`
	AmountOfTasks    int       `gorm:"not null;default:0"`
	PriorityOfTheDay float64   `gorm:"not null;default:0"`
	Status           uint16    `gorm:"not null;default:0"`
	UpdatedAt        time.Time
}

type DayCreateRequest struct {
	Date          time.Time `json:"date" binding:"required"`
	UserId        int64     `json:"userId" binding:"required"`
	TimeForTasks  int       `json:"timeForTasks" binding:"required"`
	AmountOfTasks int       `json:"amountOfTasks" binding:"required"`
}

type DayUpdateRequest struct {
	TimeForTasks  *int `json:"timeForTasks,omitempty"`
	AmountOfTasks *int `json:"amountOfTasks,omitempty"`
}
