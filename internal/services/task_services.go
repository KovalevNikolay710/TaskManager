package services

import (
	"TaskManager/internal/models"
	rep "TaskManager/internal/repository"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

type TaskServiceImpl struct {
	TaskRepo  *rep.TaskRepositoryImpl
	GroupRepo *rep.GroupRepositoryImpl
	Logger    *slog.Logger
}

func NewTaskService(taskRepo *rep.TaskRepositoryImpl, groupRepo *rep.GroupRepositoryImpl, logger *slog.Logger) *TaskServiceImpl {
	return &TaskServiceImpl{TaskRepo: taskRepo, GroupRepo: groupRepo, Logger: logger}
}

func (serv TaskServiceImpl) CreateTask(input models.TaskCreateRequest) (task *models.Task, err error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrEmptyTaskName
	}

	now := time.Now()
	hours := models.HoursUntilDeadline(input.Deadline, now)
	if hours < models.MinHoursUntilDeadline {
		serv.Logger.Warn("Неверный дедлайн", slog.Int("hoursUntilDeadline", hours))
		return nil, ErrInvalidDeadline
	}

	var groupPriority uint64 = 1
	if input.GroupId != 0 {
		group, err := serv.findUserGroup(input.GroupId, input.UserID)
		if err != nil {
			return nil, err
		}
		groupPriority = group.GroupPriority
	}

	task = &models.Task{
		UserId:              input.UserID,
		GroupId:             input.GroupId,
		GroupPriority:       groupPriority,
		Name:                name,
		Description:         input.Description,
		Deadline:            input.Deadline,
		TimeForExecution:    input.TimeForExecution,
		PercentOfCompleting: input.PercentOfCompleting,
		Status:              models.StatusActive,
	}
	task.Recalculate(now)

	task, err = serv.TaskRepo.Create(task)
	if err != nil {
		return nil, fmt.Errorf("ошибка при записи задачи: %w", err)
	}

	serv.Logger.Info("Задача успешно сохранена в БД", slog.Group("task",
		slog.Int64("taskId", task.TaskId),
		slog.String("createdAt", task.CreatedAt.Format(time.RFC3339)),
	))

	return task, nil
}

// findUserGroup возвращает группу пользователя или ErrTaskGroupInvalid, если группы нет или она чужая.
func (serv TaskServiceImpl) findUserGroup(groupID, userID int64) (*models.Group, error) {
	group, err := serv.GroupRepo.FindUserGroup(userID, groupID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске группы: %w", err)
	}
	if group == nil {
		return nil, ErrTaskGroupInvalid
	}
	return group, nil
}

// UpdateTask применяет переданные поля (nil — не менять) к задаче с любым владельцем: REST-маршрут
// не передаёт userId. Для проверки владельца используйте UpdateTaskForUser.
func (serv TaskServiceImpl) UpdateTask(taskID int64, input models.TaskUpdateRequest) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByID(taskID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске задачи: %w", err)
	}
	return serv.applyUpdate(task, input)
}

// UpdateTaskForUser — UpdateTask с проверкой владельца: чужая или несуществующая задача — ErrTaskNotFound.
func (serv TaskServiceImpl) UpdateTaskForUser(userID, taskID int64, input models.TaskUpdateRequest) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByIDForUser(userID, taskID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске задачи: %w", err)
	}
	return serv.applyUpdate(task, input)
}

