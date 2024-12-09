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
		return nil, fmt.Errorf("ошибка при записи в базу данных: %w", err)
	}
	return entity, nil
}

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

func (r *GenericRepository[T]) Update(entity *T) (*T, error) {
	if err := r.db.Save(entity).Error; err != nil {
		return nil, fmt.Errorf("ошибка при обновлении в базе данных: %w", err)
	}
	return entity, nil
}

func (r *GenericRepository[T]) Delete(id int64) error {
	if err := r.db.Delete(new(T), id).Error; err != nil {
		return fmt.Errorf("ошибка при удалении по id: %w", err)
	}
	return nil
}
