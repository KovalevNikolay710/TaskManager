package services

import (
	"TaskManager/internal/models"
	rep "TaskManager/internal/repository"
	"context"
	"fmt"
	"log/slog"
	"time"
)

// reminderCheckInterval — как часто планировщик проверяет правила напоминаний.
const reminderCheckInterval = time.Minute

// ReminderServiceImpl — планировщик напоминаний: раз в минуту проверяет правила 1–3
// из design/screens/profile.md для каждого пользователя с подписками и отправляет push.
type ReminderServiceImpl struct {
	PushService      *PushServiceImpl
	SubscriptionRepo *rep.PushSubscriptionRepositoryImpl
	SettingsRepo     *rep.NotificationSettingsRepositoryImpl
	TaskRepo         *rep.TaskRepositoryImpl
	DayRepo          *rep.DayRepositoryImpl
	LogRepo          notificationJournal
	Logger           *slog.Logger
}

// notificationJournal — журнал отправленных напоминаний (в работе — NotificationLogRepositoryImpl).
type notificationJournal interface {
	TryRecord(entry *models.NotificationLog) (bool, error)
	Forget(entry *models.NotificationLog) error
}

func NewReminderService(
	pushService *PushServiceImpl,
	subRepo *rep.PushSubscriptionRepositoryImpl,
	settingsRepo *rep.NotificationSettingsRepositoryImpl,
	taskRepo *rep.TaskRepositoryImpl,
	dayRepo *rep.DayRepositoryImpl,
	logRepo *rep.NotificationLogRepositoryImpl,
	logger *slog.Logger,
) *ReminderServiceImpl {
	return &ReminderServiceImpl{
		PushService:      pushService,
		SubscriptionRepo: subRepo,
		SettingsRepo:     settingsRepo,
		TaskRepo:         taskRepo,
		DayRepo:          dayRepo,
		LogRepo:          logRepo,
		Logger:           logger,
	}
}

// Run проверяет напоминания сразу и затем раз в минуту, пока не отменён ctx.
// Первая проверка при старте досылает утреннее и вечернее, пропущенные за время простоя (в пределах TTL).
func (serv *ReminderServiceImpl) Run(ctx context.Context) {
	serv.Logger.Info("Планировщик напоминаний запущен", slog.String("interval", reminderCheckInterval.String()))
	serv.check(ctx, time.Now())

	ticker := time.NewTicker(reminderCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			serv.Logger.Info("Планировщик напоминаний остановлен")
			return
		case now := <-ticker.C:
			serv.check(ctx, now)
		}
	}
}

// reminderStats — сколько уведомлений отправлено за проверку (по числу уведомлений, не устройств).
type reminderStats struct {
	Morning, Evening, Deadline, Summary int
}

func (stats *reminderStats) add(other reminderStats) {
	stats.Morning += other.Morning
	stats.Evening += other.Evening
	stats.Deadline += other.Deadline
	stats.Summary += other.Summary
}

func (stats reminderStats) total() int {
	return stats.Morning + stats.Evening + stats.Deadline + stats.Summary
}

// check — одна проверка всех пользователей с подписками. Ошибки одного пользователя не мешают остальным.
func (serv *ReminderServiceImpl) check(ctx context.Context, now time.Time) {
	userIDs, err := serv.SubscriptionRepo.FindUserIDs()
	if err != nil {
		serv.Logger.Error("Планировщик: не удалось получить пользователей с подписками", slog.String("error", err.Error()))
		return
	}
	if len(userIDs) == 0 {
		return
	}
	settingsByUser, err := serv.SettingsRepo.FindByUserIDs(userIDs)
	if err != nil {
		serv.Logger.Error("Планировщик: не удалось получить настройки уведомлений", slog.String("error", err.Error()))
		return
	}

	var stats reminderStats
	for _, userID := range userIDs {
		if ctx.Err() != nil {
			return
		}
		settings, ok := settingsByUser[userID]
		if !ok {
			settings = models.DefaultNotificationSettings(userID)
		}
		userStats, err := serv.checkUser(ctx, settings, now)
		stats.add(userStats)
		if err != nil {
			serv.Logger.Error("Планировщик: ошибка при проверке напоминаний",
				slog.Int64("userId", userID), slog.String("error", err.Error()))
		}
	}
	if stats.total() > 0 {
		serv.Logger.Info("Напоминания отправлены",
			slog.Int("users", len(userIDs)),
			slog.Int("morning", stats.Morning),
			slog.Int("evening", stats.Evening),
			slog.Int("deadline", stats.Deadline),
			slog.Int("deadlineSummary", stats.Summary))
	}
}

