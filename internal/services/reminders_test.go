package services

import (
	"TaskManager/internal/models"
	"slices"
	"testing"
	"time"
)

// Примеры из design/screens/profile.md («Уведомления: тексты и правила»): Москва, 5 октября 2026.
var msk = time.FixedZone("MSK", 3*3600)

// at — момент в часовом поясе Москвы.
func at(month time.Month, day, hour, minute int) time.Time {
	return time.Date(2026, month, day, hour, minute, 0, 0, msk)
}

func TestParseClock(t *testing.T) {
	tests := []struct {
		value string
		want  int
		ok    bool
	}{
		{"00:00", 0, true},
		{"08:00", 480, true},
		{"23:59", 1439, true},
		{"07:30", 450, true},
		{"24:00", 0, false},
		{"12:60", 0, false},
		{"8:00", 0, false},
		{"08:0", 0, false},
		{"0800", 0, false},
		{"08-00", 0, false},
		{"+8:00", 0, false},
		{"08:+5", 0, false},
		{"", 0, false},
		{"ab:cd", 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			got, ok := parseClock(tt.value)
			if ok != tt.ok || got != tt.want {
				t.Errorf("parseClock(%q) = %d, %v; ожидалось %d, %v", tt.value, got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestDueDailyReminder(t *testing.T) {
	tests := []struct {
		name    string
		now     time.Time
		clock   string
		ttl     time.Duration
		wantDue bool
		wantAt  time.Time
	}{
		{"утро: минутой раньше", at(10, 5, 7, 59), "08:00", morningTTL, false, time.Time{}},
		{"утро: ровно в 08:00", at(10, 5, 8, 0), "08:00", morningTTL, true, at(10, 5, 8, 0)},
		{"утро: досылка после простоя в пределах TTL", at(10, 5, 10, 59), "08:00", morningTTL, true, at(10, 5, 8, 0)},
		{"утро: TTL истёк", at(10, 5, 11, 0), "08:00", morningTTL, false, time.Time{}},
		{"вечер: 21:00", at(10, 5, 21, 0), "21:00", eveningTTL, true, at(10, 5, 21, 0)},
		{"вечер: TTL 2 ч истёк", at(10, 5, 23, 0), "21:00", eveningTTL, false, time.Time{}},
		{"вечер 23:30: после полуночи относится ко вчера", at(10, 6, 0, 30), "23:30", eveningTTL, true, at(10, 5, 23, 30)},
		{"вечер 23:30: в 01:30 TTL истёк", at(10, 6, 1, 30), "23:30", eveningTTL, false, time.Time{}},
		{"now в UTC, время пользователя — Москва", time.Date(2026, 10, 5, 5, 0, 0, 0, time.UTC), "08:00", morningTTL, true, at(10, 5, 8, 0)},
		{"неверное время — не пора", at(10, 5, 8, 0), "8:00", morningTTL, false, time.Time{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, due := dueDailyReminder(tt.now, msk, tt.clock, tt.ttl)
			if due != tt.wantDue {
				t.Fatalf("пора = %v, ожидалось %v", due, tt.wantDue)
			}
			if due && !got.Equal(tt.wantAt) {
				t.Errorf("момент напоминания %v, ожидалось %v", got, tt.wantAt)
			}
		})
	}
}

func TestDueDailyReminderKey(t *testing.T) {
	// Ключ журнала — дата напоминания, а не дата проверки: вечер 23:30, проверка в 00:30
	got, due := dueDailyReminder(at(10, 6, 0, 30), msk, "23:30", eveningTTL)
	if !due {
		t.Fatal("ожидалось, что напоминание ещё действует")
	}
	if key := dateKey(got, msk); key != "2026-10-05" {
		t.Errorf("ключ %q, ожидалось 2026-10-05", key)
	}
}

func TestQuietHoursEnd(t *testing.T) {
	tests := []struct {
		name      string
		now       time.Time
		from, to  string
		wantQuiet bool
		wantEnd   time.Time
	}{
		{"через полночь: вечерняя часть", at(10, 5, 23, 30), "23:00", "07:00", true, at(10, 6, 7, 0)},
		{"через полночь: начало включено", at(10, 5, 23, 0), "23:00", "07:00", true, at(10, 6, 7, 0)},
		{"через полночь: утренняя часть", at(10, 6, 6, 59), "23:00", "07:00", true, at(10, 6, 7, 0)},
		{"через полночь: полночь", at(10, 6, 0, 0), "23:00", "07:00", true, at(10, 6, 7, 0)},
		{"через полночь: конец не включён", at(10, 6, 7, 0), "23:00", "07:00", false, time.Time{}},
		{"через полночь: днём не тихо", at(10, 5, 22, 59), "23:00", "07:00", false, time.Time{}},
		{"в пределах дня: 13:00–15:00, 14:00", at(10, 5, 14, 0), "13:00", "15:00", true, at(10, 5, 15, 0)},
		{"в пределах дня: 15:00 уже не тихо", at(10, 5, 15, 0), "13:00", "15:00", false, time.Time{}},
		{"в пределах дня: до начала", at(10, 5, 12, 59), "13:00", "15:00", false, time.Time{}},
		{"начало = конец — тихих часов нет", at(10, 5, 23, 0), "23:00", "23:00", false, time.Time{}},
		{"неверное время — тихих часов нет", at(10, 5, 23, 30), "23:00", "7:00", false, time.Time{}},
		{"now в UTC: 21:00 UTC = 00:00 МСК", time.Date(2026, 10, 5, 21, 0, 0, 0, time.UTC), "23:00", "07:00", true, at(10, 6, 7, 0)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			end, quiet := quietHoursEnd(tt.now, msk, tt.from, tt.to)
			if quiet != tt.wantQuiet {
				t.Fatalf("тихие часы = %v, ожидалось %v", quiet, tt.wantQuiet)
			}
			if quiet && !end.Equal(tt.wantEnd) {
				t.Errorf("конец %v, ожидалось %v", end, tt.wantEnd)
			}
		})
	}
}

func TestSelectDeadlineTasks(t *testing.T) {
	tasks := []*models.Task{
		{TaskId: 1, DeadLine: at(10, 5, 19, 30)},
		{TaskId: 2, DeadLine: at(10, 5, 18, 0)},
		{TaskId: 3, DeadLine: at(10, 5, 20, 0)},
		{TaskId: 4, DeadLine: at(10, 5, 18, 0)},
	}
	everyTask := func(*models.Task, models.NotificationSettings, time.Time) bool { return true }
	oddTasks := func(task *models.Task, _ models.NotificationSettings, _ time.Time) bool { return task.TaskId%2 == 1 }

	settings := func(change func(s *models.NotificationSettings)) models.NotificationSettings {
		s := models.DefaultNotificationSettings(1)
		change(&s)
		return s
	}
	tests := []struct {
		name     string
		s        models.NotificationSettings
		now      time.Time
		inWindow deadlineWindowFunc
		want     []int64
	}{
		{"по сроку ↑, при равном — по TaskId", settings(func(*models.NotificationSettings) {}), at(10, 5, 15, 10), everyTask, []int64{2, 4, 1, 3}},
		{"окно решает inWindow", settings(func(*models.NotificationSettings) {}), at(10, 5, 15, 10), oddTasks, []int64{1, 3}},
		{"напоминание выключено", settings(func(s *models.NotificationSettings) { s.DeadlineEnabled = false }), at(10, 5, 15, 10), everyTask, nil},
		{"тихие часы — отложить", settings(func(*models.NotificationSettings) {}), at(10, 5, 23, 30), everyTask, nil},
		{"тихие часы выключены", settings(func(s *models.NotificationSettings) { s.QuietEnabled = false }), at(10, 5, 23, 30), everyTask, []int64{2, 4, 1, 3}},
		{"после конца тихих часов — отправить", settings(func(*models.NotificationSettings) {}), at(10, 6, 7, 0), everyTask, []int64{2, 4, 1, 3}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := selectDeadlineTasks(tasks, tt.s, msk, tt.now, tt.inWindow)
			ids := make([]int64, 0, len(got))
			for _, task := range got {
				ids = append(ids, task.TaskId)
			}
			if !slices.Equal(ids, tt.want) && !(len(ids) == 0 && len(tt.want) == 0) {
				t.Errorf("отобраны %v, ожидалось %v", ids, tt.want)
			}
		})
	}
}

func TestTruncateName(t *testing.T) {
	tests := []struct {
		name  string
		value string
		limit int
		want  string
	}{
		{"короткое", "Пробежка 5 км", 40, "Пробежка 5 км"},
		{"ровно лимит", "Прочитать главу «Чистой архитектуры» 123", 40, "Прочитать главу «Чистой архитектуры» 123"},
		{"длиннее — обрезка с «…» в пределах лимита", "Прочитать главу «Чистой архитектуры» про границы", 40, "Прочитать главу «Чистой архитектуры» пр…"},
		{"пробел перед «…» убирается", "Подготовить отчёт по ТИПИС и отправить", 12, "Подготовить…"},
		{"пробелы по краям", "  Пробежка  ", 40, "Пробежка"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncateName(tt.value, tt.limit)
			if got != tt.want {
				t.Errorf("получено %q, ожидалось %q", got, tt.want)
			}
			if n := len([]rune(got)); n > tt.limit {
				t.Errorf("длина %d больше лимита %d", n, tt.limit)
			}
		})
	}
}

func TestFormatUntil(t *testing.T) {
	tests := []struct {
		d    time.Duration
		want string
	}{
		{45 * time.Minute, "45 мин"},
		{3 * time.Hour, "3 ч"},
		{2*time.Hour + 50*time.Minute, "2 ч 50 мин"},
		{2*time.Hour + 49*time.Minute + 40*time.Second, "2 ч 50 мин"},
		{59*time.Minute + 40*time.Second, "1 ч"},
		{10 * time.Second, "1 мин"},
		{24 * time.Hour, "24 ч"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if got := formatUntil(tt.d); got != tt.want {
				t.Errorf("formatUntil(%v) = %q, ожидалось %q", tt.d, got, tt.want)
			}
		})
	}
}

func TestRemainingWorkMinutes(t *testing.T) {
	tests := []struct {
		name    string
		te      int
		percent int
		want    int
	}{
		{"3:00 и 40% — 1:48 ≈ 1:50", 180, 40, 110},
		{"ровно кратно 5", 120, 0, 120},
		{"112 → 110", 112, 0, 110},
		{"113 → 115", 113, 0, 115},
		{"выполнено — 0", 45, 100, 0},
		{"меньше 5 минут — не ноль", 2, 0, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := &models.Task{TimeForExecution: tt.te, PercentOfCompleting: tt.percent}
			if got := remainingWorkMinutes(task); got != tt.want {
				t.Errorf("получено %d мин, ожидалось %d", got, tt.want)
			}
		})
	}
}

