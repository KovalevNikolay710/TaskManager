package repository

import (
	"fmt"
	"log/slog"

	"TaskManager/internal/models"

	"gorm.io/gorm"
)

// columnRenames — переименования колонок tasks (поля Task переименованы без опечаток и сокращений).
var columnRenames = []struct{ table, oldName, newName string }{
	{"tasks", "group_priorty", "group_priority"},
	{"tasks", "dead_line", "deadline"},
	{"tasks", "number_of_hours_until_dl", "hours_until_deadline"},
}

// renameColumns переименовывает колонки старых версий в одной транзакции. Идемпотентно: переименовывается
// только если старая колонка есть, а новой нет. Выполняется до AutoMigrate, иначе он создал бы пустые новые колонки.
func renameColumns(db *gorm.DB, logger *slog.Logger) error {
	return db.Transaction(func(tx *gorm.DB) error {
		migrator := tx.Migrator()
		for _, rename := range columnRenames {
			if !migrator.HasColumn(rename.table, rename.oldName) {
				continue
			}
			if migrator.HasColumn(rename.table, rename.newName) {
				// Обе колонки есть — данные старой не переносятся автоматически, нужна ручная проверка
				logger.Warn("Старая колонка осталась рядом с новой, переименование пропущено",
					slog.String("table", rename.table),
					slog.String("old", rename.oldName),
					slog.String("new", rename.newName))
				continue
			}
			if err := migrator.RenameColumn(rename.table, rename.oldName, rename.newName); err != nil {
				return fmt.Errorf("ошибка при переименовании колонки %s.%s в %s: %w",
					rename.table, rename.oldName, rename.newName, err)
			}
			logger.Info("Колонка переименована",
				slog.String("table", rename.table),
				slog.String("from", rename.oldName),
				slog.String("to", rename.newName))
		}
		return nil
	})
}

// Раньше состав группы хранился дважды: в tasks.group_id и в join-таблице group_tasks (GORM называет её колонки
// group_group_id / task_task_id). Теперь источник один — tasks.group_id. Миграция выполняется только пока таблица
// group_tasks существует и заканчивается её удалением, поэтому повторный запуск ничего не делает.
//
// Перед переносом убираются однозначные ошибки старых версий:
//   - с тега `default:1` (коммит 3ec619c) задача без группы сохранялась с group_id = 1;
//   - ранние версии не проверяли, что группа существует и принадлежит пользователю;
//   - удаление группы оставляло у задач group_id удалённой группы.

// Отвязка задачи от группы: при смене множителя группы Pg на 1 приоритет Pt = Pg * Te / Tl * %in
// делится на старый Pg — так же, как при удалении группы в сервисе.
const detachTaskSet = `group_id = 0, priority = t.priority / GREATEST(t.group_priority, 1), group_priority = 1`

var taskGroupRepairs = []struct {
	name string
	sql  string
}{
	{
		// Группы нет или она чужая: такую ссылку интерфейс и так показывает как «Без группы»
		name: "ссылки на несуществующую или чужую группу",
		sql: `UPDATE tasks t SET ` + detachTaskSet + `
			WHERE t.group_id <> 0 AND NOT EXISTS (
				SELECT 1 FROM groups g WHERE g.group_id = t.group_id AND g.user_id = t.user_id)`,
	},
	{
		// Явно назначить задаче группу можно только существующую, значит, группа создана раньше задачи.
		// Задача старше своей группы и без связи в group_tasks получила group_id от дефолта БД.
		name: "задачи старше своей группы",
		sql: `UPDATE tasks t SET ` + detachTaskSet + `
			FROM groups g
			WHERE g.group_id = t.group_id
				AND t.created_at > '1970-01-01' AND g.created_at > '1970-01-01'
				AND t.created_at < g.created_at
				AND NOT EXISTS (
					SELECT 1 FROM group_tasks gt WHERE gt.group_group_id = t.group_id AND gt.task_task_id = t.task_id)`,
	},
	{
		// Задача без группы, но с единственной связью в group_tasks с существующей группой того же пользователя:
		// переносим группу в group_id и подгоняем множитель и приоритет под вес группы.
		// Задачи с несколькими связями неоднозначны и остаются без группы.
		name: "перенос единственной связи group_tasks в group_id",
		sql: `UPDATE tasks t SET group_id = l.group_id, group_priority = l.weight,
				priority = t.priority / GREATEST(t.group_priority, 1) * l.weight
			FROM (
				SELECT gt.task_task_id AS task_id, MIN(g.group_id) AS group_id, MIN(g.group_priority) AS weight
				FROM group_tasks gt
				JOIN groups g ON g.group_id = gt.group_group_id
				JOIN tasks t2 ON t2.task_id = gt.task_task_id AND t2.user_id = g.user_id
				GROUP BY gt.task_task_id
				HAVING COUNT(*) = 1
			) l
			WHERE t.task_id = l.task_id AND t.group_id = 0`,
	},
}

