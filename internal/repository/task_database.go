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

func (r *TaskRepositoryImpl) FindByID(taskId int64) (*models.Task, error) {
	var task models.Task

	if err := r.db.First(&task, taskId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}

		return nil, fmt.Errorf("ошибка при поиске задачи в базе данных: %w", err)
	}

	return &task, nil
}

func (r *TaskRepositoryImpl) FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error) {
	var tasks []*models.Task

	query := r.db.Where("user_id = ?", userID)

	if filter.Status != 0 {
		query = query.Where("status = ?", filter.Status)
	}

	if filter.GroupId != 0 {
		query = query.Where("group_id = ?", filter.GroupId)
	}

	if err := query.Find(&tasks).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске по фильтру задач в базе данных: %s", err)
	}

	if !filter.Date.IsZero() {
		var filteredTasks []*models.Task
		for _, task := range tasks {
			if task.DeadLine.After(filter.Date) {
				filteredTasks = append(filteredTasks, task)
			}
		}
		tasks = filteredTasks
	}

	return tasks, nil
}

// CreateInGroup создаёт задачу и, если GroupId != 0, связь в group_tasks — в одной транзакции,
// чтобы Task.GroupId и состав группы не расходились.
func (r *TaskRepositoryImpl) CreateInGroup(task *models.Task) (*models.Task, error) {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(task).Error; err != nil {
			return fmt.Errorf("ошибка при создании задачи: %w", err)
		}
		if task.GroupId == 0 {
			return nil
		}
		group := &models.Group{GroupId: task.GroupId}
		if err := tx.Model(group).Association("Tasks").Append(task); err != nil {
			return fmt.Errorf("ошибка при добавлении задачи в группу %d: %w", task.GroupId, err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return task, nil
}

// UpdateWithGroup сохраняет задачу; если groupChanged — заменяет её связь в group_tasks
// на task.GroupId (0 — без связи). Всё в одной транзакции, чтобы Task.GroupId и состав группы не расходились.
func (r *TaskRepositoryImpl) UpdateWithGroup(task *models.Task, groupChanged bool) (*models.Task, error) {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(task).Error; err != nil {
			return fmt.Errorf("ошибка при обновлении задачи: %w", err)
		}
		if !groupChanged {
			return nil
		}
		if err := tx.Exec("DELETE FROM group_tasks WHERE task_task_id = ?", task.TaskId).Error; err != nil {
			return fmt.Errorf("ошибка при удалении связи задачи %d с группой: %w", task.TaskId, err)
		}
		if task.GroupId == 0 {
			return nil
		}
		if err := tx.Exec("INSERT INTO group_tasks (group_group_id, task_task_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
			task.GroupId, task.TaskId).Error; err != nil {
			return fmt.Errorf("ошибка при добавлении задачи %d в группу %d: %w", task.TaskId, task.GroupId, err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return task, nil
}

// DeleteWithLinks удаляет задачу вместе с её связями в day_tasks и group_tasks в одной транзакции.
// Связи удаляются явно, не полагаясь на ON DELETE CASCADE: в старых базах его может не быть.
func (r *TaskRepositoryImpl) DeleteWithLinks(taskID int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM day_tasks WHERE task_task_id = ?", taskID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении задачи %d из планов дней: %w", taskID, err)
		}
		if err := tx.Exec("DELETE FROM group_tasks WHERE task_task_id = ?", taskID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении связи задачи %d с группой: %w", taskID, err)
		}
		if err := tx.Delete(&models.Task{}, taskID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении задачи %d: %w", taskID, err)
		}
		return nil
	})
}