// checkUser проверяет правила 1–3 для одного пользователя.
func (serv *ReminderServiceImpl) checkUser(ctx context.Context, s models.NotificationSettings, now time.Time) (reminderStats, error) {
	var stats reminderStats
	loc := serv.location(s)

	tasks, err := serv.TaskRepo.FindByUserID(s.UserId, models.TaskFilter{Status: models.StatusActive})
	if err != nil {
		return stats, fmt.Errorf("не удалось получить задачи: %w", err)
	}

	// 1. Утро: плана на сегодня нет, активные задачи есть
	if s.MorningEnabled && len(tasks) > 0 {
		if at, due := dueDailyReminder(now, loc, s.MorningTime, morningTTL); due {
			plan, err := serv.planFor(s.UserId, at, loc)
			if err != nil {
				return stats, err
			}
			if plan == nil {
				msg := morningMessage(tasks, now, loc)
				opts := PushOptions{TTL: at.Add(morningTTL).Sub(now), Urgency: urgencyNormal, Topic: msg.Tag}
				sent, err := serv.sendOnce(ctx, s.UserId, models.NotificationKindMorning, 0, dateKey(at, loc), msg, opts, now)
				if err != nil {
					return stats, err
				}
				if sent {
					stats.Morning++
				}
			}
		}
	}

	// 2. Вечер: план на сегодня есть и в нём остались невыполненные задачи
	if s.EveningEnabled {
		if at, due := dueDailyReminder(now, loc, s.EveningTime, eveningTTL); due {
			plan, err := serv.planFor(s.UserId, at, loc)
			if err != nil {
				return stats, err
			}
			if plan != nil {
				if msg, ok := eveningMessage(plan.Tasks); ok {
					opts := PushOptions{TTL: at.Add(eveningTTL).Sub(now), Urgency: urgencyNormal, Topic: msg.Tag}
					sent, err := serv.sendOnce(ctx, s.UserId, models.NotificationKindEvening, 0, dateKey(at, loc), msg, opts, now)
					if err != nil {
						return stats, err
					}
					if sent {
						stats.Evening++
					}
				}
			}
		}
	}

	// 3. Дедлайн скоро: окно и тихие часы — selectDeadlineTasks, повторы — журнал
	due := selectDeadlineTasks(tasks, s, loc, now, shouldRemindDeadline)
	var fresh []*models.Task
	var entries []*models.NotificationLog
	for _, task := range due {
		entry := &models.NotificationLog{
			UserId: s.UserId, Kind: models.NotificationKindDeadline, TaskId: task.TaskId,
			Key: deadlineLogKey(task.DeadLine), SentAt: now,
		}
		recorded, err := serv.LogRepo.TryRecord(entry)
		if err != nil {
			return stats, err
		}
		if recorded {
			fresh = append(fresh, task)
			entries = append(entries, entry)
		}
	}
	if len(fresh) >= deadlineSummaryFrom {
		msg := deadlineSummaryMessage(fresh, s.DeadlineHoursBefore, now, loc)
		latest := fresh[len(fresh)-1].DeadLine
		opts := PushOptions{TTL: latest.Sub(now), Urgency: urgencyHigh, Topic: msg.Tag}
		if serv.deliver(ctx, s.UserId, msg, opts, entries...) {
			stats.Summary++
		}
		return stats, nil
	}
	for i, task := range fresh {
		msg := deadlineMessage(task, now, loc)
		opts := PushOptions{TTL: task.DeadLine.Sub(now), Urgency: urgencyHigh, Topic: msg.Tag}
		if serv.deliver(ctx, s.UserId, msg, opts, entries[i]) {
			stats.Deadline++
		}
	}
	return stats, nil
}

