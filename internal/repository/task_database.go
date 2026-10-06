package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type TaskRepositoryImpl struct {
	*GenericRepository[models.Task]
}

func NewTaskRepository(db *gorm.DB) *TaskRepositoryImpl {
	return &TaskRepositoryImpl{
		GenericRepository: NewGenericRepository[models.Task](db),
	}
}

// FindByIDForUser возвращает задачу пользователя или nil, nil, если задачи нет или она чужая.
func (r *TaskRepositoryImpl) FindByIDForUser(userID, taskID int64) (*models.Task, error) {
	var task models.Task

	if err := r.db.Where("user_id = ?", userID).First(&task, taskID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}

		return nil, fmt.Errorf("ошибка при поиске задачи пользователя в базе данных: %w", err)
	}

	return &task, nil
}

// FindByUserID возвращает задачи пользователя; filter.Date — только задачи с дедлайном строго позже этой даты.
func (r *TaskRepositoryImpl) FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error) {
	var tasks []*models.Task

	query := r.db.Where("user_id = ?", userID)

	if filter.Status != 0 {
		query = query.Where("status = ?", filter.Status)
	}

	if filter.GroupId != 0 {
		query = query.Where("group_id = ?", filter.GroupId)
	}

	if !filter.Date.IsZero() {
		query = query.Where("deadline > ?", filter.Date)
	}

	if err := query.Find(&tasks).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске по фильтру задач в базе данных: %w", err)
	}

	return tasks, nil
}

// taskUpdateFields — поля, которые меняет обновление задачи. Select нужен, чтобы записать и нулевые значения
// (GroupId = 0, PercentOfCompleting = 0), а остальные колонки (UserId, CreatedAt) не трогать.
func taskUpdateFields() []string {
	return []string{
		"Name", "Description", "Deadline", "TimeForExecution", "PercentOfCompleting", "Status",
		"GroupId", "GroupPriority", "HoursUntilDeadline", "Priority", "UpdatedAt",
	}
}

// UpdateFields сохраняет поля задачи из taskUpdateFields, в том числе нулевые значения.
func (r *TaskRepositoryImpl) UpdateFields(task *models.Task) (*models.Task, error) {
	if err := r.db.Model(task).Select(taskUpdateFields()).Updates(task).Error; err != nil {
		return nil, fmt.Errorf("ошибка при обновлении задачи: %w", err)
	}
	return task, nil
}

// DeleteWithLinks удаляет задачу вместе с её строками в планах дней (day_tasks) в одной транзакции.
// Строки удаляются явно, не полагаясь на ON DELETE CASCADE: в старых базах его может не быть.
func (r *TaskRepositoryImpl) DeleteWithLinks(taskID int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM day_tasks WHERE task_task_id = ?", taskID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении задачи %d из планов дней: %w", taskID, err)
		}
		if err := tx.Delete(&models.Task{}, taskID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении задачи %d: %w", taskID, err)
		}
		return nil
	})
}
