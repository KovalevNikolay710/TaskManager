package services_test

// Интеграционный тест миграции схемы: старые имена колонок и таблица group_tasks → текущая схема.

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"TaskManager/internal/testdb"
)

func TestMigrate_OldSchema(t *testing.T) {
	db := testdb.Open(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	exec := func(sql string, args ...any) {
		t.Helper()
		if err := db.Exec(sql, args...).Error; err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	insertID := func(sql string, args ...any) int64 {
		t.Helper()
		var id int64
		if err := db.Raw(sql, args...).Scan(&id).Error; err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return id
	}

	// Старое состояние: прежние имена колонок и join-таблица group_tasks
	exec(`ALTER TABLE tasks RENAME COLUMN group_priority TO group_priorty`)
	exec(`ALTER TABLE tasks RENAME COLUMN deadline TO dead_line`)
	exec(`ALTER TABLE tasks RENAME COLUMN hours_until_deadline TO number_of_hours_until_dl`)
	exec(`CREATE TABLE group_tasks (group_group_id bigint, task_task_id bigint, PRIMARY KEY (group_group_id, task_task_id))`)

	group := insertID(`INSERT INTO groups (group_priority, user_id, name) VALUES (5, 1, 'G') RETURNING group_id`)
	deadline := time.Now().Add(10 * time.Hour).UTC().Truncate(time.Second)
	insertTask := func(name string, groupID int64, weight int, priority float64) int64 {
		return insertID(`INSERT INTO tasks (user_id, group_id, group_priorty, dead_line, time_for_execution, priority,
			number_of_hours_until_dl, percent_of_completing, status, name)
			VALUES (1, ?, ?, ?, 60, ?, 10, 0, 1, ?) RETURNING task_id`, groupID, weight, deadline, priority, name)
	}
	linked := insertTask("связана", 0, 1, 10)
	free := insertTask("без связи", 0, 1, 10)
	exec(`INSERT INTO group_tasks (group_group_id, task_task_id) VALUES (?, ?)`, group, linked)

	// Конфликт: group_id указывает на одну группу, связь в group_tasks — на другую; побеждает group_id
	otherGroup := insertID(`INSERT INTO groups (group_priority, user_id, name) VALUES (3, 1, 'H') RETURNING group_id`)
	conflicted := insertTask("конфликт", group, 5, 50)
	exec(`INSERT INTO group_tasks (group_group_id, task_task_id) VALUES (?, ?)`, otherGroup, conflicted)

	if err := repository.Migrate(db, logger); err != nil {
		t.Fatal(err)
	}

	m := db.Migrator()
	for _, name := range []string{"group_priority", "deadline", "hours_until_deadline"} {
		if !m.HasColumn("tasks", name) {
			t.Errorf("нет колонки tasks.%s", name)
		}
	}
	for _, name := range []string{"group_priorty", "dead_line", "number_of_hours_until_dl"} {
		if m.HasColumn("tasks", name) {
			t.Errorf("осталась колонка tasks.%s", name)
		}
	}
	if m.HasTable("group_tasks") {
		t.Error("таблица group_tasks не удалена")
	}

	check := func() {
		t.Helper()
		var got models.Task
		if err := db.First(&got, linked).Error; err != nil {
			t.Fatal(err)
		}
		if got.GroupId != group || got.GroupPriority != 5 || !near(got.Priority, 50) {
			t.Errorf("связанная задача: GroupId=%d GroupPriority=%d Priority=%v, want %d/5/50",
				got.GroupId, got.GroupPriority, got.Priority, group)
		}
		if !got.Deadline.Equal(deadline) || got.HoursUntilDeadline != 10 || got.TimeForExecution != 60 || got.Name != "связана" {
			t.Errorf("данные задачи потеряны: %+v", got)
		}
		var other models.Task
		if err := db.First(&other, free).Error; err != nil {
			t.Fatal(err)
		}
		if other.GroupId != 0 || other.GroupPriority != 1 || !near(other.Priority, 10) {
			t.Errorf("задача без связи изменилась: %+v", other)
		}
		var kept models.Task
		if err := db.First(&kept, conflicted).Error; err != nil {
			t.Fatal(err)
		}
		if kept.GroupId != group || kept.GroupPriority != 5 || !near(kept.Priority, 50) {
			t.Errorf("конфликтная задача: GroupId=%d GroupPriority=%d Priority=%v, want %d/5/50",
				kept.GroupId, kept.GroupPriority, kept.Priority, group)
		}
	}
	check()

	// Повторный запуск ничего не меняет
	if err := repository.Migrate(db, logger); err != nil {
		t.Fatal(err)
	}
	check()
}