func TestFormatDeadlineLabel(t *testing.T) {
	now := at(9, 24, 8, 0)
	tests := []struct {
		name     string
		deadline time.Time
		want     string
	}{
		{"сегодня", at(9, 24, 18, 0), "сегодня, 18:00"},
		{"завтра", at(9, 25, 9, 30), "завтра, 09:30"},
		{"через 3 дня", at(9, 27, 18, 0), "через 3 дня"},
		{"через 5 дней", at(9, 29, 18, 0), "через 5 дней"},
		{"дальше — дата", at(10, 12, 18, 0), "12 окт"},
		{"другой год", time.Date(2027, 1, 5, 12, 0, 0, 0, msk), "5 янв 2027"},
		{"дата по поясу пользователя: 22:30 UTC = 01:30 МСК", time.Date(2026, 9, 24, 22, 30, 0, 0, time.UTC), "завтра, 01:30"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatDeadlineLabel(tt.deadline, now, msk); got != tt.want {
				t.Errorf("получено %q, ожидалось %q", got, tt.want)
			}
		})
	}
}

func TestPluralRu(t *testing.T) {
	tests := map[int]string{1: "дедлайн", 3: "дедлайна", 5: "дедлайнов", 11: "дедлайнов", 21: "дедлайн", 22: "дедлайна", 112: "дедлайнов"}
	for n, want := range tests {
		if got := pluralRu(n, "дедлайн", "дедлайна", "дедлайнов"); got != want {
			t.Errorf("pluralRu(%d) = %q, ожидалось %q", n, got, want)
		}
	}
}

