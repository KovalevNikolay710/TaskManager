package api

import (
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	apiPrefix = "/api"
	indexFile = "index.html"
	// Vite кладёт файлы с хешем в имени в assets/ — их можно кешировать навсегда
	assetsDir = "assets/"
)

// contentTypes — типы для расширений, которых нет во встроенной таблице mime в Go
// (и которые не гарантированы в /etc/mime.types образа alpine). Без этого манифест PWA
// ушёл бы как text/plain после угадывания по содержимому.
var contentTypes = map[string]string{
	".webmanifest": "application/manifest+json",
}

// RegisterFrontend раздаёт собранный фронтенд из dist: существующие файлы — как есть,
// остальные GET-пути не под /api — index.html (маршрутизацию делает SPA).
// Неизвестные пути под /api и не-GET запросы получают 404 JSON.
func RegisterFrontend(router *gin.Engine, dist fs.FS, logger *slog.Logger) {
	if _, err := fs.Stat(dist, indexFile); err != nil {
		logger.Warn("фронтенд не собран: index.html не найден во встроенном web/dist, отдаётся только API")
	}

	router.NoRoute(func(c *gin.Context) {
		reqPath := c.Request.URL.Path
		isGet := c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead
		if !isGet || reqPath == apiPrefix || strings.HasPrefix(reqPath, apiPrefix+"/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "маршрут не найден"})
			return
		}

		name := strings.TrimPrefix(path.Clean("/"+reqPath), "/")
		if name != "" && serveFile(c, dist, name, logger) {
			return
		}
		// Отсутствующий ассет — это 404, а не SPA-маршрут: иначе браузер получит HTML вместо JS/CSS
		if strings.HasPrefix(name, assetsDir) {
			c.JSON(http.StatusNotFound, gin.H{"error": "файл не найден"})
			return
		}
		if !serveFile(c, dist, indexFile, logger) {
			c.JSON(http.StatusNotFound, gin.H{"error": "фронтенд не собран"})
		}
	})
}

// serveFile отдаёт обычный файл из dist; false — файла нет (или это каталог/скрытый файл).
func serveFile(c *gin.Context, dist fs.FS, name string, logger *slog.Logger) bool {
	if strings.HasPrefix(path.Base(name), ".") {
		return false
	}
	file, err := dist.Open(name)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			logger.Error("ошибка чтения встроенного файла", slog.String("file", name), slog.Any("error", err))
		}
		return false
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || info.IsDir() {
		return false
	}
	content, ok := file.(io.ReadSeeker)
	if !ok {
		return false
	}

	if strings.HasPrefix(name, assetsDir) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		// index.html, sw.js, manifest.webmanifest, иконки — имена без хеша: всегда перепроверять,
		// чтобы после деплоя подтягивались новая сборка и новая версия service worker
		c.Header("Cache-Control", "no-cache")
	}
	if contentType, ok := contentTypes[path.Ext(name)]; ok {
		c.Header("Content-Type", contentType)
	}
	// У встроенных файлов нет времени изменения; если Content-Type не задан выше,
	// ServeContent выставит его по расширению
	http.ServeContent(c.Writer, c.Request, name, time.Time{}, content)
	return true
}
