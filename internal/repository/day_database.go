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
	var day models.Day
	if err := rep.db.Preload("Tasks").First(&day, dayID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("день с ID %d не найден", dayID)
		}
		return nil, fmt.Errorf("ошибка при поиске задач для дня: %w", err)
	}
	return day.Tasks, nil
}

func (rep *DayRepositoryImpl) GetAllUserDays(userID int64) ([]*models.Day, error) {
	var days []*models.Day
	query := rep.db.Where("user_id = ?", userID)

	if err := query.Find(&days).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске дней в базе данных: %s", err)
	}
	return days, nil
}

// func (r *DayRepositoryImpl) Create(day *models.Day) (*models.Day, error) {
// 	if err := r.db.Create(day).Error; err != nil {
// 		return nil, fmt.Errorf("ошибка при записи дня в базу данных: %w", err)
// 	}
// 	return day, nil
// }

// func (r *DayRepositoryImpl) FindByID(dayID int64) (*models.Day, error) {
// 	var day models.Day
// 	if err := r.db.First(&day, dayID).Error; err != nil {
// 		if errors.Is(err, gorm.ErrRecordNotFound) {
// 			return nil, nil
// 		}

// 		return nil, fmt.Errorf("ошибка при поиске дня в базе данных: %w", err)
// 	}
// 	return &day, nil
// }

// func (r *DayRepositoryImpl) Update(day *models.Day) (*models.Day, error) {
// 	if err := r.db.Save(day).Error; err != nil {
// 		return nil, fmt.Errorf("ошибка при обновлении дня в базе данных: %w", err)
// 	}
// 	return day, nil
// }

// func (r *DayRepositoryImpl) Delete(dayID int64) error {
// 	if err := r.db.Delete(&models.Day{}, dayID).Error; err != nil {
// 		return fmt.Errorf("ошибка при удалении дня по id: %w", err)
// 	}
// 	return nil
// }

// func (r *DayRepositoryImpl) FindByUserID(userID int64) ([]*models.Day, error) {
// 	var days []*models.Day
// 	if err := r.db.Where("user_id = ?", userID).Find(&days).Error; err != nil {
// 		return nil, fmt.Errorf("ошибка при поиске дней в базе данных: %w", err)
// 	}
// 	return days, nil
// }