func TestMorningMessage(t *testing.T) {
	now := at(10, 5, 8, 0)
	report := &models.Task{TaskId: 2, Name: "Подготовить отчёт по ТИПИС", DeadLine: at(10, 5, 18, 0)}
	review := &models.Task{TaskId: 1, Name: "Код-ревью задачи по API", DeadLine: at(10, 6, 10, 0)}
	far := &models.Task{TaskId: 3, Name: "Лабораторная №4 по БД", DeadLine: at(10, 9, 12, 0)}
	overdue := &models.Task{TaskId: 4, Name: "Просроченная", DeadLine: at(10, 5, 7, 0)}

	tests := []struct {
		name  string
		tasks []*models.Task
		want  string
	}{
		{"ближайший срок сегодня", []*models.Task{far, review, report, overdue}, "Активных задач: 4. Ближе всего срок у «Подготовить отчёт по ТИПИС» — сегодня, 18:00."},
		{"ближайший срок завтра", []*models.Task{far, review}, "Активных задач: 2. Ближе всего срок у «Код-ревью задачи по API» — завтра, 10:00."},
		{"сроки дальше завтра", []*models.Task{far}, "Активных задач: 1. Сколько времени готовы отдать делам сегодня?"},
		{"просроченная не считается ближайшей", []*models.Task{overdue, far}, "Активных задач: 2. Сколько времени готовы отдать делам сегодня?"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := morningMessage(tt.tasks, now, msk)
			if msg.Body != tt.want {
				t.Errorf("текст %q, ожидалось %q", msg.Body, tt.want)
			}
			if msg.Title != "Составьте план на сегодня" || msg.URL != "/day" || msg.Tag != "plan-morning" {
				t.Errorf("заголовок, url или tag не те: %+v", msg)
			}
		})
	}
}

