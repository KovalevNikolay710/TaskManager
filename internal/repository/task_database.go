package repository

import (
	"TaskManager/internal/models"
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

func (r *TaskRepositoryImpl) FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error) {
	var tasks []*models.Task
	query := r.db.Where("user_id = ?", userID)

	if filter.Status != 0 {
		query = query.Where("status = ?", filter.Status)
	}

	if err := query.Find(&tasks).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске по фильтру задач в базе данных: %s", err)
	}

	if !filter.Date.IsZero() {
		var filteredTasks []*models.Task
		for _, task := range tasks {
			if task.DeadLine.After(filter.Date) || task.DeadLine.Equal(filter.Date) {
				filteredTasks = append(filteredTasks, task)
			}
		}
		tasks = filteredTasks
	}

	return tasks, nil
}
