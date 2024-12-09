package models

import "time"

type Group struct {
	GroupId     int64   `gorm:"primaryKey;autoIncrement"`
	UserId      int64   `gorm:"index;not null"`
	Tasks       []*Task `gorm:"foreignKey:GroupId"`
	Status      string  `gorm:"default:'Active'"`
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type User struct {
	UserId      int64    `gorm:"primaryKey;autoIncrement"`
	Password    string   `gorm:"not null"`
	Nickname    string   `gorm:"unique;not null"`
	Tasks       []*Task  `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Groups      []*Group `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Day         []*Day   `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Preferences string   `gorm:"type:varchar(10);default:'Light'"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
