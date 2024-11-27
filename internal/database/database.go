package database

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var db *gorm.DB

func Connect() {
	DBHost := os.Getenv("DB_HOST")
	DBPort, _ := strconv.Atoi(os.Getenv("DB_PORT"))
	DBUser := os.Getenv("DB_USER")
	DBPassword := os.Getenv("DB_PASSWORD")
	DBName := os.Getenv("DB_NAME")

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=disable",
		DBHost, DBUser, DBPassword, DBName, DBPort)

	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Не удалось подключиться к базе данных: %v", err)
	}

	// Автоматическая миграция схемы
	err = db.AutoMigrate(
		&Task{},
		&Group{},
		&Day{},
		&User{},
	)

	if err != nil {
		log.Fatalf("Ошибка миграции схемы: %v", err)
	}
}
