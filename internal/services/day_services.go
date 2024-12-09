package services

import (
	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"fmt"
	"sort"
)

type DayRepositoryImpl interface {
	Create(day *models.Day) (*models.Day, error)
	FindByID(dayID int64) (*models.Day, error)
	Update(day *models.Day) (*models.Day, error)
	Delete(dayID int64) error
	FindByUserID(userID int64) ([]*models.Day, error)
	GetAllTasksForDay(dayID int64) ([]*models.Task, error)
}

type DayServiceImpl struct {
	DayRepository  *repository.DayRepositoryImpl
	TaskRepository *repository.TaskRepositoryImpl
}

func NewDayService(dayRepo *repository.DayRepositoryImpl, taskRepo *repository.TaskRepositoryImpl) *DayServiceImpl {
	return &DayServiceImpl{
		DayRepository:  dayRepo,
		TaskRepository: taskRepo,
	}
}

func (serv *DayServiceImpl) CreateDay(day *models.Day) (*models.Day, error) {
	if day.UserId == 0 {
		return nil, fmt.Errorf("userId обязателен")
	}

	createdDay, err := serv.DayRepository.Create(day)
	if err != nil {
		return nil, fmt.Errorf("не удалось создать день: %w", err)
	}

	createdDay, err = serv.fillDayTaskListAndCalculatePriorty(createdDay)
	if err != nil {
		return nil, fmt.Errorf("не удалось заполнить список задач: %w", err)
	}

	return createdDay, nil
}

func (serv *DayServiceImpl) GetDayByID(dayID int64) (*models.Day, error) {
	day, err := serv.DayRepository.FindByID(dayID)
	if err != nil {
		return nil, fmt.Errorf("не удалось найти день: %w", err)
	}
	if day == nil {
		return nil, fmt.Errorf("день с таким ID не найден")
	}
	return day, nil
}

func (serv *DayServiceImpl) UpdateDay(day *models.Day) (*models.Day, error) {
	updatedDay, err := serv.DayRepository.Update(day)
	if err != nil {
		return nil, fmt.Errorf("не удалось обновить данные дня: %w", err)
	}

	updatedDay, err = serv.fillDayTaskListAndCalculatePriorty(updatedDay)
	if err != nil {
		return nil, fmt.Errorf("не удалось заполнить список задач: %w", err)
	}

	return updatedDay, nil
}

func (serv *DayServiceImpl) DeleteDay(dayID int64) error {
	if err := serv.DayRepository.Delete(dayID); err != nil {
		return fmt.Errorf("не удалось удалить день: %w", err)
	}
	return nil
}

func (serv *DayServiceImpl) GetDaysByUserID(userID int64) ([]*models.Day, error) {
	days, err := serv.DayRepository.GetAllUserDays(userID)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить дни пользователя: %w", err)
	}
	return days, nil
}

func (serv *DayServiceImpl) fillDayTaskListAndCalculatePriorty(day *models.Day) (*models.Day, error) {
	tasks, err := serv.TaskRepository.FindByUserID(day.UserId, models.TaskFilter{Status: models.StatusActive})
	fmt.Println(tasks)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить задачи пользователя: %w", err)
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].Priority > tasks[j].Priority // Задачи с высшим приоритетом идут первыми
	})

	if len(tasks) > day.AmountOfTasks {
		day.Tasks = tasks[:day.AmountOfTasks]
	} else {
		day.Tasks = tasks
	}

	sum := 0.0
	for _, task := range day.Tasks {
		sum += task.Priority
	}
	day.PriorityOfTheDay = sum

	return day, nil
}