func TestEveningMessage(t *testing.T) {
	task := func(id int64, name string, priority float64, status uint16) *models.Task {
		return &models.Task{TaskId: id, Name: name, Priority: priority, Status: status}
	}
	done := func(id int64) *models.Task { return task(id, "Готово", 100, models.StatusCompleted) }
	long := "Прочитать главу «Чистой архитектуры» про границы компонентов"

	tests := []struct {
		name   string
		plan   []*models.Task
		want   string
		wantOK bool
	}{
		{
			name: "три из семи: две по приоритету и остаток",
			plan: []*models.Task{
				task(4, "Пробежка 5 км", 3.2, models.StatusActive), done(1), done(3),
				task(2, "Подготовить отчёт по ТИПИС", 10.4, models.StatusActive), done(5), done(6),
				task(7, "Купить продукты", 1.7, models.StatusActive),
			},
			want:   "В плане осталось 3 из 7: «Подготовить отчёт по ТИПИС», «Пробежка 5 км» и ещё 1.",
			wantOK: true,
		},
		{
			name:   "одна задача",
			plan:   []*models.Task{done(1), done(2), done(3), done(5), done(6), done(7), task(4, "Пробежка 5 км", 3.2, models.StatusActive)},
			want:   "В плане осталась 1 задача из 7: «Пробежка 5 км».",
			wantOK: true,
		},
		{
			name:   "две задачи",
			plan:   []*models.Task{task(4, "Пробежка 5 км", 3.2, models.StatusActive), task(2, "Отчёт", 10, models.StatusActive), done(1)},
			want:   "В плане осталось 2 из 3: «Отчёт» и «Пробежка 5 км».",
			wantOK: true,
		},
		{
			name:   "длинное название обрезается до 40 символов",
			plan:   []*models.Task{task(1, long, 1, models.StatusActive)},
			want:   "В плане осталась 1 задача из 1: «Прочитать главу «Чистой архитектуры» пр…».",
			wantOK: true,
		},
		{name: "всё отмечено — не отправляем", plan: []*models.Task{done(1), done(2)}, wantOK: false},
		{name: "пустой план — не отправляем", plan: nil, wantOK: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg, ok := eveningMessage(tt.plan)
			if ok != tt.wantOK {
				t.Fatalf("отправлять = %v, ожидалось %v", ok, tt.wantOK)
			}
			if !ok {
				return
			}
			if msg.Body != tt.want {
				t.Errorf("текст %q, ожидалось %q", msg.Body, tt.want)
			}
			if msg.Title != "Отметьте, что сделали сегодня" || msg.URL != "/day" || msg.Tag != "plan-evening" {
				t.Errorf("заголовок, url или tag не те: %+v", msg)
			}
		})
	}
}

