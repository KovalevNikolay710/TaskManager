package services

import (
	rep "TaskManager/internal/repository"
	"fmt"

	"gorm.io/gorm"
)

type GenericService[T any] struct {
	Repository *rep.GenericRepository[T]
}

func NewGenericService[T any](db *gorm.DB) *GenericService[T] {
	return &GenericService[T]{Repository: rep.NewGenericRepository[T](db)}
}

// GetByID возвращает запись или ErrNotFound, если её нет.
func (serv *GenericService[T]) GetByID(id int64) (model *T, err error) {
	model, err = serv.Repository.FindByID(id)
	if err != nil {
		return nil, fmt.Errorf("ошибка при поиске по id: %w", err)
	}
	if model == nil {
		return nil, ErrNotFound
	}
	return model, nil
}

// Delete удаляет запись или возвращает ErrNotFound, если её нет.
// Связи many2many удаляются каскадно (FK join-таблиц с ON DELETE CASCADE).
func (serv *GenericService[T]) Delete(id int64) error {
	if _, err := serv.GetByID(id); err != nil {
		return err
	}
	if err := serv.Repository.Delete(id); err != nil {
		return fmt.Errorf("ошибка при удалении записи: %w", err)
	}
	return nil
}
