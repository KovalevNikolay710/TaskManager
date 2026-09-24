package services

import (
	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"fmt"
	"strings"
	"time"
)

type GroupRepositoryImpl interface {
	Create(group *models.Group) (*models.Group, error)
	FindByID(groupID int64) (*models.Group, error)
	Update(group *models.Group) (*models.Group, error)
	Delete(groupID int64) error
	FindByUserID(userID int64) ([]*models.Group, error)
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
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrEmptyGroupName
	}
	if err := service.checkNameFree(input.UserId, name, 0); err != nil {
		return nil, err
	}

	group := &models.Group{
		UserId:        input.UserId,
		GroupPriority: input.GroupPriority,
		Name:          name,
		Description:   input.Description,
	}

	createdGroup, err = service.GroupRepository.Create(group, "Tasks")
	if err != nil {
		return nil, fmt.Errorf("не удалось создать группу: %w", err)
	}

	return createdGroup, nil
}

// checkNameFree возвращает ErrGroupNameTaken, если у пользователя уже есть группа с таким названием
// (без учёта регистра и пробелов по краям); excludeID — группа, которую не учитывать.
func (service *GroupServiceImpl) checkNameFree(userID int64, name string, excludeID int64) error {
	exists, err := service.GroupRepository.ExistsByName(userID, name, excludeID)
	if err != nil {
		return fmt.Errorf("не удалось проверить название группы: %w", err)
	}
	if exists {
		return ErrGroupNameTaken
	}
	return nil
}

// GetGroupByID возвращает группу с задачами или ErrGroupNotFound.
func (service *GroupServiceImpl) GetGroupByID(groupId int64) (*models.Group, error) {
	group, err := service.GroupRepository.FindByID(groupId)
	if err != nil {
		return nil, fmt.Errorf("не удалось найти группу: %w", err)
	}
	if group == nil {
		return nil, ErrGroupNotFound
	}
	return group, nil
}

// UpdateGroup применяет переданные поля (nil — не менять). При смене веса пересчитывает
// GroupPriorty и Priority задач группы; группа и задачи сохраняются в одной транзакции.
func (s *GroupServiceImpl) UpdateGroup(groupId int64, input models.GroupUpdateRequest) (updatedGroup *models.Group, err error) {
	group, err := s.GetGroupByID(groupId)
	if err != nil {
		return nil, err
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrEmptyGroupName
		}
		if err := s.checkNameFree(group.UserId, name, groupId); err != nil {
			return nil, err
		}
		group.Name = name
	}

	if input.Description != nil {
		group.Description = *input.Description
	}

	var tasks []*models.Task
	if input.GroupPriority != nil && *input.GroupPriority != group.GroupPriority {
		group.GroupPriority = *input.GroupPriority
		// Задачи группы берём по Task.GroupId — это то, что видит пользователь
		tasks, err = s.TaskRepository.FindByUserID(group.UserId, models.TaskFilter{GroupId: groupId})
		if err != nil {
			return nil, fmt.Errorf("не удалось получить задачи группы: %w", err)
		}
		now := time.Now()
		for _, task := range tasks {
			task.GroupPriorty = group.GroupPriority
			refreshTaskPriorty(task, now)
		}
	}

	if err := s.GroupRepository.UpdateWithTasks(group, tasks); err != nil {
		return nil, fmt.Errorf("не удалось обновить данные группы: %w", err)
	}

	return s.GetGroupByID(groupId)
}

// GetAllGroupTasks возвращает задачи группы (по group_tasks) или ErrGroupNotFound.
func (serv *GroupServiceImpl) GetAllGroupTasks(groupId int64) ([]*models.Task, error) {
	group, err := serv.GetGroupByID(groupId)
	if err != nil {
		return nil, err
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

// AddTaskToGroup создаёт задачу сразу в группе: Task.GroupId и связь в group_tasks выставляются вместе.
func (s *GroupServiceImpl) AddTaskToGroup(groupId int64, input models.TaskCreateRequest) (*models.Group, error) {
	group, err := s.GetGroupByID(groupId)
	if err != nil {
		return nil, err
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
	group, err := s.GetGroupByID(groupId)
	if err != nil {
		return err
	}

	tasks, err := s.TaskRepository.FindByUserID(group.UserId, models.TaskFilter{GroupId: groupId})
	if err != nil {
		return fmt.Errorf("не удалось получить задачи группы: %w", err)
	}
	now := time.Now()
	for _, task := range tasks {
		task.GroupId = 0
		task.GroupPriorty = 1
		refreshTaskPriorty(task, now)
	}

	if err := s.GroupRepository.DeleteDetachingTasks(groupId, tasks); err != nil {
		return fmt.Errorf("не удалось удалить группу: %w", err)
	}
	return nil
}
