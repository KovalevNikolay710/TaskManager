package services

import (
	"TaskManager/internal/models"
	rep "TaskManager/internal/repository"
	"fmt"
	"time"
)

type TaskServiceImpl struct {
	TaskRepo rep.TaskRepositoryImpl
}

// NewTaskService создает новый экземпляр TaskService
func NewTaskService(taskRepo rep.TaskRepositoryImpl) TaskServiceImpl {
	return TaskServiceImpl{TaskRepo: taskRepo}
}

type TaskRepositoryImpl interface {
	Create(task *models.Task) (*models.Task, error)
	FindByID(taskID int64) (*models.Task, error)
	Update(task *models.Task) (*models.Task, error)
	Delete(taskID int64) error
	FindByUserID(userID int64, filter models.TaskFilter) ([]*models.Task, error)
}

func (serv TaskServiceImpl) CreateTask(input models.TaskCreateRequest) (task *models.Task, err error) {
	task = &models.Task{
		UserId:              input.UserID,
		GroupId:             input.GroupID,
		Description:         input.Description,
		DeadLine:            input.DeadLine,
		TimeForExecution:    input.TimeForExecution,
		PercentOfCompleting: input.PercentOfCompleting,
		Status:              input.Status,
	}
	priority, err := serv.calculateTaskPriortye(task)
	if err != nil {
		return nil, fmt.Errorf("ошибка при расчёте приоритета задачи: %s", err)
	}
	task.Priority = priority
	task, err = serv.TaskRepo.Create(task)
	if err != nil {
		return nil, fmt.Errorf("ошибка при записи задачи: %s", err)
	}
	return task, err
}

func (serv TaskServiceImpl) calculateTaskPriortye(task *models.Task) (float64, error) {
	dl, err := serv.countWorkHoursForDeadLine(task.DeadLine)
	if err != nil {
		return 0, fmt.Errorf("ошибка при расчёте чаосв на выполнение: %s", err)
	}
	return float64(task.GroupId) * float64((task.TimeForExecution)/dl) * float64(100-task.PercentOfCompleting) / float64(100), nil
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
	if input.Status != 0 {
		task.Status = input.Status
	}
	if input.PercentOfCompleting > 0 {
		task.PercentOfCompleting = input.PercentOfCompleting
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
