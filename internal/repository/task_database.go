package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type TaskRepository interface {
	Create(task *models.Task) (*models.Task, error)
	FindByID(taskID int64) (*models.Task, error)
	Update(task *models.Task) (*models.Task, error)
	Delete(taskID int64) error
	FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error)
}

type TaskRepositoryImpl struct {
	db *gorm.DB
}

func NewTaskRepository(db *gorm.DB) *TaskRepositoryImpl {
	return &TaskRepositoryImpl{db: db}
}

func (r *TaskRepositoryImpl) Create(task *models.Task) (*models.Task, error) {
	if err := r.db.Create(task).Error; err != nil {
		return nil, err
	}
	return task, nil
}

func (r *TaskRepositoryImpl) FindByID(taskID int64) (*models.Task, error) {
	var task models.Task
	if err := r.db.First(&task, taskID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // Возвращаем nil вместо ошибки, если запись не найдена
		}
		return nil, err
	}
	return &task, nil
}

// Update — обновляет существующую задачу
func (r *TaskRepositoryImpl) Update(task *models.Task) (*models.Task, error) {
	if err := r.db.Save(task).Error; err != nil {
		return nil, err
	}
	return task, nil
}

func (r *TaskRepositoryImpl) Delete(taskId int) error {
	if err := r.db.Delete(&models.Task{}, taskId).Error; err != nil {
		return fmt.Errorf("ошибка при удалении таски по id: %s", err)
	}
	return nil
}

func (r *TaskRepositoryImpl) FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error) {
	var tasks []*models.Task
	query := r.db.Where("user_id = ?", userID)

	// Применяем фильтры, если они заданы
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if err := query.Find(&tasks).Error; err != nil {
		return nil, err
	}
	return tasks, nil
}
