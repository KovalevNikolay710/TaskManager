package models

import "time"

type Group struct {
	GroupId       int64  `gorm:"primaryKey;autoIncrement"`
	GroupPriority uint64 `gorm:"not null"`
	UserId        int64  `gorm:"not null;index"`
	Name          string `gorm:"not null"`
	Description   string
	CreatedAt     time.Time `gorm:"autoCreateTime"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime"`
	Tasks         []*Task   `gorm:"many2many:group_tasks;constraint:OnDelete:CASCADE;"`
}

type GroupCreateRequest struct {
	UserId        int64  `json:"userId" binding:"required"`
	GroupPriority uint64 `json:"groupPriority" binding:"required,min=1,max=10"` // вес группы: 1–10
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
}

// GroupUpdateRequest — частичное обновление: nil (поле не передано) — не менять.
type GroupUpdateRequest struct {
	Name          *string `json:"name"`
	Description   *string `json:"description"`
	GroupPriority *uint64 `json:"groupPriority" binding:"omitempty,min=1,max=10"`
}

// GroupReorderRequest — атомарная смена весов нескольких групп пользователя (перенос по лесенке).
type GroupReorderRequest struct {
	UserId int64         `json:"userId" binding:"required"`
	Groups []GroupWeight `json:"groups" binding:"required,min=1,dive"`
}

// GroupWeight — новый вес одной группы.
type GroupWeight struct {
	GroupId       int64  `json:"groupId" binding:"required"`
	GroupPriority uint64 `json:"groupPriority" binding:"required,min=1,max=10"` // вес группы: 1–10
}
