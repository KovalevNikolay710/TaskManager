// Package web встраивает собранный фронтенд (web/dist) в Go-бинарник.
//
// Перед сборкой бинарника нужно выполнить `npm run build` в web/.
// Без этого встроится только dist/.gitkeep, и сервер будет отдавать API
// без интерфейса.
package web

import (
	"embed"
	"io/fs"
)

// all: нужен, чтобы шаблон совпал и с пустым dist (в нём лежит только .gitkeep).
//
//go:embed all:dist
var dist embed.FS

// Dist возвращает содержимое web/dist с корнем в самой папке dist.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		// fs.Sub падает только на некорректном пути, а путь здесь константный
		panic(err)
	}
	return sub
}
