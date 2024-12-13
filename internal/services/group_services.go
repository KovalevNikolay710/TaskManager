package services

import (
	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"fmt"
)

type GroupRepositoryImpl interface {
	Create(group *models.Group) (*models.Group, error)
	FindByID(groupID int64) (*models.Group, error)
	Update(group *models.Group) (*models.Group, error)
	Delete(groupID int64) error
	FindByUserID(userID int64) ([]*models.Group, error)
	GetAllTasksInGroup(groupID int64) ([]*models.Task, error)
}

type GroupServiceImpl struct {
	GroupRepository *repository.GroupRepositoryImpl
	TaskRepository  *repository.TaskRepositoryImpl
}

func NewGroupService(groupRepo *repository.GroupRepositoryImpl, taskRepo *repository.TaskRepositoryImpl) *GroupServiceImpl {
	return &GroupServiceImpl{
		GroupRepository: groupRepo,
		TaskRepository:  taskRepo,
	}
}

func (service GroupServiceImpl) CreateGroup(input models.GroupCreateRequest) (createdGroup *models.Group, err error) {

	group := &models.Group{
		UserId:        input.UserId,
		GroupPriority: input.GroupPriority,
		Name:          input.Name,
		Description:   input.Description,
	}

	createdGroup, err = service.GroupRepository.Create(group)
	if err != nil {
		return nil, fmt.Errorf("не удалось создать группу: %w", err)
	}

	return createdGroup, err
}

func (service GroupServiceImpl) UpdateGroup(groupId int64, input models.GroupUpdateRequest) (updatedGroup *models.Group, err error) {
	group, err := service.GroupRepository.FindByID(groupId)
	if err != nil {
		return nil, fmt.Errorf("не удалось найти группу: %w", err)
	}
	if input.Priority != 0 {
		group.GroupPriority = input.Priority
	}
	if input.Name != "" {
		group.Name = input.Name
	}
	if input.Description != "" {
		group.Description = input.Description
	}
	if input.Name != "" {
		group.Name = input.Name
	}

	updatedGroup, err = service.GroupRepository.Update(group)
	if err != nil {
		return nil, fmt.Errorf("не удалось обновить данные группы: %w", err)
	}
	return updatedGroup, nil
}

func (serv *GroupServiceImpl) GetAllGroupTasks(groupId int64) ([]*models.Task, error) {
	group, err := serv.GroupRepository.GenericRepository.FindByID(groupId)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении всех задач в группе: %w", err)
	}
	return group.Tasks, nil
}

func (serv *GroupServiceImpl) GetAllUserGroups(userID int64) (groups []*models.Group, err error) {
	groups, err = serv.GroupRepository.GetAllUserGroups(userID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении всех групп пользователя: %w", err)
	}
	return groups, nil
}
