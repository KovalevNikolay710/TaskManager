package services_test

// Проверка владельца в сервисных методах …ForUser (нужен PostgreSQL, см. internal/testdb).

import (
	"errors"
	"testing"

	"TaskManager/internal/models"
	"TaskManager/internal/services"
)

func TestTaskForUserOwnerCheck(t *testing.T) {
	e := newEnv(t)
	const owner, stranger = int64(1), int64(2)
	task := e.newTask(t, owner, "своя", 0, 60, 10, 0)

	t.Run("владелец видит задачу", func(t *testing.T) {
		got, err := e.tasks.GetTaskForUser(owner, task.TaskId)
		if err != nil || got.TaskId != task.TaskId {
			t.Fatalf("GetTaskForUser: task=%v err=%v", got, err)
		}
	})

	t.Run("чужая и несуществующая — не найдена", func(t *testing.T) {
		for _, id := range []int64{task.TaskId, task.TaskId + 1000} {
			if _, err := e.tasks.GetTaskForUser(stranger, id); !errors.Is(err, services.ErrTaskNotFound) {
				t.Errorf("GetTaskForUser(чужой, %d): err=%v, ожидалось ErrTaskNotFound", id, err)
			}
		}
		name := "взлом"
		if _, err := e.tasks.UpdateTaskForUser(stranger, task.TaskId, models.TaskUpdateRequest{Name: &name}); !errors.Is(err, services.ErrTaskNotFound) {
			t.Errorf("UpdateTaskForUser(чужой): err=%v, ожидалось ErrTaskNotFound", err)
		}
		if err := e.tasks.DeleteTaskForUser(stranger, task.TaskId); !errors.Is(err, services.ErrTaskNotFound) {
			t.Errorf("DeleteTaskForUser(чужой): err=%v, ожидалось ErrTaskNotFound", err)
		}
	})

	t.Run("чужие попытки ничего не изменили", func(t *testing.T) {
		got := e.reload(t, task.TaskId)
		if got.Name != "своя" {
			t.Errorf("имя изменено чужим пользователем: %q", got.Name)
		}
	})

	t.Run("владелец обновляет и удаляет", func(t *testing.T) {
		name := "новое имя"
		updated, err := e.tasks.UpdateTaskForUser(owner, task.TaskId, models.TaskUpdateRequest{Name: &name})
		if err != nil || updated.Name != name {
			t.Fatalf("UpdateTaskForUser: task=%v err=%v", updated, err)
		}
		if err := e.tasks.DeleteTaskForUser(owner, task.TaskId); err != nil {
			t.Fatalf("DeleteTaskForUser: %v", err)
		}
		if _, err := e.tasks.GetById(task.TaskId); !errors.Is(err, services.ErrTaskNotFound) {
			t.Errorf("GetById после удаления: err=%v, ожидалось ErrTaskNotFound", err)
		}
	})
}

func TestGroupForUserOwnerCheck(t *testing.T) {
	e := newEnv(t)
	const owner, stranger = int64(1), int64(2)
	group := e.newGroup(t, owner, "своя группа", 3)

	if got, err := e.groups.GetGroupForUser(owner, group.GroupId); err != nil || got.GroupId != group.GroupId {
		t.Fatalf("GetGroupForUser: group=%v err=%v", got, err)
	}
	if _, err := e.groups.GetGroupForUser(stranger, group.GroupId); !errors.Is(err, services.ErrGroupNotFound) {
		t.Errorf("GetGroupForUser(чужой): err=%v, ожидалось ErrGroupNotFound", err)
	}
	name := "взлом"
	if _, err := e.groups.UpdateGroupForUser(stranger, group.GroupId, models.GroupUpdateRequest{Name: &name}); !errors.Is(err, services.ErrGroupNotFound) {
		t.Errorf("UpdateGroupForUser(чужой): err=%v, ожидалось ErrGroupNotFound", err)
	}
	if err := e.groups.DeleteGroupForUser(stranger, group.GroupId); !errors.Is(err, services.ErrGroupNotFound) {
		t.Errorf("DeleteGroupForUser(чужой): err=%v, ожидалось ErrGroupNotFound", err)
	}
	if got, err := e.groups.GetGroupByID(group.GroupId); err != nil || got.Name != "своя группа" {
		t.Errorf("группа изменена или удалена чужим: group=%v err=%v", got, err)
	}
}
