package repository

import (
	"TaskManager/internal/models"
	"fmt"

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

func (rep *GroupRepositoryImpl) GetAllUserGroups(userID int64) ([]*models.Group, error) {
	var groups []*models.Group
	query := rep.db.Where("user_id = ?", userID)

	query = query.Preload("Tasks")

	if err := query.Find(&groups).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске групп в базе данных: %s", err)
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

// taskGroupFields — поля задачи, которые меняются вместе с группой.
// Select нужен, чтобы записать и нулевые значения (GroupId = 0).
var taskGroupFields = []string{"GroupId", "GroupPriorty", "NumberOfHoursUntilDL", "Priority"}

// UpdateWithTasks сохраняет группу и её задачи с уже пересчитанными сервисом весом и приоритетом
// в одной транзакции. Состав группы (group_tasks) не меняется.
func (rep *GroupRepositoryImpl) UpdateWithTasks(group *models.Group, tasks []*models.Task) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(group).Select("Name", "Description", "GroupPriority").Updates(group).Error; err != nil {
			return fmt.Errorf("ошибка при обновлении группы: %w", err)
		}
		for _, task := range tasks {
			if err := tx.Model(task).Select(taskGroupFields).Updates(task).Error; err != nil {
				return fmt.Errorf("ошибка при обновлении задачи %d группы: %w", task.TaskId, err)
			}
		}
		return nil
	})
}

// DeleteDetachingTasks удаляет группу и сохраняет её задачи, уже отвязанные сервисом
// (GroupId, GroupPriorty, Priority), и связи группы в group_tasks в одной транзакции.
func (rep *GroupRepositoryImpl) DeleteDetachingTasks(groupID int64, tasks []*models.Task) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		for _, task := range tasks {
			if err := tx.Model(task).Select(taskGroupFields).Updates(task).Error; err != nil {
				return fmt.Errorf("ошибка при отвязке задачи %d от группы: %w", task.TaskId, err)
			}
		}
		// Явно, не полагаясь на ON DELETE CASCADE: в старых базах его может не быть
		if err := tx.Exec("DELETE FROM group_tasks WHERE group_group_id = ?", groupID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении связей группы: %w", err)
		}
		if err := tx.Delete(&models.Group{}, groupID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении группы: %w", err)
		}
		return nil
	})
}
