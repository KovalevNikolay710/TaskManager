package repository

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type GenericRepository[T any] struct {
	db *gorm.DB
}

func NewGenericRepository[T any](db *gorm.DB) *GenericRepository[T] {
	return &GenericRepository[T]{db: db}
}

func (r *GenericRepository[T]) Create(entity *T) (*T, error) {
	if err := r.db.Create(entity).Error; err != nil {
		return nil, fmt.Errorf("ошибка при создании записи в базе данных: %w", err)
	}
	return entity, nil
}

// FindByID возвращает запись по id или nil, nil, если её нет. Связи не загружает.
func (r *GenericRepository[T]) FindByID(id int64) (*T, error) {
	var entity T

	if err := r.db.First(&entity, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("ошибка при поиске в базе данных: %w", err)
	}
	return &entity, nil
}
