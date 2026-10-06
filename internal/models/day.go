package models

import "time"

const (
	StatusDayValid = iota
	StatusDayExpierd
)

// Границы времени дня (TimeForTasks), минуты: от 0:15 до 16:00.
const (
	MinDayMinutes = 15
	MaxDayMinutes = 960
)

type Day struct {
	DayId  int64     `gorm:"primaryKey;autoIncrement"`
	UserId int64     `gorm:"not null;index"`
	Date   time.Time `gorm:"not null"`
	// TimeForTasks — сколько минут пользователь готов отдать задачам в этот день (100% диаграммы);
	// время делится между задачами плана (Slots), остаток — свободное время
	TimeForTasks int `gorm:"not null;default:0"`
	// AmountOfTasks — число задач в плане (len(Slots)) на момент сборки; фронт не читает
	AmountOfTasks    int     `gorm:"not null;default:0"`
	PriorityOfTheDay float64 `gorm:"not null;default:0"` // Сумма Priority невыполненных задач плана
	Status           uint16  `gorm:"not null;default:0"`
	UpdatedAt        time.Time
	Tasks            []*Task `gorm:"many2many:day_tasks;constraint:OnDelete:CASCADE;"` // Каскадное удаление
	// Slots — та же таблица day_tasks: сколько минут выделено каждой задаче плана
	Slots []DayTask `gorm:"foreignKey:DayId;constraint:OnDelete:CASCADE;"`
}

// DayTask — задача в плане дня и выделенное ей время.
// Колонки названы так, как GORM назвал их для many2many day_tasks, чтобы старые планы сохранились.
type DayTask struct {
	DayId   int64 `gorm:"primaryKey;column:day_day_id"`
	TaskId  int64 `gorm:"primaryKey;column:task_task_id"`
	Minutes int   `gorm:"not null;default:0"` // выделено на этот день, минуты
}

type DayCreateRequest struct {
	Date         time.Time `json:"date" binding:"required"`
	UserId       int64     `json:"userId" binding:"required"`
	TimeForTasks int       `json:"timeForTasks" binding:"required,min=15,max=960"` // минуты
}

// DayUpdateRequest — пересборка плана; без timeForTasks план пересобирается с прежним временем.
type DayUpdateRequest struct {
	TimeForTasks int `json:"timeForTasks" binding:"omitempty,min=15,max=960"` // минуты
}
