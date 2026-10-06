package config

import (
	"os"
	"testing"
)

func setDBEnv(t *testing.T) {
	t.Helper()
	t.Setenv("CONFIG_PATH", "")
	t.Setenv("DB_HOST", "localhost")
	t.Setenv("DB_PORT", "5434")
	t.Setenv("DB_USER", "postgres")
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("DB_NAME", "task_manager_db")
}

func TestLoadFromEnv(t *testing.T) {
	setDBEnv(t)
	t.Setenv("PORT", "8090")
	t.Setenv("VAPID_SUBJECT", "mailto:a@b.c")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Port != "8090" || cfg.DB.Port != 5434 || cfg.VAPID.Subject != "mailto:a@b.c" {
		t.Errorf("неверные значения: %+v", cfg)
	}
	want := "host=localhost port=5434 user=postgres password=secret dbname=task_manager_db sslmode=disable"
	if got := cfg.DB.DSN(); got != want {
		t.Errorf("DSN = %q, ожидалось %q", got, want)
	}
}

func TestLoadDefaults(t *testing.T) {
	setDBEnv(t)
	for _, name := range []string{"DB_HOST", "DB_PORT", "PORT"} {
		os.Unsetenv(name) // t.Setenv в setDBEnv вернёт прежние значения после теста
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Port != "8080" || cfg.DB.Host != "localhost" || cfg.DB.Port != 5432 {
		t.Errorf("значения по умолчанию неверны: %+v", cfg)
	}
}

func TestLoadBadPort(t *testing.T) {
	setDBEnv(t)
	t.Setenv("DB_PORT", "abc")
	if _, err := Load(); err == nil {
		t.Error("ожидалась ошибка для нечислового DB_PORT")
	}
}

func TestLoadMissingRequired(t *testing.T) {
	setDBEnv(t)
	t.Setenv("DB_NAME", "")
	if _, err := Load(); err == nil {
		t.Error("ожидалась ошибка без DB_NAME")
	}
}

func TestLoadInvalidServerPort(t *testing.T) {
	for _, port := range []string{"abc", "0", "70000", "-1"} {
		setDBEnv(t)
		t.Setenv("PORT", port)
		if _, err := Load(); err == nil {
			t.Errorf("ожидалась ошибка для PORT=%q", port)
		}
	}
}
