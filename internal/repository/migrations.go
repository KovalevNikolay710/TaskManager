package repository

import (
	"fmt"
	"log/slog"

	"gorm.io/gorm"
)

// Разовая чистка связей задач с группами после старых версий:
//   - с тега `default:1` (коммит 3ec619c) задача без группы сохранялась с group_id = 1;
//   - POST /tasks/ с groupId ставил group_id, но не создавал строку в group_tasks;
//   - ранние версии не проверяли, что группа существует и принадлежит пользователю;
//   - удаление группы оставляло у задач group_id удалённой группы.
//
// Меняется только то, что однозначно ошибочно. Запросы идемпотентны: повторный запуск ничего не меняет,
// поэтому чистка выполняется при каждом старте, сразу после AutoMigrate.
// Колонки join-таблицы GORM называет group_group_id / task_task_id.

// Отвязка задачи от группы: при смене множителя группы Pg на 1 приоритет Pt = Pg * Te / Tl * %in
// делится на старый Pg — так же, как при удалении группы в сервисе.
const detachTaskSet = `group_id = 0, priority = priority / GREATEST(group_priorty, 1), group_priorty = 1`

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
		name: "связи задачи с группой другого пользователя",
		sql: `DELETE FROM group_tasks gt
			USING groups g, tasks t
			WHERE gt.group_group_id = g.group_id AND gt.task_task_id = t.task_id AND g.user_id <> t.user_id`,
	},
	{
		// Дефолт давал только group_id = 1, поэтому любой другой group_id без связи назначен явно
		// через POST /tasks/ — достаточно добавить недостающую связь.
		name: "недостающие связи в group_tasks",
		sql: `INSERT INTO group_tasks (group_group_id, task_task_id)
			SELECT t.group_id, t.task_id FROM tasks t
			JOIN groups g ON g.group_id = t.group_id AND g.user_id = t.user_id
			WHERE t.group_id <> 1 AND NOT EXISTS (
				SELECT 1 FROM group_tasks gt WHERE gt.group_group_id = t.group_id AND gt.task_task_id = t.task_id)
			ON CONFLICT DO NOTHING`,
	},
}

// RepairTaskGroups приводит tasks.group_id и group_tasks к согласованному состоянию по однозначным правилам
// и сообщает в лог о том, что автоматически решить нельзя.
func RepairTaskGroups(db *gorm.DB, logger *slog.Logger) error {
	err := db.Transaction(func(tx *gorm.DB) error {
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
		return nil
	})
	if err != nil {
		return err
	}

	// group_id = 1 без связи у задачи, созданной после группы 1: это либо дефолт БД,
	// либо явный POST /tasks/ с groupId = 1 — различить нельзя, поэтому только сообщаем
	var ambiguous []int64
	if err := db.Raw(`SELECT t.task_id FROM tasks t
		WHERE t.group_id = 1 AND NOT EXISTS (
			SELECT 1 FROM group_tasks gt WHERE gt.group_group_id = 1 AND gt.task_task_id = t.task_id)
		ORDER BY t.task_id`).Scan(&ambiguous).Error; err != nil {
		return fmt.Errorf("ошибка при поиске неоднозначных задач группы 1: %w", err)
	}
	if len(ambiguous) > 0 {
		logger.Warn("Задачи в группе 1 без связи в group_tasks: неизвестно, назначены ли они в группу явно, оставлены как есть",
			slog.Any("taskIds", ambiguous))
	}

	// Связь с группой, отличной от group_id задачи: какая из двух верна, неизвестно
	var mismatched []int64
	if err := db.Raw(`SELECT gt.task_task_id FROM group_tasks gt
		JOIN tasks t ON t.task_id = gt.task_task_id
		WHERE gt.group_group_id <> t.group_id
		ORDER BY gt.task_task_id`).Scan(&mismatched).Error; err != nil {
		return fmt.Errorf("ошибка при поиске расходящихся связей: %w", err)
	}
	if len(mismatched) > 0 {
		logger.Warn("Связь в group_tasks расходится с group_id задачи, оставлено как есть",
			slog.Any("taskIds", mismatched))
	}
	return nil
}
