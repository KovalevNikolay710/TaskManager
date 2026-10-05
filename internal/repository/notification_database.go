package repository

import (
	"TaskManager/internal/models"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// PushSubscriptionRepositoryImpl — подписки устройств на push.
type PushSubscriptionRepositoryImpl struct {
	*GenericRepository[models.PushSubscription]
}

func NewPushSubscriptionRepository(db *gorm.DB) *PushSubscriptionRepositoryImpl {
	return &PushSubscriptionRepositoryImpl{GenericRepository: NewGenericRepository[models.PushSubscription](db)}
}

// FindByEndpoint возвращает подписку по адресу push-сервиса или nil, nil, если её нет.
func (rep *PushSubscriptionRepositoryImpl) FindByEndpoint(endpoint string) (*models.PushSubscription, error) {
	var sub models.PushSubscription
	if err := rep.db.Where("endpoint = ?", endpoint).First(&sub).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("ошибка при поиске подписки в базе данных: %w", err)
	}
	return &sub, nil
}

// FindByUserID возвращает все подписки пользователя (по одной на устройство).
func (rep *PushSubscriptionRepositoryImpl) FindByUserID(userID int64) ([]*models.PushSubscription, error) {
	var subs []*models.PushSubscription
	if err := rep.db.Where("user_id = ?", userID).Order("subscription_id").Find(&subs).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске подписок пользователя %d: %w", userID, err)
	}
	return subs, nil
}

// FindUserIDs возвращает пользователей, у которых есть хотя бы одна подписка.
func (rep *PushSubscriptionRepositoryImpl) FindUserIDs() ([]int64, error) {
	var ids []int64
	if err := rep.db.Model(&models.PushSubscription{}).Distinct().Order("user_id").Pluck("user_id", &ids).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске пользователей с подписками: %w", err)
	}
	return ids, nil
}

