package handlers

import (
	"TaskManager/internal/services"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRespondErrorHidesInternalDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	respondError(context, logger, errors.New("pq: relation \"tasks\" does not exist"), "ошибка")

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", recorder.Code)
	}
	body := recorder.Body.String()
	if strings.Contains(body, "relation") {
		t.Errorf("тело ответа раскрывает внутреннюю ошибку: %s", body)
	}
	if !strings.Contains(body, "Внутренняя ошибка сервера (код ") {
		t.Errorf("нет общего текста с кодом: %s", body)
	}
}

func TestRespondErrorKeepsBusinessErrorText(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	respondError(context, logger, services.ErrTaskNotFound, "ошибка")

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), services.ErrTaskNotFound.Error()) {
		t.Errorf("тело = %s, want текст бизнес-ошибки", recorder.Body.String())
	}
}
