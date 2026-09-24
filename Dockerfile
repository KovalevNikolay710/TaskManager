# 1. Фронтенд: собираем web/dist
FROM node:lts-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2. Бэкенд: Go-бинарник со встроенным web/dist (go:embed в web/embed.go)
FROM golang:1.26.3-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o task_manager ./cmd/taskManager

# 3. Итоговый образ: только бинарник
FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/task_manager .
EXPOSE 8080
CMD ["./task_manager"]
