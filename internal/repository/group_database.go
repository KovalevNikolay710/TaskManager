package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type GroupRepositoryImpl struct {
	*GenericRepository[models.Group]
}

func NewGroupRepository(db *gorm.DB) *GroupRepositoryImpl {
	return &GroupRepositoryImpl{
		GenericRepository: NewGenericRepository[models.Group](db),
	}
}

func (rep *GroupRepositoryImpl) GetAllUserGroups(userID int64) ([]*models.Group, error) {
	var groups []*models.Group
	query := rep.db.Where("user_id = ?", userID)

	if err := query.Find(&groups).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске групп в базе данных: %s", err)
	}
	return groups, nil
}

func (rep GroupRepositoryImpl) GetAllTasksInGroup(groupId int64) ([]*models.Task, error) {
	var tasks []*models.Task
	if err := rep.db.Where("group_id = ?", groupId).Find(&tasks).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("задачи для группы с ID %d не найдены", groupId)
		}
		return nil, fmt.Errorf("ошибка при поиске задач для группы: %w", err)
	}
	return tasks, nil
}
