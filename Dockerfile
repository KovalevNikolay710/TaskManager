FROM golang:1.23.3-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o task_manager ./cmd/taskManager/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/task_manager .
CMD ["./task_manager"]
