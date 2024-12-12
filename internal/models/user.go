package models

import "time"

type User struct {
	UserId    int64     `gorm:"primaryKey;autoIncrement"`
	Login     string    `gorm:"unique;not null"`
	Password  string    `gorm:"not null"`
	Nickname  string    `gorm:"size:100"`
	Tasks     []*Task   `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Groups    []*Group  `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Days      []*Day    `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

type UserCreateRequest struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
	Nickname string `json:"nickname,omitempty"`
}

type UserUpdateRequest struct {
	Login    *string `json:"login,omitempty"`
	Password *string `json:"password,omitempty"`
	Nickname *string `json:"nickname,omitempty"`
}

type UserLoginRequest struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}
