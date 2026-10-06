package repository

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"TaskManager/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	connectAttempts = 5
	connectDelay    = 5 * time.Second
)

// ErrRepairFailed — схема создана, но разовая чистка данных старых версий не удалась.
// Сервер может продолжать работу: данные остались прежними (транзакция откатилась).
var ErrRepairFailed = errors.New("не удалось исправить связи задач с группами")

// Connect открывает (пауза между попытками прерывается отменой ctx) соединение с PostgreSQL по dsn; до connectAttempts попыток с паузой connectDelay,
// чтобы дождаться запуска базы (например, в docker compose).
func Connect(ctx context.Context, dsn string, logger *slog.Logger) (*gorm.DB, error) {
	var (
		db  *gorm.DB
		err error
	)
	for attempt := 1; attempt <= connectAttempts; attempt++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			return db, nil
		}
		logger.Warn("Не удалось подключиться к базе данных",
			slog.Int("attempt", attempt), slog.Int("attempts", connectAttempts), slog.String("error", err.Error()))
		if attempt < connectAttempts {
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("подключение к базе данных прервано: %w", ctx.Err())
			case <-time.After(connectDelay):
			}
		}
	}
	return nil, fmt.Errorf("не удалось подключиться к базе данных после %d попыток: %w", connectAttempts, err)
}

// Migrate приводит схему к актуальной (AutoMigrate всех моделей) и запускает идемпотентную чистку данных
// старых версий. Единственное место со списком моделей: его же вызывает internal/testdb.
// Если схема создана, а чистка не удалась, возвращает ошибку, оборачивающую ErrRepairFailed.
func Migrate(db *gorm.DB, logger *slog.Logger) error {
	// Своя модель для day_tasks: к связи «день — задача» добавлены минуты плана
	if err := db.SetupJoinTable(&models.Day{}, "Tasks", &models.DayTask{}); err != nil {
		return fmt.Errorf("ошибка настройки таблицы day_tasks: %w", err)
	}

	if err := db.AutoMigrate(
		&models.Group{},
		&models.Task{},
		&models.Day{},
		&models.DayTask{},
		&models.PushSubscription{},
		&models.NotificationSettings{},
		&models.VapidKeys{},
		&models.NotificationLog{},
	); err != nil {
		return fmt.Errorf("ошибка миграции схемы: %w", err)
	}

	// Чистка идемпотентна и выполняется при каждом старте сразу после AutoMigrate
	if err := RepairTaskGroups(db, logger); err != nil {
		return fmt.Errorf("%w: %w", ErrRepairFailed, err)
	}
	return nil
}
