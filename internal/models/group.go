package models

import "time"

type Group struct {
	GroupId       int64  `gorm:"primaryKey;autoIncrement"`
	GroupPriority uint64 `gorm:"not null"`
	UserId        int64
	Name          string `gorm:"not null"`
	Description   string
	CreatedAt     time.Time `gorm:"autoCreateTime"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime"`
}

type GroupCreateRequest struct {
	UserId        int64  `json:"userId" binding:"required"`
	GroupPriority uint64 `json:"groupPriority" binding:"required"`
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
}

type GroupUpdateRequest struct {
	Priority    uint64 `json:"groupPriority,omitempty"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}