func TestDeadlineMessage(t *testing.T) {
	now := at(10, 5, 15, 10)
	tests := []struct {
		name      string
		task      *models.Task
		wantTitle string
		wantBody  string
	}{
		{
			name:      "пример из спецификации",
			task:      &models.Task{TaskId: 12, Name: "Подготовить отчёт по ТИПИС", DeadLine: at(10, 5, 18, 0), TimeForExecution: 180, PercentOfCompleting: 40},
			wantTitle: "Подготовить отчёт по ТИПИС",
			wantBody:  "Дедлайн через 2 ч 50 мин — сегодня, 18:00. Осталось ≈ 1:50 работы.",
		},
		{
			name:      "работы больше, чем времени",
			task:      &models.Task{TaskId: 12, Name: "Подготовить отчёт по ТИПИС", DeadLine: at(10, 5, 18, 0), TimeForExecution: 240},
			wantTitle: "Подготовить отчёт по ТИПИС",
			wantBody:  "Дедлайн через 2 ч 50 мин — сегодня, 18:00. Работы ≈ 4:00 — больше, чем осталось времени.",
		},
		{
			name:      "меньше часа",
			task:      &models.Task{TaskId: 12, Name: "Пробежка", DeadLine: at(10, 5, 15, 55), TimeForExecution: 30},
			wantTitle: "Пробежка",
			wantBody:  "Дедлайн через 45 мин — сегодня, 15:55. Осталось ≈ 0:30 работы.",
		},
		{
			name:      "ровно часы, завтра; длинный заголовок до 60 символов",
			task:      &models.Task{TaskId: 12, Name: "Подготовить отчёт по ТИПИС для кафедры и согласовать с руководителем", DeadLine: at(10, 6, 0, 10), TimeForExecution: 60, PercentOfCompleting: 50},
			wantTitle: "Подготовить отчёт по ТИПИС для кафедры и согласовать с руко…",
			wantBody:  "Дедлайн через 9 ч — завтра, 00:10. Осталось ≈ 0:30 работы.",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := deadlineMessage(tt.task, now, msk)
			if msg.Title != tt.wantTitle {
				t.Errorf("заголовок %q, ожидалось %q", msg.Title, tt.wantTitle)
			}
			if msg.Body != tt.wantBody {
				t.Errorf("текст %q, ожидалось %q", msg.Body, tt.wantBody)
			}
			if msg.URL != "/tasks/12" || msg.Tag != "deadline-12" {
				t.Errorf("url %q, tag %q", msg.URL, msg.Tag)
			}
		})
	}
}

