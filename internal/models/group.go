package models

import "time"

type Group struct {
	GroupId       int64     `gorm:"primaryKey;autoIncrement" json:"GroupId"`
	GroupPriority uint64    `gorm:"not null" json:"GroupPriority"`
	UserId        int64     `gorm:"not null;index" json:"UserId"`
	Name          string    `gorm:"not null" json:"Name"`
	Description   string    `json:"Description"`
	CreatedAt     time.Time `gorm:"autoCreateTime" json:"CreatedAt"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime" json:"UpdatedAt"`
	// Tasks — задачи группы по Task.GroupId; не колонка и не связь GORM: репозиторий заполняет поле запросом
	Tasks []*Task `gorm:"-" json:"Tasks"`
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