// MigrateGroupTasks переносит членство в группах из group_tasks в tasks.group_id и удаляет group_tasks.
// Всё в одной транзакции; если таблицы нет — ничего не делает.
func MigrateGroupTasks(db *gorm.DB, logger *slog.Logger) error {
	if !db.Migrator().HasTable("group_tasks") {
		return nil
	}
	return db.Transaction(func(tx *gorm.DB) error {
		for _, repair := range taskGroupRepairs {
			result := tx.Exec(repair.sql)
			if result.Error != nil {
				return fmt.Errorf("ошибка при исправлении «%s»: %w", repair.name, result.Error)
			}
			if result.RowsAffected > 0 {
				logger.Info("Исправлены связи задач с группами",
					slog.String("rule", repair.name),
					slog.Int64("rows", result.RowsAffected))
			}
		}

		if err := resolveGroupLinkConflicts(tx, logger); err != nil {
			return err
		}

		if err := tx.Migrator().DropTable("group_tasks"); err != nil {
			return fmt.Errorf("ошибка при удалении таблицы group_tasks: %w", err)
		}
		logger.Info("Таблица group_tasks удалена: состав групп определяет tasks.group_id")
		return nil
	})
}

// resolveGroupLinkConflicts — конфликт: строка group_tasks указывает на существующую группу пользователя,
// отличную от ненулевого tasks.group_id задачи. Побеждает group_id: интерфейс всегда показывал группу задачи
// по нему, а связей в group_tasks у задачи может быть несколько. Данные не меняются; каждая отброшенная связь
// пишется в лог, чтобы после удаления group_tasks её можно было восстановить вручную.
func resolveGroupLinkConflicts(tx *gorm.DB, logger *slog.Logger) error {
	var conflicts []struct {
		TaskId      int64
		GroupId     int64
		LinkGroupId int64
	}
	if err := tx.Raw(`SELECT t.task_id, t.group_id, gt.group_group_id AS link_group_id FROM group_tasks gt
		JOIN tasks t ON t.task_id = gt.task_task_id
		JOIN groups g ON g.group_id = gt.group_group_id AND g.user_id = t.user_id
		WHERE t.group_id <> 0 AND gt.group_group_id <> t.group_id
		ORDER BY t.task_id, gt.group_group_id`).Scan(&conflicts).Error; err != nil {
		return fmt.Errorf("ошибка при поиске расходящихся связей: %w", err)
	}
	for _, conflict := range conflicts {
		logger.Warn("Связь в group_tasks расходится с group_id задачи, оставлен group_id",
			slog.Int64("taskId", conflict.TaskId),
			slog.Int64("groupId", conflict.GroupId),
			slog.Int64("droppedLinkGroupId", conflict.LinkGroupId))
	}
	return nil
}

// runMigrations — порядок важен: переименования до AutoMigrate, перенос group_tasks после него.
func runMigrations(db *gorm.DB, logger *slog.Logger) error {
	if err := renameColumns(db, logger); err != nil {
		return err
	}
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
	return nil
}