func TestDeadlineSummaryMessage(t *testing.T) {
	now := at(10, 5, 15, 10)
	report := &models.Task{TaskId: 2, Name: "Подготовить отчёт по ТИПИС", DeadLine: at(10, 5, 18, 0)}
	review := &models.Task{TaskId: 1, Name: "Код-ревью задачи по API", DeadLine: at(10, 5, 19, 30)}
	run := &models.Task{TaskId: 4, Name: "Пробежка 5 км", DeadLine: at(10, 5, 20, 0)}
	night := &models.Task{TaskId: 5, Name: "Купить продукты", DeadLine: at(10, 6, 1, 0)}
	lab := &models.Task{TaskId: 3, Name: "Лабораторная №4 по БД", DeadLine: at(10, 6, 2, 0)}

	tests := []struct {
		name        string
		tasks       []*models.Task
		hoursBefore int
		wantTitle   string
		wantBody    string
	}{
		{
			name:        "пример из спецификации",
			tasks:       []*models.Task{report, review, run},
			hoursBefore: 3,
			wantTitle:   "3 дедлайна в ближайшие 3 ч",
			wantBody:    "Подготовить отчёт по ТИПИС — 18:00, Код-ревью задачи по API — 19:30 и ещё 1",
		},
		{
			name:        "пять задач, срок завтра",
			tasks:       []*models.Task{night, lab, report, review, run},
			hoursBefore: 12,
			wantTitle:   "5 дедлайнов в ближайшие 12 ч",
			wantBody:    "Купить продукты — завтра, 01:00, Лабораторная №4 по БД — завтра, 02:00 и ещё 3",
		},
		{
			name:        "окно в час",
			tasks:       []*models.Task{report, review, run},
			hoursBefore: 1,
			wantTitle:   "3 дедлайна в ближайший час",
			wantBody:    "Подготовить отчёт по ТИПИС — 18:00, Код-ревью задачи по API — 19:30 и ещё 1",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := deadlineSummaryMessage(tt.tasks, tt.hoursBefore, now, msk)
			if msg.Title != tt.wantTitle {
				t.Errorf("заголовок %q, ожидалось %q", msg.Title, tt.wantTitle)
			}
			if msg.Body != tt.wantBody {
				t.Errorf("текст %q, ожидалось %q", msg.Body, tt.wantBody)
			}
			if msg.URL != "/all-tasks" || msg.Tag != "deadline-summary" {
				t.Errorf("url %q, tag %q", msg.URL, msg.Tag)
			}
		})
	}
}

func TestFindPlanForDate(t *testing.T) {
	days := []*models.Day{
		{DayId: 1, Date: at(10, 4, 0, 0)},
		// Полночь по Москве, записанная в UTC: 4 октября 21:00 UTC = 5 октября 00:00 МСК
		{DayId: 2, Date: time.Date(2026, 10, 4, 21, 0, 0, 0, time.UTC)},
		{DayId: 3, Date: at(10, 6, 0, 0)},
	}
	tests := []struct {
		name string
		days []*models.Day
		date time.Time
		want int64 // 0 — плана нет
	}{
		{"дата по поясу пользователя", days, at(10, 5, 21, 0), 2},
		{"вчера", days, at(10, 4, 8, 0), 1},
		{"плана нет", days, at(10, 7, 8, 0), 0},
		{"два дня на одну дату — последний", append(slices.Clone(days), &models.Day{DayId: 9, Date: at(10, 5, 0, 0)}), at(10, 5, 8, 0), 9},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findPlanForDate(tt.days, tt.date, msk)
			var id int64
			if got != nil {
				id = got.DayId
			}
			if id != tt.want {
				t.Errorf("день %d, ожидался %d", id, tt.want)
			}
		})
	}
}

