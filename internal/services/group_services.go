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
	TaskService     *TaskServiceImpl
}

func NewGroupService(groupRepo *repository.GroupRepositoryImpl, taskRepo *repository.TaskRepositoryImpl, taskServ *TaskServiceImpl) *GroupServiceImpl {
	return &GroupServiceImpl{
		GroupRepository: groupRepo,
		TaskRepository:  taskRepo,
		TaskService:     taskServ,
	}
}

func (service *GroupServiceImpl) CreateGroup(input models.GroupCreateRequest) (createdGroup *models.Group, err error) {

	if input.GroupPriority < 0 {
		return nil, fmt.Errorf("неверное значение groupId: %w", err)
	}

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

func (s *GroupServiceImpl) UpdateGroup(groupId int64, input models.GroupUpdateRequest) (updatedGroup *models.Group, err error) {

	group, err := s.GroupRepository.FindByID(groupId)
	if err != nil {
		return nil, fmt.Errorf("не удалось найти группу: %w", err)
	}

	if input.GroupPriority > 0 {
		group.GroupPriority = input.GroupPriority
		for _, task := range group.Tasks {
			updateTask := &models.TaskUpdateRequest{
				GroupPriority: group.GroupPriority,
			}

			_, err := s.TaskService.UpdateTask(task.TaskId, *updateTask)
			if err != nil {
				return nil, fmt.Errorf("ошибка при обновлении задачи с ID %d: %w", task.TaskId, err)
			}
		}
	}

	if input.Name != "" {
		group.Name = input.Name
	}

	if input.Description != "" {
		group.Description = input.Description
	}

	if input.Task != nil {
		group.Tasks = append(group.Tasks, input.Task)
	}

	updatedGroup, err = s.GroupRepository.Update(group)
	if err != nil {
		return nil, fmt.Errorf("не удалось обновить данные группы: %w", err)
	}

	return updatedGroup, nil
}

func (serv *GroupServiceImpl) GetAllGroupTasks(groupId int64) ([]*models.Task, error) {
	tasks, err := serv.GroupRepository.GetAllTasksInGroup(groupId)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении всех задач в группе: %w", err)
	}
	return tasks, nil
}

func (serv *GroupServiceImpl) GetAllUserGroups(userID int64) (groups []*models.Group, err error) {
	groups, err = serv.GroupRepository.GetAllUserGroups(userID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении всех групп пользователя: %w", err)
	}
	return groups, nil
}
