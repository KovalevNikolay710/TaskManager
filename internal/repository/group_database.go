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

func (rep *GroupRepositoryImpl) GetAllTasksInGroup(groupId int64) ([]*models.Task, error) {
	var group models.Group

	query := rep.db.Where("group_id = ?", groupId).Preload("Tasks")

	if err := query.First(&group).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске задач группы в базе данных: %s", err)
	}
	return group.Tasks, nil
}

// DeleteDetachingTasks удаляет группу и сохраняет её задачи, уже отвязанные сервисом
// (GroupId, GroupPriorty, Priority), в одной транзакции. Связи в group_tasks удаляются каскадно.
func (rep *GroupRepositoryImpl) DeleteDetachingTasks(groupID int64, tasks []*models.Task) error {
	return rep.db.Transaction(func(tx *gorm.DB) error {
		for _, task := range tasks {
			// Select нужен, чтобы записать нулевые значения (GroupId = 0)
			if err := tx.Model(task).Select("GroupId", "GroupPriorty", "Priority").Updates(task).Error; err != nil {
				return fmt.Errorf("ошибка при отвязке задачи %d от группы: %w", task.TaskId, err)
			}
		}
		if err := tx.Delete(&models.Group{}, groupID).Error; err != nil {
			return fmt.Errorf("ошибка при удалении группы: %w", err)
		}
		return nil
	})
}
