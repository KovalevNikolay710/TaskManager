package services_test

// GET /api/tasks/user/:user_id: фильтр из query-параметров.

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"TaskManager/internal/api/handlers"
	"TaskManager/internal/models"

	"github.com/gin-gonic/gin"
)

func TestGetTasksByUser_QueryFilter(t *testing.T) {
	e := newEnv(t)
	group := e.newGroup(t, 1, "G", 4)
	inGroup := e.newTask(t, 1, "в группе", group.GroupId, 60, 10, 0)
	free := e.newTask(t, 1, "без группы", 0, 30, 20, 0)
	done := e.newTask(t, 1, "готова", group.GroupId, 30, 30, 0)
	status := uint16(models.StatusCompleted)
	if _, err := e.tasks.UpdateTask(done.TaskId, models.TaskUpdateRequest{Status: &status}); err != nil {
		t.Fatal(err)
	}

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := handlers.NewTaskHandler(e.tasks, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router.GET("/api/tasks/user/:user_id", handler.GetTasksByUserID)

	get := func(query url.Values) (int, []models.Task) {
		t.Helper()
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/tasks/user/1?"+query.Encode(), nil))
		var tasks []models.Task
		_ = json.Unmarshal(rec.Body.Bytes(), &tasks)
		return rec.Code, tasks
	}
	ids := func(tasks []models.Task) map[int64]bool {
		m := map[int64]bool{}
		for _, task := range tasks {
			m[task.TaskId] = true
		}
		return m
	}

	cases := []struct {
		name  string
		query url.Values
		want  []int64
	}{
		{"без фильтра", url.Values{}, []int64{inGroup.TaskId, free.TaskId, done.TaskId}},
		{"статус", url.Values{"status": {"2"}}, []int64{done.TaskId}},
		{"группа", url.Values{"groupId": {strconv.FormatInt(group.GroupId, 10)}}, []int64{inGroup.TaskId, done.TaskId}},
		{"группа и статус", url.Values{"groupId": {strconv.FormatInt(group.GroupId, 10)}, "status": {"1"}}, []int64{inGroup.TaskId}},
		{"дата", url.Values{"date": {inHours(15).Format("2006-01-02T15:04:05Z07:00")}}, []int64{free.TaskId, done.TaskId}},
	}
	for _, c := range cases {
		code, tasks := get(c.query)
		got := ids(tasks)
		if code != http.StatusOK || len(got) != len(c.want) {
			t.Errorf("%s: code=%d tasks=%v, want %v", c.name, code, got, c.want)
			continue
		}
		for _, id := range c.want {
			if !got[id] {
				t.Errorf("%s: нет задачи %d в %v", c.name, id, got)
			}
		}
	}

	if code, _ := get(url.Values{"status": {"abc"}}); code != http.StatusBadRequest {
		t.Errorf("неверный status: code=%d, want 400", code)
	}
}