// Переходы на летнее и зимнее время: напоминания считаются по стенным часам пользователя,
// TTL — по реальному времени. Берлин 2026: 29 марта 02:00 CET → 03:00 CEST, 25 октября 03:00 CEST → 02:00 CET.
// Москва без перехода с 2011 года; 28 марта 2010 — последний весенний (02:00 MSK → 03:00 MSD).
func TestDueDailyReminderDST(t *testing.T) {
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Fatal(err)
	}
	moscow, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Fatal(err)
	}
	utc := func(year int, month time.Month, day, hour, minute int) time.Time {
		return time.Date(year, month, day, hour, minute, 0, 0, time.UTC)
	}
	tests := []struct {
		name    string
		loc     *time.Location
		now     time.Time
		clock   string
		ttl     time.Duration
		wantDue bool
		wantAt  time.Time // нулевое — момент не проверяется
		wantKey string
	}{
		{"Берлин, накануне перехода: 08:00 CET = 07:00 UTC", berlin, utc(2026, 3, 28, 7, 0), "08:00", morningTTL, true, utc(2026, 3, 28, 7, 0), "2026-03-28"},
		{"Берлин, день перехода: 08:00 CEST = 06:00 UTC", berlin, utc(2026, 3, 29, 6, 0), "08:00", morningTTL, true, utc(2026, 3, 29, 6, 0), "2026-03-29"},
		{"Берлин, день перехода: 07:59 CEST — ещё рано", berlin, utc(2026, 3, 29, 5, 59), "08:00", morningTTL, false, time.Time{}, ""},
		{"Берлин, TTL через переход: 01:30 CET + 2 ч = 04:30 CEST", berlin, utc(2026, 3, 29, 2, 0), "01:30", eveningTTL, true, utc(2026, 3, 29, 0, 30), "2026-03-29"},
		{"Берлин, TTL через переход истёк в 04:30 CEST", berlin, utc(2026, 3, 29, 2, 30), "01:30", eveningTTL, false, time.Time{}, ""},
		{"Берлин, несуществующие 02:30 не теряются", berlin, utc(2026, 3, 29, 1, 45), "02:30", morningTTL, true, time.Time{}, "2026-03-29"},
		{"Берлин, зимнее время: 08:00 CET = 07:00 UTC", berlin, utc(2026, 10, 25, 7, 0), "08:00", morningTTL, true, utc(2026, 10, 25, 7, 0), "2026-10-25"},
		{"Берлин, неоднозначные 02:30 — одна дата", berlin, utc(2026, 10, 25, 2, 0), "02:30", morningTTL, true, time.Time{}, "2026-10-25"},
		{"Москва 2026: 08:00 MSK = 05:00 UTC", moscow, utc(2026, 3, 29, 5, 0), "08:00", morningTTL, true, utc(2026, 3, 29, 5, 0), "2026-03-29"},
		{"Москва 2010, день перехода: 08:00 MSD = 04:00 UTC", moscow, utc(2010, 3, 28, 4, 0), "08:00", morningTTL, true, utc(2010, 3, 28, 4, 0), "2010-03-28"},
		{"Москва 2010, день перехода: 07:59 MSD — ещё рано", moscow, utc(2010, 3, 28, 3, 59), "08:00", morningTTL, false, time.Time{}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, due := dueDailyReminder(tt.now, tt.loc, tt.clock, tt.ttl)
			if due != tt.wantDue {
				t.Fatalf("пора = %v, ожидалось %v", due, tt.wantDue)
			}
			if !due {
				return
			}
			if !tt.wantAt.IsZero() && !got.Equal(tt.wantAt) {
				t.Errorf("момент %v, ожидалось %v", got.UTC(), tt.wantAt)
			}
			if key := dateKey(got, tt.loc); key != tt.wantKey {
				t.Errorf("ключ %q, ожидалось %q", key, tt.wantKey)
			}
		})
	}
}

