package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

const (
	noCache   = "no-cache"
	immutable = "public, max-age=31536000, immutable"
)

func newFrontendRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dist := fstest.MapFS{
		"index.html":           {Data: []byte("<!doctype html><title>TaskManager</title>")},
		"sw.js":                {Data: []byte("self.addEventListener('fetch', () => {})")},
		"manifest.webmanifest": {Data: []byte(`{"name":"TaskManager","start_url":"/"}`)},
		"favicon.svg":          {Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)},
		"icons/icon.svg":       {Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)},
		"icons/icon-192.png":   {Data: []byte("\x89PNG\r\n\x1a\n")},
		"assets/index-abc.js":  {Data: []byte("console.log(1)")},
		"assets/index-abc.css": {Data: []byte("body{}")},
		".gitkeep":             {Data: []byte{}},
	}

	router := gin.New()
	router.GET("/api/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	RegisterFrontend(router, dist, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return router
}

func TestRegisterFrontend(t *testing.T) {
	router := newFrontendRouter(t)

	tests := []struct {
		name         string
		method       string
		path         string
		wantStatus   int
		wantType     string // префикс Content-Type
		wantCache    string // точное значение Cache-Control; пусто — не проверяется
		wantBodyPart string
	}{
		{"service worker — файл, перепроверяется", http.MethodGet, "/sw.js", http.StatusOK, "text/javascript", noCache, "addEventListener"},
		{"манифест PWA — свой тип, перепроверяется", http.MethodGet, "/manifest.webmanifest", http.StatusOK, "application/manifest+json", noCache, `"start_url"`},
		{"HEAD манифеста", http.MethodHead, "/manifest.webmanifest", http.StatusOK, "application/manifest+json", noCache, ""},
		{"PNG-иконка", http.MethodGet, "/icons/icon-192.png", http.StatusOK, "image/png", noCache, ""},
		{"SVG-иконка", http.MethodGet, "/icons/icon.svg", http.StatusOK, "image/svg+xml", noCache, "<svg"},
		{"favicon", http.MethodGet, "/favicon.svg", http.StatusOK, "image/svg+xml", noCache, "<svg"},
		{"ассет с хешем кешируется навсегда", http.MethodGet, "/assets/index-abc.js", http.StatusOK, "text/javascript", immutable, "console.log"},
		{"css-ассет", http.MethodGet, "/assets/index-abc.css", http.StatusOK, "text/css", immutable, "body"},
		{"отсутствующий ассет — 404, а не index.html", http.MethodGet, "/assets/missing.js", http.StatusNotFound, "application/json", "", "файл не найден"},
		{"корень — index.html", http.MethodGet, "/", http.StatusOK, "text/html", noCache, "TaskManager"},
		{"маршрут SPA — index.html", http.MethodGet, "/all-tasks?quick=1", http.StatusOK, "text/html", noCache, "TaskManager"},
		{"вложенный маршрут SPA — index.html", http.MethodGet, "/tasks/42", http.StatusOK, "text/html", noCache, "TaskManager"},
		{"скрытый файл не отдаётся", http.MethodGet, "/.gitkeep", http.StatusOK, "text/html", noCache, "TaskManager"},
		{"существующий маршрут API", http.MethodGet, "/api/ping", http.StatusOK, "application/json", "", `"ok":true`},
		{"неизвестный маршрут API — 404 JSON", http.MethodGet, "/api/unknown", http.StatusNotFound, "application/json", "", "маршрут не найден"},
		{"сам /api — 404 JSON", http.MethodGet, "/api", http.StatusNotFound, "application/json", "", "маршрут не найден"},
		{"не-GET вне API — 404 JSON", http.MethodPost, "/sw.js", http.StatusNotFound, "application/json", "", "маршрут не найден"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("статус = %d, ожидался %d (тело: %q)", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, tt.wantType) {
				t.Errorf("Content-Type = %q, ожидался с префиксом %q", got, tt.wantType)
			}
			if tt.wantCache != "" {
				if got := rec.Header().Get("Cache-Control"); got != tt.wantCache {
					t.Errorf("Cache-Control = %q, ожидался %q", got, tt.wantCache)
				}
			}
			if tt.wantBodyPart != "" && !strings.Contains(rec.Body.String(), tt.wantBodyPart) {
				t.Errorf("тело %q не содержит %q", rec.Body.String(), tt.wantBodyPart)
			}
		})
	}
}

func TestRegisterFrontendWithoutBuild(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	// Фронтенд не собран: во встроенном dist только .gitkeep
	RegisterFrontend(router, fstest.MapFS{".gitkeep": {Data: []byte{}}}, slog.New(slog.NewTextHandler(io.Discard, nil)))

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/day", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("статус = %d, ожидался %d", rec.Code, http.StatusNotFound)
	}
	if !strings.Contains(rec.Body.String(), "фронтенд не собран") {
		t.Errorf("тело %q не содержит сообщения о несобранном фронтенде", rec.Body.String())
	}
}
