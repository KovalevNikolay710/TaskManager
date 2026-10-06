package repository

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	connectAttempts = 5
	connectDelay    = 5 * time.Second
)

// ErrRepairFailed — схема создана, но перенос данных старых версий не удался.
// Сервер может продолжать работу: данные остались прежними (транзакция откатилась).
var ErrRepairFailed = errors.New("не удалось перенести связи задач с группами")

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

// Migrate приводит схему к актуальной: переименование колонок, AutoMigrate всех моделей и идемпотентный перенос
// данных старых версий (group_tasks → tasks.group_id). Единственное место со списком моделей: его же вызывает internal/testdb.
// Если схема создана, а перенос не удался, возвращает ошибку, оборачивающую ErrRepairFailed.
func Migrate(db *gorm.DB, logger *slog.Logger) error {
	if err := runMigrations(db, logger); err != nil {
		return err
	}
	if err := MigrateGroupTasks(db, logger); err != nil {
		return fmt.Errorf("%w: %w", ErrRepairFailed, err)
	}
	return nil
}
