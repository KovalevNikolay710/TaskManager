package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type DayRepositoryImpl struct {
	*GenericRepository[models.Day]
}

func NewDayRepository(db *gorm.DB) *DayRepositoryImpl {
	return &DayRepositoryImpl{
		GenericRepository: NewGenericRepository[models.Day](db),
	}
}

func (rep *DayRepositoryImpl) GetAllTasksForDay(dayID int64) ([]*models.Task, error) {
	var tasks []*models.Task
	if err := rep.db.Table("tasks").
		Joins("JOIN day_tasks ON day_tasks.task_id = tasks.task_id").
		Where("day_tasks.day_id = ?", dayID).
		Find(&tasks).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("задачи для дня с ID %d не найдены", dayID)
		}
		return nil, fmt.Errorf("ошибка при поиске задач для дня: %w", err)
	}
	return tasks, nil
}
func (rep *DayRepositoryImpl) GetAllUserDays(userID int64) ([]*models.Day, error) {
	var days []*models.Day
	query := rep.db.Where("user_id = ?", userID)

	if err := query.Find(&days).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске дней в базе данных: %s", err)
	}
	return days, nil
}

func (rep *DayRepositoryImpl) AddTaskToDay(dayID, taskID int64) error {
	if err := rep.db.Exec("INSERT INTO day_tasks (day_id, task_id) VALUES (?, ?)", dayID, taskID).Error; err != nil {
		return fmt.Errorf("ошибка при добавлении задачи в день: %w", err)
	}
	return nil
}