// Upsert сохраняет подписку по Endpoint: новую создаёт, у существующей обновляет пользователя,
// ключи и UserAgent. Возвращает сохранённую строку и признак «создана».
func (rep *PushSubscriptionRepositoryImpl) Upsert(sub *models.PushSubscription) (*models.PushSubscription, bool, error) {
	created := false
	var saved models.PushSubscription
	err := rep.db.Transaction(func(tx *gorm.DB) error {
		var existing int64
		if err := tx.Model(&models.PushSubscription{}).Where("endpoint = ?", sub.Endpoint).Count(&existing).Error; err != nil {
			return fmt.Errorf("ошибка при поиске подписки: %w", err)
		}
		created = existing == 0

		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "endpoint"}},
			DoUpdates: clause.AssignmentColumns([]string{"user_id", "p256dh", "auth", "user_agent", "updated_at"}),
		}).Create(sub).Error; err != nil {
			return fmt.Errorf("ошибка при сохранении подписки: %w", err)
		}
		if err := tx.Where("endpoint = ?", sub.Endpoint).First(&saved).Error; err != nil {
			return fmt.Errorf("ошибка при перечитывании подписки: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return &saved, created, nil
}

// DeleteByEndpoint удаляет подписку пользователя; false — такой подписки нет.
func (rep *PushSubscriptionRepositoryImpl) DeleteByEndpoint(userID int64, endpoint string) (bool, error) {
	result := rep.db.Where("user_id = ? AND endpoint = ?", userID, endpoint).Delete(&models.PushSubscription{})
	if result.Error != nil {
		return false, fmt.Errorf("ошибка при удалении подписки: %w", result.Error)
	}
	return result.RowsAffected > 0, nil
}

// DeleteByID удаляет подписку по id (мёртвую: push-сервис её больше не принимает).
func (rep *PushSubscriptionRepositoryImpl) DeleteByID(subscriptionID int64) error {
	if err := rep.db.Delete(&models.PushSubscription{}, subscriptionID).Error; err != nil {
		return fmt.Errorf("ошибка при удалении подписки %d: %w", subscriptionID, err)
	}
	return nil
}

// NotificationSettingsRepositoryImpl — настройки напоминаний.
type NotificationSettingsRepositoryImpl struct {
	*GenericRepository[models.NotificationSettings]
}

func NewNotificationSettingsRepository(db *gorm.DB) *NotificationSettingsRepositoryImpl {
	return &NotificationSettingsRepositoryImpl{GenericRepository: NewGenericRepository[models.NotificationSettings](db)}
}

// FindByUserID возвращает настройки пользователя или nil, nil, если строки ещё нет.
func (rep *NotificationSettingsRepositoryImpl) FindByUserID(userID int64) (*models.NotificationSettings, error) {
	// Find, а не First: отсутствие строки — обычный случай (настройки по умолчанию), GORM не пишет его в лог как ошибку
	var settings models.NotificationSettings
	result := rep.db.Where("user_id = ?", userID).Limit(1).Find(&settings)
	if result.Error != nil {
		return nil, fmt.Errorf("ошибка при поиске настроек уведомлений: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &settings, nil
}

// FindByUserIDs возвращает настройки перечисленных пользователей; у кого строки нет, тех в карте нет.
func (rep *NotificationSettingsRepositoryImpl) FindByUserIDs(userIDs []int64) (map[int64]models.NotificationSettings, error) {
	result := make(map[int64]models.NotificationSettings, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	var rows []models.NotificationSettings
	if err := rep.db.Where("user_id IN ?", userIDs).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("ошибка при поиске настроек уведомлений: %w", err)
	}
	for _, row := range rows {
		result[row.UserId] = row
	}
	return result, nil
}

// Update меняет настройки пользователя под блокировкой строки: если строки нет, создаёт её
// со значениями по умолчанию, затем вызывает apply и сохраняет все поля. Ошибка apply
// откатывает транзакцию. Блокировка нужна, чтобы два быстрых частичных обновления
// (например, два переключателя подряд) не затёрли друг друга.
func (rep *NotificationSettingsRepositoryImpl) Update(userID int64, apply func(settings *models.NotificationSettings) error) (*models.NotificationSettings, error) {
	var settings models.NotificationSettings
	err := rep.db.Transaction(func(tx *gorm.DB) error {
		// Все булевы значения по умолчанию — true, поэтому GORM вставит их как есть
		defaults := models.DefaultNotificationSettings(userID)
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&defaults).Error; err != nil {
			return fmt.Errorf("ошибка при создании настроек уведомлений: %w", err)
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&settings).Error; err != nil {
			return fmt.Errorf("ошибка при чтении настроек уведомлений: %w", err)
		}
		if err := apply(&settings); err != nil {
			return err
		}
		// Select("*") — чтобы сохранились и нулевые значения (false), а не подставились DEFAULT из тегов
		if err := tx.Model(&settings).Select("*").Omit("UserId").Updates(&settings).Error; err != nil {
			return fmt.Errorf("ошибка при сохранении настроек уведомлений: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

// VapidKeysRepositoryImpl — ключи VAPID сервера.
type VapidKeysRepositoryImpl struct {
	db *gorm.DB
}

func NewVapidKeysRepository(db *gorm.DB) *VapidKeysRepositoryImpl {
	return &VapidKeysRepositoryImpl{db: db}
}

// GetOrCreate возвращает сохранённые ключи; если их нет, сохраняет ключи из generate.
// Вставка — INSERT ... ON CONFLICT DO NOTHING с перечитыванием в той же транзакции:
// при двух параллельных стартах оба получат одну и ту же пару. created — ключи созданы этим вызовом.
func (rep *VapidKeysRepositoryImpl) GetOrCreate(generate func() (models.VapidKeys, error)) (*models.VapidKeys, bool, error) {
	var keys models.VapidKeys
	created := false
	err := rep.db.Transaction(func(tx *gorm.DB) error {
		found := tx.Limit(1).Find(&keys, models.VapidKeysID)
		if found.Error != nil {
			return fmt.Errorf("ошибка при чтении VAPID-ключей: %w", found.Error)
		}
		if found.RowsAffected > 0 {
			return nil
		}

		fresh, err := generate()
		if err != nil {
			return err
		}
		fresh.Id = models.VapidKeysID
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&fresh)
		if result.Error != nil {
			return fmt.Errorf("ошибка при сохранении VAPID-ключей: %w", result.Error)
		}
		created = result.RowsAffected == 1
		if err := tx.First(&keys, models.VapidKeysID).Error; err != nil {
			return fmt.Errorf("ошибка при перечитывании VAPID-ключей: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return &keys, created, nil
}

// NotificationLogRepositoryImpl — журнал отправленных напоминаний.
type NotificationLogRepositoryImpl struct {
	db *gorm.DB
}

func NewNotificationLogRepository(db *gorm.DB) *NotificationLogRepositoryImpl {
	return &NotificationLogRepositoryImpl{db: db}
}

// TryRecord записывает напоминание в журнал, если такого ещё нет (уникальный индекс
// UserId, Kind, TaskId, Key). Проверка и запись — одна команда INSERT ... ON CONFLICT DO NOTHING,
// поэтому два параллельных вызова не запишут одно напоминание дважды. false — уже было.
func (rep *NotificationLogRepositoryImpl) TryRecord(entry *models.NotificationLog) (bool, error) {
	if entry.SentAt.IsZero() {
		entry.SentAt = time.Now()
	}
	result := rep.db.Clauses(clause.OnConflict{DoNothing: true}).Create(entry)
	if result.Error != nil {
		return false, fmt.Errorf("ошибка при записи в журнал уведомлений: %w", result.Error)
	}
	return result.RowsAffected == 1, nil
}
