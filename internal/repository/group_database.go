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
	var group models.Group
	if err := rep.db.Preload("Tasks").First(&group, groupId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("день с ID %d не найден", groupId)
		}
		return nil, fmt.Errorf("ошибка при поиске задач для дня: %w", err)
	}
	return group.Tasks, nil
}
