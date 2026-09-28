package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DayRepositoryImpl struct {
	*GenericRepository[models.Day]
}

func NewDayRepository(db *gorm.DB) *DayRepositoryImpl {
	return &DayRepositoryImpl{
		GenericRepository: NewGenericRepository[models.Day](db),
	}
}

// FindByID возвращает день с задачами и слотами плана или nil, nil, если дня нет.
func (rep *DayRepositoryImpl) FindByID(dayID int64) (*models.Day, error) {
	var day models.Day
	if err := rep.db.Preload("Tasks").Preload("Slots").First(&day, dayID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("ошибка при поиске дня в базе данных: %w", err)
	}
	return &day, nil
}

func (rep *DayRepositoryImpl) GetAllUserDays(userID int64) ([]*models.Day, error) {
	var days []*models.Day

	query := rep.db.Where("user_id = ?", userID).Preload("Tasks").Preload("Slots")

	if err := query.Find(&days).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске дней в базе данных: %w", err)
	}

	return days, nil
}

// CreateWithSlots создаёт день и строки плана day_tasks (с минутами) в одной транзакции.
func (rep *DayRepositoryImpl) CreateWithSlots(day *models.Day, slots []models.DayTask) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit(clause.Associations).Create(day).Error; err != nil {
			return fmt.Errorf("ошибка при создании дня: %w", err)
		}
		return insertSlots(tx, day.DayId, slots)
	})
}

// ReplaceSlots сохраняет поля дня и заменяет строки плана в одной транзакции:
// строки задач из keepTaskIDs остаются как есть, остальные удаляются, slots вставляются.
func (rep *DayRepositoryImpl) ReplaceSlots(day *models.Day, keepTaskIDs []int64, slots []models.DayTask) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(day).Select("TimeForTasks", "AmountOfTasks").Updates(day).Error; err != nil {
			return fmt.Errorf("ошибка при обновлении дня: %w", err)
		}
		remove := tx.Where("day_day_id = ?", day.DayId)
		if len(keepTaskIDs) > 0 {
			remove = remove.Where("task_task_id NOT IN ?", keepTaskIDs)
		}
		if err := remove.Delete(&models.DayTask{}).Error; err != nil {
			return fmt.Errorf("ошибка при удалении прежнего плана дня: %w", err)
		}
		return insertSlots(tx, day.DayId, slots)
	})
}

// DeleteWithSlots удаляет день вместе со строками плана.
// Строки удаляются явно, не полагаясь на ON DELETE CASCADE: в старых базах его может не быть.
func (rep *DayRepositoryImpl) DeleteWithSlots(dayID int64) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("day_day_id = ?", dayID).Delete(&models.DayTask{}).Error; err != nil {
			return fmt.Errorf("ошибка при удалении плана дня %d: %w", dayID, err)
		}
		if err := tx.Delete(&models.Day{}, dayID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении дня %d: %w", dayID, err)
		}
		return nil
	})
}

func insertSlots(tx *gorm.DB, dayID int64, slots []models.DayTask) error {
	if len(slots) == 0 {
		return nil
	}
	for i := range slots {
		slots[i].DayId = dayID
	}
	if err := tx.Create(&slots).Error; err != nil {
		return fmt.Errorf("ошибка при сохранении плана дня: %w", err)
	}
	return nil
}
