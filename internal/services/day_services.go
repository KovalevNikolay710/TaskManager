package services

import (
	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"fmt"
	"log/slog"
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
	GenericService *GenericService[models.Day]
	Logger         *slog.Logger
}

func NewDayService(dayRepo *repository.DayRepositoryImpl, taskRepo *repository.TaskRepositoryImpl, logger *slog.Logger) *DayServiceImpl {
	return &DayServiceImpl{
		DayRepository:  dayRepo,
		TaskRepository: taskRepo,
		Logger:         logger,
	}
}

func (serv *DayServiceImpl) CreateDay(input *models.DayCreateRequest) (createdDay *models.Day, err error) {

	day := &models.Day{
		UserId:        input.UserId,
		Date:          input.Date,
		TimeForTasks:  input.TimeForTasks,
		AmountOfTasks: input.AmountOfTasks,
	}

	day, err = serv.FillDayTaskListAndCalculatePriorty(day)
	if err != nil {
		return nil, fmt.Errorf("не удалось заполнить список задач: %w", err)
	}

	createdDay, err = serv.DayRepository.Create(day, "Tasks")
	if err != nil {
		return nil, fmt.Errorf("не удалось создать день: %w", err)
	}

	return createdDay, nil
}

func (serv *DayServiceImpl) UpdateDay(dayId int64, input *models.DayUpdateRequest) (*models.Day, error) {
	day, err := serv.DayRepository.FindByID(dayId)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске дня: %w", err)
	}
	if day == nil {
		return nil, fmt.Errorf("день с ID %d не найден", dayId)
	}

	if input.AmountOfTasks != day.AmountOfTasks && input.AmountOfTasks > 0 {
		day.AmountOfTasks = input.AmountOfTasks
	}

	if input.TimeForTasks != day.TimeForTasks && input.TimeForTasks > 0 {
		day.TimeForTasks = input.TimeForTasks
	}

	day, err = serv.FillDayTaskListAndCalculatePriorty(day)
	if err != nil {
		return nil, fmt.Errorf("не удалось заполнить список задач: %w", err)
	}

	updatedDay, err := serv.DayRepository.Update(day, "Tasks")
	if err != nil {
		return nil, fmt.Errorf("не удалось обновить данные дня: %w", err)
	}
	return updatedDay, nil
}

func (serv *DayServiceImpl) GetDaysByUserID(userID int64) ([]*models.Day, error) {
	days, err := serv.DayRepository.GetAllUserDays(userID)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить дни пользователя: %w", err)
	}

	// Задачи плана могли быть выполнены после сборки дня — пересчитываем остаток при выдаче
	for _, day := range days {
		calculateDayPriority(day)
	}
	return days, nil
}

func (serv *DayServiceImpl) FillDayTaskListAndCalculatePriorty(day *models.Day) (*models.Day, error) {

	tasks, err := serv.TaskRepository.FindByUserID(day.UserId, models.TaskFilter{Status: models.StatusActive, Date: day.Date})
	if err != nil {
		return nil, fmt.Errorf("не удалось получить задачи пользователя: %w", err)
	}

	// Активных задач может не быть — тогда день остаётся с пустым планом
	if tasks == nil {
		tasks = []*models.Task{}
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].Priority > tasks[j].Priority
	})

	if len(tasks) > day.AmountOfTasks {
		day.Tasks = tasks[:day.AmountOfTasks]
	} else {
		day.Tasks = tasks
	}

	calculateDayPriority(day)

	serv.Logger.Info("План дня сформирован",
		slog.Int64("userId", day.UserId),
		slog.Int("taskCount", len(day.Tasks)),
		slog.Float64("priorityOfTheDay", day.PriorityOfTheDay))

	return day, nil
}

// calculateDayPriority считает приоритет дня как сумму Priority невыполненных задач плана.
func calculateDayPriority(day *models.Day) {
	sum := 0.0
	for _, task := range day.Tasks {
		if task.Status != models.StatusCompleted {
			sum += task.Priority
		}
	}
	day.PriorityOfTheDay = sum
}
