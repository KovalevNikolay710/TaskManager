package repository

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"TaskManager/internal/models"

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
	for i := 0; i < 5; i++ { // Повторяем до 5 раз
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("Не удалось подключиться к базе данных. Попытка %d: %v\n", i+1, err)
		time.Sleep(5 * time.Second) // Ждём 5 секунд перед новой попыткой
	}

	if err != nil {
		log.Fatalf("Не удалось подключиться к базе данных: %v", err)
	}

	// Автоматическая миграция схемы
	err = db.AutoMigrate(
		&models.Group{},
		&models.Task{},
		&models.Day{},
	)

	if err != nil {
		log.Fatalf("Ошибка миграции схемы: %v", err)
	}
}

func GetDB() *gorm.DB {
	return db
}
