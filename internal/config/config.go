// Package config — настройки сервера: переменные окружения и, при желании, YAML-файл (CONFIG_PATH).
// Переменные окружения важнее файла; без файла достаточно одних переменных.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"

	"github.com/ilyakaznacheev/cleanenv"
)

type Config struct {
	// Port — порт HTTP-сервера
	Port string `yaml:"port" env:"PORT" env-default:"8080"`
	DB   DB     `yaml:"db"`
	// PublicMCPURL — публичный адрес для ссылки подключения MCP; пока не используется
	PublicMCPURL string `yaml:"public_mcp_url" env:"PUBLIC_MCP_URL"`
	VAPID        VAPID  `yaml:"vapid"`
	// PushEndpointHosts — домены push-сервисов сверх встроенных, через запятую
	PushEndpointHosts string `yaml:"push_endpoint_hosts" env:"PUSH_ENDPOINT_HOSTS"`
}

type DB struct {
	Host     string `yaml:"host" env:"DB_HOST" env-default:"localhost"`
	Port     int    `yaml:"port" env:"DB_PORT" env-default:"5432"`
	User     string `yaml:"user" env:"DB_USER" env-required:"true"`
	Password string `yaml:"password" env:"DB_PASSWORD"`
	Name     string `yaml:"name" env:"DB_NAME" env-required:"true"`
}

// VAPID — ключи Web Push; пустые — ключи берутся из БД или создаются при первом запуске.
type VAPID struct {
	PublicKey  string `yaml:"public_key" env:"VAPID_PUBLIC_KEY"`
	PrivateKey string `yaml:"private_key" env:"VAPID_PRIVATE_KEY"`
	Subject    string `yaml:"subject" env:"VAPID_SUBJECT"`
}

// DSN — строка подключения к PostgreSQL.
func (db DB) DSN() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		db.Host, db.Port, db.User, db.Password, db.Name)
}

// Load читает настройки: YAML-файл из CONFIG_PATH (если задана), затем переменные окружения поверх.
// Неверное значение (например, нечисловой DB_PORT) — ошибка, а не молчаливый ноль.
func Load() (*Config, error) {
	cfg, err := read()
	if err != nil {
		return nil, err
	}
	// cleanenv считает заданную пустую переменную присутствующей, поэтому пустое значение проверяем сами
	if cfg.DB.User == "" || cfg.DB.Name == "" {
		return nil, errors.New("не заданы DB_USER и DB_NAME")
	}
	if port, err := strconv.Atoi(cfg.Port); err != nil || port < 1 || port > 65535 {
		return nil, fmt.Errorf("неверный PORT %q: ожидается число от 1 до 65535", cfg.Port)
	}
	return cfg, nil
}

func read() (*Config, error) {
	var cfg Config
	if path := os.Getenv("CONFIG_PATH"); path != "" {
		if err := cleanenv.ReadConfig(path, &cfg); err != nil {
			return nil, fmt.Errorf("ошибка чтения конфиг-файла %s: %w", path, err)
		}
		return &cfg, nil
	}
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, fmt.Errorf("ошибка чтения настроек из окружения: %w", err)
	}
	return &cfg, nil
}
