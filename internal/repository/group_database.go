package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type GroupRepositoryImpl struct {
	*GenericRepository[models.Group]
}

func NewGroupRepository(db *gorm.DB) *GroupRepositoryImpl {
	return &GroupRepositoryImpl{
		GenericRepository: NewGenericRepository[models.Group](db),
	}
}

// loadTasks заполняет Group.Tasks задачами групп по Task.GroupId (единственный источник состава группы);
// у группы без задач список пустой, а не nil.
func (rep *GroupRepositoryImpl) loadTasks(groups ...*models.Group) error {
	if len(groups) == 0 {
		return nil
	}
	byID := make(map[int64]*models.Group, len(groups))
	ids := make([]int64, 0, len(groups))
	for _, group := range groups {
		group.Tasks = []*models.Task{}
		byID[group.GroupId] = group
		ids = append(ids, group.GroupId)
	}
	var tasks []*models.Task
	if err := rep.db.Where("group_id IN ?", ids).Order("task_id").Find(&tasks).Error; err != nil {
		return fmt.Errorf("ошибка при поиске задач групп в базе данных: %w", err)
	}
	for _, task := range tasks {
		group := byID[task.GroupId]
		group.Tasks = append(group.Tasks, task)
	}
	return nil
}

// FindByIDWithTasks возвращает группу вместе с задачами (по Task.GroupId) или nil, nil, если группы нет.
func (rep *GroupRepositoryImpl) FindByIDWithTasks(groupID int64) (*models.Group, error) {
	var group models.Group
	if err := rep.db.First(&group, groupID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("ошибка при поиске группы с задачами в базе данных: %w", err)
	}
	if err := rep.loadTasks(&group); err != nil {
		return nil, err
	}
	return &group, nil
}

// FindUserGroup возвращает группу пользователя без задач или nil, nil, если группы нет или она чужая.
func (rep *GroupRepositoryImpl) FindUserGroup(userID, groupID int64) (*models.Group, error) {
	var group models.Group
	if err := rep.db.Where("user_id = ?", userID).First(&group, groupID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("ошибка при поиске группы пользователя в базе данных: %w", err)
	}
	return &group, nil
}

// GetAllUserGroups возвращает группы пользователя с задачами: клиент показывает их в списке групп.
func (rep *GroupRepositoryImpl) GetAllUserGroups(userID int64) ([]*models.Group, error) {
	var groups []*models.Group
	if err := rep.db.Where("user_id = ?", userID).Find(&groups).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске групп в базе данных: %w", err)
	}
	if err := rep.loadTasks(groups...); err != nil {
		return nil, err
	}
	return groups, nil
}

// ExistsByName проверяет, есть ли у пользователя группа с таким названием без учёта регистра
// и пробелов по краям; excludeID — группа, которую не учитывать (0 — учитывать все).
func (rep *GroupRepositoryImpl) ExistsByName(userID int64, name string, excludeID int64) (bool, error) {
	var count int64
	if err := rep.db.Model(&models.Group{}).
		Where("user_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND group_id <> ?", userID, name, excludeID).
		Count(&count).Error; err != nil {
		return false, fmt.Errorf("ошибка при проверке названия группы: %w", err)
	}
	return count > 0, nil
}

// UpdateWithTasks сохраняет группу и её задачи с уже пересчитанными сервисом весом и приоритетом
// в одной транзакции. Состав группы (Task.GroupId) не меняется.
func (rep *GroupRepositoryImpl) UpdateWithTasks(group *models.Group, tasks []*models.Task, now time.Time) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(group).Select("Name", "Description", "GroupPriority").Updates(group).Error; err != nil {
			return fmt.Errorf("ошибка при обновлении группы: %w", err)
		}
		return saveTaskGroupFields(tx, tasks, now)
	})
}

// UpdateWeightsWithTasks сохраняет веса нескольких групп и их задачи с пересчитанным сервисом
// приоритетом в одной транзакции: либо применяется всё, либо ничего.
func (rep *GroupRepositoryImpl) UpdateWeightsWithTasks(groups []*models.Group, tasks []*models.Task, now time.Time) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		for _, group := range groups {
			if err := tx.Model(group).Select("GroupPriority").Updates(group).Error; err != nil {
				return fmt.Errorf("ошибка при обновлении веса группы %d: %w", group.GroupId, err)
			}
		}
		return saveTaskGroupFields(tx, tasks, now)
	})
}

// FindUserGroupsByIDs возвращает группы пользователя с указанными id; чужие и несуществующие не попадают.
func (rep *GroupRepositoryImpl) FindUserGroupsByIDs(userID int64, groupIDs []int64) ([]*models.Group, error) {
	var groups []*models.Group
	if err := rep.db.Where("user_id = ? AND group_id IN ?", userID, groupIDs).Find(&groups).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске групп пользователя: %w", err)
	}
	return groups, nil
}

// taskGroupFieldsChunk — задач в одном UPDATE: 5 параметров на строку, до лимита 65535 параметров протокола далеко.
const taskGroupFieldsChunk = 1000

// saveTaskGroupFields записывает поля группы у задач и updated_at пакетами: один UPDATE ... FROM (VALUES ...) на пачку
// вместо UPDATE на каждую задачу. Значения уже посчитаны сервисом; формулы приоритета в SQL нет.
func saveTaskGroupFields(tx *gorm.DB, tasks []*models.Task, now time.Time) error {
	for start := 0; start < len(tasks); start += taskGroupFieldsChunk {
		chunk := tasks[start:min(start+taskGroupFieldsChunk, len(tasks))]
		rows := make([]string, len(chunk))
		args := make([]any, 1, len(chunk)*5+1)
		args[0] = now // updated_at, первый плейсхолдер в SQL
		for i, task := range chunk {
			rows[i] = "(?::bigint, ?::bigint, ?::bigint, ?::bigint, ?::double precision)"
			args = append(args, task.TaskId, task.GroupId, task.GroupPriority, task.HoursUntilDeadline, task.Priority)
		}
		sql := `UPDATE tasks AS t SET updated_at = ?::timestamptz, group_id = v.group_id, group_priority = v.group_priority,
			hours_until_deadline = v.hours_until_deadline, priority = v.priority
			FROM (VALUES ` + strings.Join(rows, ", ") + `) AS v(task_id, group_id, group_priority, hours_until_deadline, priority)
			WHERE t.task_id = v.task_id`
		if err := tx.Exec(sql, args...).Error; err != nil {
			return fmt.Errorf("ошибка при обновлении задач группы: %w", err)
		}
	}
	return nil
}

// DeleteDetachingTasks удаляет группу и сохраняет её задачи, уже отвязанные сервисом
// (GroupId, GroupPriority, Priority), в одной транзакции.
func (rep *GroupRepositoryImpl) DeleteDetachingTasks(groupID int64, tasks []*models.Task, now time.Time) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		if err := saveTaskGroupFields(tx, tasks, now); err != nil {
			return fmt.Errorf("ошибка при отвязке задач от группы: %w", err)
		}
		if err := tx.Delete(&models.Group{}, groupID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении группы: %w", err)
		}
		return nil
	})
}
