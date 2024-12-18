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

func (serv *GenericService[T]) GetByID(id int64) (model *T, err error) {
	model, err = serv.Repository.FindByID(id)
	if err != nil {
		return nil, fmt.Errorf("ошибка поиске по id: %s", err)
	}
	if model == nil {
		return nil, fmt.Errorf("нет записи с таким ID")
	}
	return model, nil
}

func (serv *GenericService[T]) Delete(id int64) error {
	err := serv.Repository.Delete(id)
	if err != nil {
		return fmt.Errorf("Ошибка при удалении записи: %w", err)
	}
	return nil
}
