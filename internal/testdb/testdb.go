// Package testdb — вспомогательный код интеграционных тестов с настоящим PostgreSQL.
//
// DSN берётся из TEST_DATABASE_URL; без неё тест пропускается (t.Skip), и обычный go test ./... остаётся зелёным.
// Тесты разных пакетов делят одну БД, поэтому DB-тесты живут в одном пакете (internal/services)
// и не используют t.Parallel; при появлении DB-тестов в других пакетах запускайте go test -p 1.
package testdb

import (
	"log/slog"
	"os"
	"testing"

	"TaskManager/internal/models"
	"TaskManager/internal/repository"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open подключается к тестовой БД, применяет ту же схему, что и repository.Connect,
// и очищает все таблицы с обнулением счётчиков id. Без TEST_DATABASE_URL пропускает тест.
func Open(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL не задан: интеграционный тест пропущен")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("не удалось подключиться к тестовой БД: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("не удалось получить пул соединений: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	// Те же шаги, что в repository.Connect (там глобальный db и log.Fatalf, поэтому повторены здесь)
	if err := db.SetupJoinTable(&models.Day{}, "Tasks", &models.DayTask{}); err != nil {
		t.Fatalf("ошибка настройки таблицы day_tasks: %v", err)
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
		t.Fatalf("ошибка миграции схемы: %v", err)
	}
	if err := repository.RepairTaskGroups(db, slog.New(slog.DiscardHandler)); err != nil {
		t.Fatalf("ошибка чистки связей задач с группами: %v", err)
	}

	truncateAll(t, db)
	return db
}

// truncateAll очищает все таблицы схемы public: список берётся из каталога, чтобы новые модели не забыть.
func truncateAll(t *testing.T, db *gorm.DB) {
	t.Helper()
	var tables []string
	if err := db.Raw(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).Scan(&tables).Error; err != nil {
		t.Fatalf("не удалось получить список таблиц: %v", err)
	}
	for _, table := range tables {
		if err := db.Exec(`TRUNCATE TABLE "` + table + `" RESTART IDENTITY CASCADE`).Error; err != nil {
			t.Fatalf("не удалось очистить таблицу %s: %v", table, err)
		}
	}
}
