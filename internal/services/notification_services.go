package services

import (
	"TaskManager/internal/models"
	rep "TaskManager/internal/repository"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// NotificationServiceImpl — настройки напоминаний пользователя.
type NotificationServiceImpl struct {
	SettingsRepo *rep.NotificationSettingsRepositoryImpl
	Logger       *slog.Logger
}

func NewNotificationService(settingsRepo *rep.NotificationSettingsRepositoryImpl, logger *slog.Logger) *NotificationServiceImpl {
	return &NotificationServiceImpl{SettingsRepo: settingsRepo, Logger: logger}
}

// GetSettings возвращает настройки пользователя; если строки ещё нет — значения по умолчанию (не ошибку).
func (serv *NotificationServiceImpl) GetSettings(userID int64) (*models.NotificationSettings, error) {
	settings, err := serv.SettingsRepo.FindByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить настройки уведомлений: %w", err)
	}
	if settings == nil {
		defaults := models.DefaultNotificationSettings(userID)
		return &defaults, nil
	}
	return settings, nil
}

// UpdateSettings применяет переданные поля (nil — не менять) и сохраняет настройки (upsert).
func (serv *NotificationServiceImpl) UpdateSettings(userID int64, input models.NotificationSettingsUpdateRequest) (*models.NotificationSettings, error) {
	settings, err := serv.SettingsRepo.Update(userID, func(settings *models.NotificationSettings) error {
		return applySettingsUpdate(settings, input)
	})
	if err != nil {
		// Ошибки проверки (*Error) остаются различимы через errors.As: обработчик ответит 400 с их текстом
		return nil, fmt.Errorf("не удалось сохранить настройки уведомлений: %w", err)
	}
	serv.Logger.Info("Настройки уведомлений сохранены", slog.Int64("userId", userID))
	return settings, nil
}

// applySettingsUpdate применяет частичное обновление и проверяет итоговые значения:
// время — «ЧЧ:ММ», «за N ч» — 1–24, начало и конец тихих часов различны (интервал через полночь допустим),
// часовой пояс — известный IANA. При ошибке settings может быть изменён частично — вызывающий его отбрасывает.
func applySettingsUpdate(settings *models.NotificationSettings, input models.NotificationSettingsUpdateRequest) error {
	clocks := []struct {
		value  *string
		target *string
	}{
		{input.MorningTime, &settings.MorningTime},
		{input.EveningTime, &settings.EveningTime},
		{input.QuietFrom, &settings.QuietFrom},
		{input.QuietTo, &settings.QuietTo},
	}
	for _, clock := range clocks {
		if clock.value == nil {
			continue
		}
		value := strings.TrimSpace(*clock.value)
		if _, ok := parseClock(value); !ok {
			return ErrInvalidClockTime
		}
		*clock.target = value
	}

	if input.DeadlineHoursBefore != nil {
		hours := *input.DeadlineHoursBefore
		if hours < models.MinDeadlineHoursBefore || hours > models.MaxDeadlineHoursBefore {
			return ErrInvalidDeadlineHours
		}
		settings.DeadlineHoursBefore = hours
	}

	if input.Timezone != nil {
		timezone := strings.TrimSpace(*input.Timezone)
		// Пустая строка — часовой пояс сервера; time.LoadLocation("") вернул бы UTC, поэтому не проверяем
		if timezone != "" {
			if _, err := time.LoadLocation(timezone); err != nil {
				return ErrUnknownTimezone
			}
		}
		settings.Timezone = timezone
	}

	for _, flag := range []struct {
		value  *bool
		target *bool
	}{
		{input.MorningEnabled, &settings.MorningEnabled},
		{input.EveningEnabled, &settings.EveningEnabled},
		{input.DeadlineEnabled, &settings.DeadlineEnabled},
		{input.QuietEnabled, &settings.QuietEnabled},
	} {
		if flag.value != nil {
			*flag.target = *flag.value
		}
	}

	// Итоговые значения, а не только присланные: {"quietTo": "23:00"} при QuietFrom = 23:00 — тоже ошибка
	if settings.QuietFrom == settings.QuietTo {
		return ErrQuietHoursEqual
	}
	return nil
}