func TestQuietHoursEndDST(t *testing.T) {
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Fatal(err)
	}
	moscow, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Fatal(err)
	}
	utc := func(month time.Month, day, hour, minute int) time.Time {
		return time.Date(2026, month, day, hour, minute, 0, 0, time.UTC)
	}
	tests := []struct {
		name      string
		loc       *time.Location
		now       time.Time
		wantQuiet bool
		wantEnd   time.Time
	}{
		{"Берлин, вечер перед переходом: 23:30 CET → до 07:00 CEST", berlin, utc(3, 28, 22, 30), true, utc(3, 29, 5, 0)},
		{"Берлин, ночь перехода: 03:30 CEST → до 07:00 CEST", berlin, utc(3, 29, 1, 30), true, utc(3, 29, 5, 0)},
		{"Берлин, 07:00 CEST — тихие часы кончились", berlin, utc(3, 29, 5, 0), false, time.Time{}},
		{"Берлин, вечер перед зимним временем: 23:30 CEST → до 07:00 CET", berlin, utc(10, 24, 21, 30), true, utc(10, 25, 6, 0)},
		{"Берлин, повторный час: 02:30 CET → до 07:00 CET", berlin, utc(10, 25, 1, 30), true, utc(10, 25, 6, 0)},
		{"Москва: 23:30 MSK → до 07:00 MSK", moscow, utc(10, 5, 20, 30), true, utc(10, 6, 4, 0)},
		{"Москва: 07:00 MSK — тихие часы кончились", moscow, utc(10, 6, 4, 0), false, time.Time{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			end, quiet := quietHoursEnd(tt.now, tt.loc, "23:00", "07:00")
			if quiet != tt.wantQuiet {
				t.Fatalf("тихие часы = %v, ожидалось %v", quiet, tt.wantQuiet)
			}
			if quiet && !end.Equal(tt.wantEnd) {
				t.Errorf("конец %v, ожидалось %v", end.UTC(), tt.wantEnd)
			}
		})
	}
}

func TestShouldRemindDeadline(t *testing.T) {
	now := at(10, 5, 15, 0)
	const (
		hour = time.Hour
		min  = time.Minute
	)
	tests := []struct {
		name            string
		hoursBefore     int
		deadlineEnabled bool
		status          uint16
		deadlineIn      time.Duration // от now; отрицательное — срок прошёл
		createdAgo      time.Duration
		want            bool
	}{
		{"дедлайн через 2 ч", 3, true, models.StatusActive, 2 * hour, 2 * hour, true},
		{"ровно через 3 ч — граница включается", 3, true, models.StatusActive, 3 * hour, 2 * hour, true},
		{"через 3 ч и 1 с — вне окна", 3, true, models.StatusActive, 3*hour + time.Second, 2 * hour, false},
		{"дедлайн ровно сейчас", 3, true, models.StatusActive, 0, 2 * hour, false},
		{"дедлайн уже прошёл", 3, true, models.StatusActive, -10 * min, 2 * hour, false},
		{"задача выполнена", 3, true, models.StatusCompleted, 2 * hour, 2 * hour, false},
		{"создана 29 минут назад", 3, true, models.StatusActive, 2 * hour, 29 * min, false},
		{"создана ровно 30 минут назад", 3, true, models.StatusActive, 2 * hour, 30 * min, true},
		{"окно 1 ч: граница включается", 1, true, models.StatusActive, 1 * hour, 2 * hour, true},
		{"окно 1 ч: 1 ч и 1 с — вне окна", 1, true, models.StatusActive, 1*hour + time.Second, 2 * hour, false},
		{"окно 24 ч: граница включается", 24, true, models.StatusActive, 24 * hour, 2 * hour, true},
		{"окно 24 ч: 24 ч и 1 с — вне окна", 24, true, models.StatusActive, 24*hour + time.Second, 2 * hour, false},
		{"DeadlineEnabled=false не влияет: в окне", 3, false, models.StatusActive, 2 * hour, 2 * hour, true},
		{"DeadlineEnabled=false не влияет: вне окна", 3, false, models.StatusActive, 4 * hour, 2 * hour, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := &models.Task{
				Status:    tt.status,
				DeadLine:  now.Add(tt.deadlineIn),
				CreatedAt: now.Add(-tt.createdAgo),
			}
			s := models.DefaultNotificationSettings(1)
			s.DeadlineHoursBefore = tt.hoursBefore
			s.DeadlineEnabled = tt.deadlineEnabled
			if got := shouldRemindDeadline(task, s, now); got != tt.want {
				t.Errorf("shouldRemindDeadline = %v, ожидалось %v", got, tt.want)
			}
		})
	}
}
