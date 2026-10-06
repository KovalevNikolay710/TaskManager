package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"
	"time"

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

// ErrDayNotFound — дня с таким id нет (возвращает UpdateWithPlan).
var ErrDayNotFound = errors.New("день не найден")

// CreateWithPlan создаёт день в одной транзакции: plan читает задачи через репозиторий этой же транзакции
// и возвращает слоты плана, затем сохраняются день (AmountOfTasks = len(slots)) и строки day_tasks.
// Ошибка plan возвращается как есть.
func (rep *DayRepositoryImpl) CreateWithPlan(day *models.Day, plan func(tasks *TaskRepositoryImpl) ([]models.DayTask, error)) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		slots, err := plan(NewTaskRepository(tx))
		if err != nil {
			return err
		}
		day.AmountOfTasks = len(slots)
		if err := tx.Omit(clause.Associations).Create(day).Error; err != nil {
			return fmt.Errorf("ошибка при создании дня: %w", err)
		}
		return insertSlots(tx, day.DayId, slots)
	})
}

// UpdateWithPlan пересобирает день в одной транзакции. Строка дня блокируется (FOR UPDATE), поэтому
// параллельные пересборки одного дня идут по очереди. plan получает актуальный день с задачами и слотами
// и репозиторий задач этой транзакции; возвращает id задач, чьи строки плана остаются как есть,
// и новые слоты. Ошибка plan возвращается как есть. Если дня нет — ErrDayNotFound.
func (rep *DayRepositoryImpl) UpdateWithPlan(dayID int64,
	plan func(day *models.Day, tasks *TaskRepositoryImpl) (keepTaskIDs []int64, slots []models.DayTask, err error)) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		var day models.Day
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Tasks").Preload("Slots").First(&day, dayID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDayNotFound
			}
			return fmt.Errorf("ошибка при чтении дня %d: %w", dayID, err)
		}
		keepTaskIDs, slots, err := plan(&day, NewTaskRepository(tx))
		if err != nil {
			return err
		}
		if err := tx.Model(&day).Select("TimeForTasks", "AmountOfTasks").Updates(&day).Error; err != nil {
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

// FindByUserAndDateRange возвращает дни пользователя с Date в [from, to) вместе с задачами плана.
func (rep *DayRepositoryImpl) FindByUserAndDateRange(userID int64, from, to time.Time) ([]*models.Day, error) {
	var days []*models.Day
	if err := rep.db.Where("user_id = ? AND date >= ? AND date < ?", userID, from, to).
		Preload("Tasks").Preload("Slots").Find(&days).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске дней пользователя %d: %w", userID, err)
	}
	return days, nil
}