// applyUpdate меняет загруженную задачу (nil — не найдена), пересчитывает Tl от текущего времени
// и приоритет. Группа задачи (GroupId) сохраняется вместе с остальными полями.
func (serv TaskServiceImpl) applyUpdate(task *models.Task, input models.TaskUpdateRequest) (*models.Task, error) {
	if task == nil {
		return nil, ErrTaskNotFound
	}
	taskID := task.TaskId
	now := time.Now()

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrEmptyTaskName
		}
		task.Name = name
	}

	if input.Description != nil {
		task.Description = *input.Description
	}

	if input.TimeForExecution != nil {
		task.TimeForExecution = *input.TimeForExecution
	}

	if input.Deadline != nil {
		if models.HoursUntilDeadline(*input.Deadline, now) < models.MinHoursUntilDeadline {
			return nil, ErrInvalidDeadline
		}
		task.Deadline = *input.Deadline
	}

	// Инвариант: Status = 2 тогда и только тогда, когда выполнено 100%
	if input.PercentOfCompleting != nil {
		task.PercentOfCompleting = *input.PercentOfCompleting
		if task.PercentOfCompleting == 100 {
			task.Status = models.StatusCompleted
		} else {
			task.Status = models.StatusActive
		}
	}

	// Переданные 100% важнее статуса: противоречивый status=1 не переоткрывает задачу
	percentDone := input.PercentOfCompleting != nil && *input.PercentOfCompleting == 100
	if input.Status != nil && !percentDone {
		switch *input.Status {
		case models.StatusCompleted:
			task.Status = models.StatusCompleted
			task.PercentOfCompleting = 100
		case models.StatusActive:
			task.Status = models.StatusActive
			// Возвращённая в работу задача не может оставаться выполненной на 100%:
			// берём переданный процент (< 100) или сбрасываем в 0
			if task.PercentOfCompleting >= 100 {
				task.PercentOfCompleting = 0
			}
		}
	}

	if input.GroupId != nil && *input.GroupId != task.GroupId {
		task.GroupId = *input.GroupId
		task.GroupPriority = 1
		if task.GroupId != 0 {
			group, err := serv.findUserGroup(task.GroupId, task.UserId)
			if err != nil {
				return nil, err
			}
			task.GroupPriority = group.GroupPriority
		}
	}

	task.Recalculate(now)
	task.UpdatedAt = now

	updatedTask, err := serv.TaskRepo.UpdateFields(task)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении задачи: %w", err)
	}

	serv.Logger.Info("Задача успешно обновлена", slog.Int64("taskId", taskID))

	return updatedTask, nil
}

// DeleteTask удаляет задачу вместе с её связями в планах дней и в группе.
func (serv TaskServiceImpl) DeleteTask(taskID int64) error {
	task, err := serv.TaskRepo.FindByID(taskID)
	if err != nil {
		return fmt.Errorf("ошибка при поиске задачи: %w", err)
	}
	return serv.deleteLoaded(task)
}

// DeleteTaskForUser — DeleteTask с проверкой владельца: чужая или несуществующая задача — ErrTaskNotFound.
func (serv TaskServiceImpl) DeleteTaskForUser(userID, taskID int64) error {
	task, err := serv.TaskRepo.FindByIDForUser(userID, taskID)
	if err != nil {
		return fmt.Errorf("ошибка при поиске задачи: %w", err)
	}
	return serv.deleteLoaded(task)
}

func (serv TaskServiceImpl) deleteLoaded(task *models.Task) error {
	if task == nil {
		return ErrTaskNotFound
	}
	if err := serv.TaskRepo.DeleteWithLinks(task.TaskId); err != nil {
		return fmt.Errorf("ошибка при удалении задачи: %w", err)
	}
	serv.Logger.Info("Задача удалена", slog.Int64("taskId", task.TaskId))
	return nil
}

// GetById возвращает задачу с любым владельцем или ErrTaskNotFound.
func (serv *TaskServiceImpl) GetById(taskId int64) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByID(taskId)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении задачи: %w", err)
	}
	if task == nil {
		return nil, ErrTaskNotFound
	}
	return task, nil
}

// GetTaskForUser возвращает задачу пользователя; чужая или несуществующая — ErrTaskNotFound.
func (serv *TaskServiceImpl) GetTaskForUser(userID, taskID int64) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByIDForUser(userID, taskID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении задачи: %w", err)
	}
	if task == nil {
		return nil, ErrTaskNotFound
	}
	return task, nil
}

func (serv TaskServiceImpl) GetTasksByUserID(userId int64, filters models.TaskFilter) ([]*models.Task, error) {
	tasks, err := serv.TaskRepo.FindByUserID(userId, filters)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске задач по userId: %w", err)
	}
	return tasks, nil
}
