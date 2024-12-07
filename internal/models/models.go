package models

import "time"

type Group struct {
	GroupId     int64   `gorm:"primaryKey;autoIncrement"`
	UserId      int64   `gorm:"index;not null"`
	Tasks       []*Task `gorm:"foreignKey:GroupId"`
	Status      string  `gorm:"type:enum('Active', 'Archived');default:'Active'"`
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Day struct {
	Date             time.Time `gorm:"primaryKey"`
	TimeForTasks     int64     // Duration in milliseconds
	Tasks            []*Task   `gorm:"many2many:day_tasks"`
	PriorityOfTheDay float64
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type User struct {
	UserId      int64    `gorm:"primaryKey;autoIncrement"`
	Password    string   `gorm:"not null"`
	Nickname    string   `gorm:"unique;not null"`
	Groups      []*Group `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Tasks       []*Task  `gorm:"foreignKey:UserId;constraint:OnDelete:CASCADE"`
	Preferences string   `gorm:"type:enum('Light', 'Dark');default:'Light'"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
