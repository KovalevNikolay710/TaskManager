package services

import (
	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"fmt"
	"log/slog"
	"time"
)

type DayServiceImpl struct {
	DayRepository  *repository.DayRepositoryImpl
	TaskRepository *repository.TaskRepositoryImpl
	Logger         *slog.Logger
}

func NewDayService(dayRepo *repository.DayRepositoryImpl, taskRepo *repository.TaskRepositoryImpl, logger *slog.Logger) *DayServiceImpl {
	return &DayServiceImpl{
		DayRepository:  dayRepo,
		TaskRepository: taskRepo,
		Logger:         logger,
	}
}

// CreateDay составляет план: всё время дня делится между активными задачами (AllocateDayTime).
func (serv *DayServiceImpl) CreateDay(input *models.DayCreateRequest) (*models.Day, error) {
	day := &models.Day{
		UserId:       input.UserId,
		Date:         input.Date,
		TimeForTasks: input.TimeForTasks,
	}

	slots, err := serv.allocate(day, day.TimeForTasks)
	if err != nil {
		return nil, err
	}
	day.AmountOfTasks = len(slots)

	if err := serv.DayRepository.CreateWithSlots(day, slots); err != nil {
		return nil, fmt.Errorf("не удалось создать день: %w", err)
	}
	return serv.GetDayByID(day.DayId)
}

// UpdateDay пересобирает план. Слоты выполненных задач остаются с прежними минутами,
// оставшееся время заново делится между активными задачами.
func (serv *DayServiceImpl) UpdateDay(dayId int64, input *models.DayUpdateRequest) (*models.Day, error) {
	day, err := serv.DayRepository.FindByID(dayId)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске дня: %w", err)
	}
	if day == nil {
		return nil, ErrDayNotFound
	}

	if input.TimeForTasks > 0 {
		day.TimeForTasks = input.TimeForTasks
	}

	completed := make(map[int64]bool, len(day.Tasks))
	for _, task := range day.Tasks {
		if task.Status == models.StatusCompleted {
			completed[task.TaskId] = true
		}
	}
	var keepTaskIDs []int64
	doneMinutes := 0
	for _, slot := range day.Slots {
		if completed[slot.TaskId] {
			keepTaskIDs = append(keepTaskIDs, slot.TaskId)
			doneMinutes += slot.Minutes
		}
	}
	if day.TimeForTasks < doneMinutes {
		return nil, newError(ErrKindInvalidInput,
			fmt.Sprintf("Время дня меньше уже выполненного (%s)", formatDuration(doneMinutes)))
	}

	slots, err := serv.allocate(day, day.TimeForTasks-doneMinutes)
	if err != nil {
		return nil, err
	}
	day.AmountOfTasks = len(keepTaskIDs) + len(slots)

	if err := serv.DayRepository.ReplaceSlots(day, keepTaskIDs, slots); err != nil {
		return nil, fmt.Errorf("не удалось обновить план дня: %w", err)
	}
	return serv.GetDayByID(dayId)
}

// GetDayByID возвращает сохранённый план дня (без пересборки) или ErrDayNotFound.
func (serv *DayServiceImpl) GetDayByID(dayId int64) (*models.Day, error) {
	day, err := serv.DayRepository.FindByID(dayId)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить день: %w", err)
	}
	if day == nil {
		return nil, ErrDayNotFound
	}
	prepareDay(day)
	return day, nil
}

func (serv *DayServiceImpl) GetDaysByUserID(userID int64) ([]*models.Day, error) {
	days, err := serv.DayRepository.GetAllUserDays(userID)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить дни пользователя: %w", err)
	}
	for _, day := range days {
		prepareDay(day)
	}
	return days, nil
}

// DeleteDay удаляет день вместе с его планом или возвращает ErrDayNotFound.
func (serv *DayServiceImpl) DeleteDay(dayId int64) error {
	day, err := serv.DayRepository.FindByID(dayId)
	if err != nil {
		return fmt.Errorf("ошибка при поиске дня: %w", err)
	}
	if day == nil {
		return ErrDayNotFound
	}
	if err := serv.DayRepository.DeleteWithSlots(dayId); err != nil {
		return fmt.Errorf("не удалось удалить день: %w", err)
	}
	return nil
}

// allocate делит total минут между активными задачами пользователя с дедлайном позже начала дня.
// Приоритет кандидатов пересчитывается от текущего момента; задачи при этом не сохраняются.
func (serv *DayServiceImpl) allocate(day *models.Day, total int) ([]models.DayTask, error) {
	tasks, err := serv.TaskRepository.FindByUserID(day.UserId, models.TaskFilter{Status: models.StatusActive, Date: day.Date})
	if err != nil {
		return nil, fmt.Errorf("не удалось получить задачи пользователя: %w", err)
	}

	now := time.Now()
	candidates := make([]PlanCandidate, 0, len(tasks))
	for _, task := range tasks {
		refreshTaskPriorty(task, now)
		candidates = append(candidates, newPlanCandidate(task, day.Date, now))
	}

	planned := AllocateDayTime(total, candidates)
	slots := make([]models.DayTask, len(planned))
	used := 0
	for i, slot := range planned {
		slots[i] = models.DayTask{TaskId: slot.TaskId, Minutes: slot.Minutes}
		used += slot.Minutes
	}

	serv.Logger.Info("План дня сформирован",
		slog.Int64("userId", day.UserId),
		slog.Int64("dayId", day.DayId),
		slog.Int("candidates", len(candidates)),
		slog.Int("taskCount", len(slots)),
		slog.Int("minutes", total),
		slog.Int("freeMinutes", total-used))
	return slots, nil
}

// prepareDay готовит день к выдаче: пустые списки вместо null и приоритет дня.
func prepareDay(day *models.Day) {
	if day.Tasks == nil {
		day.Tasks = []*models.Task{}
	}
	if day.Slots == nil {
		day.Slots = []models.DayTask{}
	}
	calculateDayPriority(day)
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

// formatDuration — минуты в «Ч:ММ», как во фронтенде: 90 → «1:30».
func formatDuration(minutes int) string {
	return fmt.Sprintf("%d:%02d", minutes/60, minutes%60)
}
