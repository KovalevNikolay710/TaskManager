package services

import (
	"TaskManager/internal/models"
	rep "TaskManager/internal/repository"
	"fmt"
	"log/slog"
	"time"
)

type TaskServiceImpl struct {
	TaskRepo *rep.TaskRepositoryImpl
	Logger   *slog.Logger
}

func NewTaskService(taskRepo *rep.TaskRepositoryImpl, logger *slog.Logger) *TaskServiceImpl {
	return &TaskServiceImpl{TaskRepo: taskRepo, Logger: logger}
}

type TaskRepositoryImpl interface {
	Create(task *models.Task) (*models.Task, error)
	FindByID(taskID int64) (*models.Task, error)
	Update(task *models.Task) (*models.Task, error)
	Delete(taskID int64) error
	FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error)
}

func (serv TaskServiceImpl) CreateTask(input models.TaskCreateRequest) (task *models.Task, err error) {

	if input.PercentOfCompleting == 100 {
		return nil, fmt.Errorf("новая задача не может быть выполненна на 100%")
	}

	dl, err := serv.countWorkHoursForDeadLine(input.DeadLine)
	if err != nil {
		serv.Logger.Error("Ошибка в countWorkHoursForDeadLine", slog.String("error", err.Error()))
		return nil, fmt.Errorf("ошибка расчёта дедлайна: %w", err)
	}

	if dl <= 0 {
		serv.Logger.Warn("Неверный дедлайн", slog.Int("workHours", dl))
		return nil, fmt.Errorf("неверный дедлайн")
	}

	//TODO: write get group priorty by GroupId

	task = &models.Task{
		UserId:               input.UserID,
		GroupId:              input.GroupID,
		Description:          input.Description,
		DeadLine:             input.DeadLine,
		TimeForExecution:     input.TimeForExecution,
		PercentOfCompleting:  input.PercentOfCompleting,
		NumberOfHoursUntilDL: dl,
	}

	err = serv.calculateTaskPriorty(task)
	if err != nil {
		serv.Logger.Error("Ошибка при расчёте приоритета задачи", slog.String("error", err.Error()))
		return nil, fmt.Errorf("ошибка при расчёте приоритета задачи: %w", err)
	}

	task, err = serv.TaskRepo.Create(task)
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

func (serv TaskServiceImpl) calculateTaskPriorty(task *models.Task) error {
	task.Priority = float64(task.GroupId) * float64(task.TimeForExecution) / float64(task.NumberOfHoursUntilDL) * float64(100-task.PercentOfCompleting) / float64(100)
	return nil
}

func (serv TaskServiceImpl) countWorkHoursForDeadLine(deadline time.Time) (hours int, err error) {
	difference := deadline.Sub(time.Now())

	if difference <= 0 && difference <= time.Hour*24 {
		return 0, fmt.Errorf("неверная дата.")
	}
	hours = int(difference.Hours())
	return hours, nil
}

func (serv TaskServiceImpl) UpdateTask(taskID int64, input models.TaskUpdateRequest) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByID(taskID)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске задачи: %s", err)
	}
	if input.PercentOfCompleting == 100 {
		task.PercentOfCompleting = input.PercentOfCompleting
		task.Status = models.StatusCompleted
	}
	if input.PercentOfCompleting > 0 {
		task.PercentOfCompleting = input.PercentOfCompleting
	}
	err = serv.calculateTaskPriorty(task)
	if err != nil {
		return nil, fmt.Errorf("ошибка при расчёте приоритета задачи: %s", err)
	}
	task.UpdatedAt = time.Now()

	task, err = serv.TaskRepo.Update(task)
	if err != nil {
		return nil, fmt.Errorf("ошибка при обновлении задачи: %s", err)
	}
	return task, nil
}

func (serv TaskServiceImpl) DeleteTask(taskId int64) error {
	if err := serv.TaskRepo.Delete(taskId); err != nil {
		return fmt.Errorf("ошибка при удалении задачи: %s", err)
	}
	return nil
}

func (serv TaskServiceImpl) GetTaskByID(taskId int64) (*models.Task, error) {
	task, err := serv.TaskRepo.FindByID(taskId)
	if err != nil {
		return nil, fmt.Errorf("ошибка поиске задачи: %s", err)
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
