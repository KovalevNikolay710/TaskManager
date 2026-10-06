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

type TaskRepositoryImpl interface {
	Create(task *models.Task) (*models.Task, error)
	FindByID(taskID int64) (*models.Task, error)
	Update(task *models.Task) (*models.Task, error)
	Delete(taskID int64) error
	FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error)
}

func (serv TaskServiceImpl) CreateTask(input models.TaskCreateRequest) (task *models.Task, err error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrEmptyTaskName
	}

	hours := hoursUntilDeadline(input.DeadLine, time.Now())
	if hours < minHoursUntilDeadline {
		serv.Logger.Warn("Неверный дедлайн", slog.Int("hoursUntilDeadline", hours))
		return nil, ErrInvalidDeadline
	}

	var groupPriorty uint64 = 1
	if input.GroupId != 0 {
		group, err := serv.findUserGroup(input.GroupId, input.UserID)
		if err != nil {
			return nil, err
		}
		groupPriorty = group.GroupPriority
	}

	task = &models.Task{
		UserId:               input.UserID,
		GroupId:              input.GroupId,
		GroupPriorty:         groupPriorty,
		Name:                 name,
		Description:          input.Description,
		DeadLine:             input.DeadLine,
		TimeForExecution:     input.TimeForExecution,
		PercentOfCompleting:  input.PercentOfCompleting,
		NumberOfHoursUntilDL: hours,
		Status:               models.StatusActive,
	}
	calculateTaskPriorty(task)

	task, err = serv.TaskRepo.CreateInGroup(task)
	if err != nil {
		serv.Logger.Error("Ошибка при записи задачи в БД", slog.String("error", err.Error()))
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
	group, err := serv.GroupRepo.FindByID(groupID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске группы: %w", err)
	}
	if group == nil || group.UserId != userID {
		serv.Logger.Warn("Группа задачи не найдена или принадлежит другому пользователю",
			slog.Int64("groupId", groupID), slog.Int64("userId", userID))
		return nil, ErrTaskGroupInvalid
	}
	return group, nil
}

// minHoursUntilDeadline — новый дедлайн должен быть не раньше чем через час:
// Tl считается в целых часах и стоит в знаменателе формулы.
const minHoursUntilDeadline = 1

// hoursUntilDeadline — целые часы от now до дедлайна (Tl); для прошедшего дедлайна — 0 или меньше.
func hoursUntilDeadline(deadline, now time.Time) int {
	return int(deadline.Sub(now).Hours())
}

// calculateTaskPriorty считает приоритет задачи: Pt = Pg * Te / Tl * %in.
func calculateTaskPriorty(task *models.Task) {
	task.Priority = float64(task.GroupPriorty) * float64(task.TimeForExecution) / float64(task.NumberOfHoursUntilDL) * float64(100-task.PercentOfCompleting) / float64(100)
}

// refreshTaskPriorty пересчитывает Tl от текущего времени и приоритет задачи.
// Для просроченной задачи (и задачи, до дедлайна которой меньше часа) Tl = 1:
// приоритет максимальный для её параметров и без деления на ноль.
func refreshTaskPriorty(task *models.Task, now time.Time) {
	task.NumberOfHoursUntilDL = max(hoursUntilDeadline(task.DeadLine, now), minHoursUntilDeadline)
	calculateTaskPriorty(task)
}

// UpdateTask применяет переданные поля (nil — не менять), пересчитывает Tl от текущего времени
// и приоритет. Смена группы и связь в group_tasks сохраняются вместе с задачей в одной транзакции.
func (serv TaskServiceImpl) UpdateTask(taskID int64, input models.TaskUpdateRequest) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByID(taskID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске задачи: %w", err)
	}
	if task == nil {
		return nil, ErrTaskNotFound
	}
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

	if input.DeadLine != nil {
		if hoursUntilDeadline(*input.DeadLine, now) < minHoursUntilDeadline {
			return nil, ErrInvalidDeadline
		}
		task.DeadLine = *input.DeadLine
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

	if input.Status != nil {
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

	groupChanged := input.GroupId != nil && *input.GroupId != task.GroupId
	if groupChanged {
		task.GroupId = *input.GroupId
		task.GroupPriorty = 1
		if task.GroupId != 0 {
			group, err := serv.findUserGroup(task.GroupId, task.UserId)
			if err != nil {
				return nil, err
			}
			task.GroupPriorty = group.GroupPriority
		}
	}

	refreshTaskPriorty(task, now)
	task.UpdatedAt = now

	updatedTask, err := serv.TaskRepo.UpdateWithGroup(task, groupChanged)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении задачи: %w", err)
	}

	serv.Logger.Info("Задача успешно обновлена", slog.Int64("taskID", taskID), slog.Any("updatedTask", updatedTask))

	return updatedTask, nil
}

// DeleteTask удаляет задачу вместе с её связями в планах дней и в группе.
func (serv TaskServiceImpl) DeleteTask(taskID int64) error {
	task, err := serv.TaskRepo.FindByID(taskID)
	if err != nil {
		return fmt.Errorf("ошибка при поиске задачи: %w", err)
	}
	if task == nil {
		return ErrTaskNotFound
	}
	if err := serv.TaskRepo.DeleteWithLinks(taskID); err != nil {
		return fmt.Errorf("ошибка при удалении задачи: %w", err)
	}
	serv.Logger.Info("Задача удалена", slog.Int64("taskId", taskID))
	return nil
}

func (serv *TaskServiceImpl) GetById(taskId int64) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByID(taskId)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении задачи: %w", err)
	}

	if task == nil {
		return nil, nil
	}

	return task, nil
}

func (serv TaskServiceImpl) GetTasksByUserID(userId int64, filters models.TaskFilter) ([]*models.Task, error) {
	tasks, err := serv.TaskRepo.FindByUserID(userId, filters)
	if err != nil {
		return nil, fmt.Errorf("ошибка поиске задач по userId: %s", err)
	}
	return tasks, nil
}