// location — часовой пояс пользователя; пустой или неизвестный — часовой пояс сервера.
func (serv *ReminderServiceImpl) location(s models.NotificationSettings) *time.Location {
	if s.Timezone == "" {
		return time.Local
	}
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		serv.Logger.Warn("Неизвестный часовой пояс пользователя, используется часовой пояс сервера",
			slog.Int64("userId", s.UserId), slog.String("timezone", s.Timezone))
		return time.Local
	}
	return loc
}

// planFor возвращает план пользователя на локальную дату момента at или nil, если плана нет.
func (serv *ReminderServiceImpl) planFor(userID int64, at time.Time, loc *time.Location) (*models.Day, error) {
	// Date дня — полночь по поясу браузера; запас в сутки с каждой стороны покрывает любой сдвиг поясов
	midnight := atClock(at, loc, 0)
	days, err := serv.DayRepo.FindByUserAndDateRange(userID, midnight.AddDate(0, 0, -1), midnight.AddDate(0, 0, 2))
	if err != nil {
		return nil, fmt.Errorf("не удалось получить план дня: %w", err)
	}
	return findPlanForDate(days, at, loc), nil
}

// findPlanForDate выбирает день с той же локальной датой, что и date; из нескольких — последний созданный.
func findPlanForDate(days []*models.Day, date time.Time, loc *time.Location) *models.Day {
	var found *models.Day
	for _, day := range days {
		if sameLocalDate(day.Date, date, loc) && (found == nil || day.DayId > found.DayId) {
			found = day
		}
	}
	return found
}

// sendOnce записывает напоминание в журнал и, если записи ещё не было, отправляет его.
// Запись — до отправки: после перезапуска сервера повтора не будет. false — уже отправлялось
// или не доставлено.
func (serv *ReminderServiceImpl) sendOnce(ctx context.Context, userID int64, kind string, taskID int64, key string, msg PushMessage, opts PushOptions, now time.Time) (bool, error) {
	entry := &models.NotificationLog{UserId: userID, Kind: kind, TaskId: taskID, Key: key, SentAt: now}
	recorded, err := serv.LogRepo.TryRecord(entry)
	if err != nil {
		return false, err
	}
	if !recorded {
		return false, nil
	}
	return serv.deliver(ctx, userID, msg, opts, entry), nil
}

// deliver отправляет уведомление на все устройства пользователя; entries — его записи в журнале.
// Если отправка сорвалась (SendToUser вернул ошибку: сеть, сбой push-сервиса, БД), записи удаляются,
// и следующая ежеминутная проверка попробует снова — повторы ограничены TTL утра и вечера
// и окном дедлайна. Записи остаются, если подписок нет или все они устарели (повторять некуда),
// и если проверку прервала остановка сервера: запрос мог уже дойти до push-сервиса, повтор
// после перезапуска дал бы дубль.
func (serv *ReminderServiceImpl) deliver(ctx context.Context, userID int64, msg PushMessage, opts PushOptions, entries ...*models.NotificationLog) bool {
	if opts.TTL <= 0 {
		return false
	}
	sent, err := serv.PushService.SendToUser(ctx, userID, msg, opts)
	if err == nil {
		return sent > 0
	}
	serv.Logger.Warn("Напоминание не доставлено",
		slog.Int64("userId", userID), slog.String("tag", msg.Tag), slog.String("error", err.Error()))
	if ctx.Err() != nil {
		return false
	}
	for _, entry := range entries {
		if err := serv.LogRepo.Forget(entry); err != nil {
			serv.Logger.Error("Не удалось убрать недоставленное напоминание из журнала, повтора не будет",
				slog.Int64("userId", userID), slog.String("kind", entry.Kind), slog.String("error", err.Error()))
		}
	}
	return false
}
