package services

import (
	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"errors"
	"fmt"
)

var (
	// ErrGroupNotFound — группы с таким ID нет
	ErrGroupNotFound = errors.New("группа не найдена")
	// ErrGroupOwner — группа принадлежит другому пользователю
	ErrGroupOwner = errors.New("группа принадлежит другому пользователю")
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

	createdGroup, err = service.GroupRepository.Create(group, "Tasks")
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
	if group == nil {
		return nil, ErrGroupNotFound
	}

	if input.GroupPriority > 0 {
		group.GroupPriority = input.GroupPriority
		// Задачи группы берём по Task.GroupId — это то, что видит пользователь
		tasks, err := s.TaskRepository.FindByUserID(group.UserId, models.TaskFilter{GroupId: groupId})
		if err != nil {
			return nil, fmt.Errorf("не удалось получить задачи группы: %w", err)
		}
		for _, task := range tasks {
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

	// Состав группы меняется только через задачи (CreateTask / AddTaskToGroup), Save связи не трогает
	group.Tasks = nil

	updatedGroup, err = s.GroupRepository.Update(group, "Tasks")
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

// AddTaskToGroup создаёт задачу сразу в группе: Task.GroupId и связь в group_tasks выставляются вместе.
func (s *GroupServiceImpl) AddTaskToGroup(groupId int64, input models.TaskCreateRequest) (*models.Group, error) {
	group, err := s.GroupRepository.FindByID(groupId)
	if err != nil {
		return nil, fmt.Errorf("не удалось найти группу: %w", err)
	}
	if group == nil {
		return nil, ErrGroupNotFound
	}
	if group.UserId != input.UserID {
		return nil, ErrGroupOwner
	}

	input.GroupId = groupId
	if _, err := s.TaskService.CreateTask(input); err != nil {
		return nil, fmt.Errorf("не удалось создать задачу в группе: %w", err)
	}

	group, err = s.GroupRepository.FindByID(groupId)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить группу после добавления задачи: %w", err)
	}
	return group, nil
}

// DeleteGroup удаляет группу, а её задачи переводит в «Без группы»: GroupId = 0,
// множитель группы — 1 (как у новой задачи без группы), приоритет пересчитывается.
func (s *GroupServiceImpl) DeleteGroup(groupId int64) error {
	group, err := s.GroupRepository.FindByID(groupId)
	if err != nil {
		return fmt.Errorf("не удалось найти группу: %w", err)
	}
	if group == nil {
		return ErrGroupNotFound
	}

	tasks, err := s.TaskRepository.FindByUserID(group.UserId, models.TaskFilter{GroupId: groupId})
	if err != nil {
		return fmt.Errorf("не удалось получить задачи группы: %w", err)
	}
	for _, task := range tasks {
		task.GroupId = 0
		task.GroupPriorty = 1
		if err := s.TaskService.calculateTaskPriorty(task); err != nil {
			return fmt.Errorf("ошибка при расчёте приоритета задачи %d: %w", task.TaskId, err)
		}
	}

	if err := s.GroupRepository.DeleteDetachingTasks(groupId, tasks); err != nil {
		return fmt.Errorf("не удалось удалить группу: %w", err)
	}
	return nil
}
