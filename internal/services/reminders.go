package services

// Чистая логика напоминаний (design/screens/profile.md, «Уведомления: тексты и правила»):
// когда пора, тихие часы и тексты. Текущее время и часовой пояс всегда приходят параметрами,
// поэтому всё здесь проверяется тестами без часов и БД.

import (
	"TaskManager/internal/models"
	"cmp"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	// TTL напоминаний: если устройство было выключено дольше, напоминание уже не нужно.
	// Те же интервалы ограничивают досылку после простоя сервера («Пропуск»).
	morningTTL = 3 * time.Hour
	eveningTTL = 2 * time.Hour
	testTTL    = 5 * time.Minute

	// deadlineMinTaskAge — о задаче, созданной меньше получаса назад, не напоминаем: срок поставлен только что.
	deadlineMinTaskAge = 30 * time.Minute
	// deadlineSummaryFrom — столько задач за одну проверку и больше отправляются одной сводкой.
	deadlineSummaryFrom = 3

	// Длина названия задачи в тексте и в заголовке, символов (вместе с «…»).
	reminderNameLimit    = 40
	deadlineTitleLimit   = 60
	remainingWorkRoundTo = 5 // минут

	urgencyNormal = "normal"
	urgencyHigh   = "high"
)

// PushMessage — содержимое push. Service worker показывает его через
// showNotification(title, { body, tag, data: { url } }).
type PushMessage struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
}

// PushOptions — заголовки запроса к push-сервису.
type PushOptions struct {
	TTL     time.Duration
	Urgency string // urgencyNormal | urgencyHigh
	Topic   string // = tag: push-сервис заменит недоставленное уведомление новым
}

// parseClock разбирает «ЧЧ:ММ» (00:00–23:59, обе части двумя цифрами) в минуты от полуночи.
func parseClock(value string) (int, bool) {
	if len(value) != 5 || value[2] != ':' {
		return 0, false
	}
	for _, i := range []int{0, 1, 3, 4} {
		if value[i] < '0' || value[i] > '9' {
			return 0, false
		}
	}
	hours, _ := strconv.Atoi(value[:2])
	minutes, _ := strconv.Atoi(value[3:])
	if hours > 23 || minutes > 59 {
		return 0, false
	}
	return hours*60 + minutes, true
}

// atClock — момент clockMinutes (минуты от полуночи) в день date по часовому поясу loc.
func atClock(date time.Time, loc *time.Location, clockMinutes int) time.Time {
	local := date.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), clockMinutes/60, clockMinutes%60, 0, 0, loc)
}

// dueDailyReminder решает, пора ли утреннее или вечернее напоминание: возвращает момент
// напоминания (clock по loc) и true, если now попадает в [момент, момент + ttl).
// Проверяются сегодняшний и вчерашний момент: вечернее в 23:30 с TTL 2 ч ещё действует в 00:30.
// Дата возвращённого момента — день, к которому относится напоминание (ключ журнала, дата плана).
func dueDailyReminder(now time.Time, loc *time.Location, clock string, ttl time.Duration) (time.Time, bool) {
	clockMinutes, ok := parseClock(clock)
	if !ok {
		return time.Time{}, false
	}
	for _, daysBack := range []int{0, 1} {
		at := atClock(now.In(loc).AddDate(0, 0, -daysBack), loc, clockMinutes)
		if !now.Before(at) && now.Before(at.Add(ttl)) {
			return at, true
		}
	}
	return time.Time{}, false
}

// quietHoursEnd проверяет, идут ли тихие часы [from, to) по часовому поясу loc, и возвращает их конец.
// from > to — интервал через полночь: 23:00–07:00 — это 23:00…23:59 и 00:00…06:59.
// from = to или неверное время — тихих часов нет.
func quietHoursEnd(now time.Time, loc *time.Location, from, to string) (time.Time, bool) {
	fromMinutes, okFrom := parseClock(from)
	toMinutes, okTo := parseClock(to)
	if !okFrom || !okTo || fromMinutes == toMinutes {
		return time.Time{}, false
	}
	local := now.In(loc)
	current := local.Hour()*60 + local.Minute()

	if fromMinutes < toMinutes {
		if current >= fromMinutes && current < toMinutes {
			return atClock(local, loc, toMinutes), true
		}
		return time.Time{}, false
	}
	switch {
	case current >= fromMinutes: // вечерняя часть: конец — завтра
		return atClock(local.AddDate(0, 0, 1), loc, toMinutes), true
	case current < toMinutes: // утренняя часть: конец — сегодня
		return atClock(local, loc, toMinutes), true
	}
	return time.Time{}, false
}

// shouldRemindDeadline решает, попала ли задача в окно напоминания «Дедлайн скоро»
// (design/screens/profile.md, «3. Дедлайн скоро»). Только само окно: тихие часы, журнал
// отправленных и сводку проверяет вызывающий код (selectDeadlineTasks, ReminderServiceImpl).
//
// Контракт: true, если одновременно
//   - задача активна: task.Status == models.StatusActive;
//   - срок впереди, но близко: now < task.DeadLine ≤ now + s.DeadlineHoursBefore часов;
//   - задача создана не меньше 30 минут назад (task.CreatedAt, константа deadlineMinTaskAge):
//     пользователь только что сам поставил близкий срок — напоминать сразу бессмысленно,
//     задача попадёт в окно на одной из следующих ежеминутных проверок.
//
// Иначе false. s.DeadlineEnabled здесь не проверяется. Функция чистая: время — только из now.
func shouldRemindDeadline(task *models.Task, s models.NotificationSettings, now time.Time) bool {
	if task.Status != models.StatusActive {
		return false
	}
	windowEnd := now.Add(time.Duration(s.DeadlineHoursBefore) * time.Hour)
	inWindow := now.Before(task.DeadLine) && !task.DeadLine.After(windowEnd)
	oldEnough := now.Sub(task.CreatedAt) >= deadlineMinTaskAge
	return inWindow && oldEnough
}

// deadlineWindowFunc — правило «задача в окне напоминания»; в работе — shouldRemindDeadline.
type deadlineWindowFunc func(task *models.Task, s models.NotificationSettings, now time.Time) bool

// selectDeadlineTasks отбирает задачи для «Дедлайн скоро» на этой проверке, по сроку ↑.
// Пусто, если напоминание выключено или идут тихие часы: уведомление откладывается до их конца —
// на следующих проверках задача снова попадёт в отбор, если срок к тому времени не прошёл
// (иначе inWindow её больше не пропустит и уведомления не будет).
func selectDeadlineTasks(tasks []*models.Task, s models.NotificationSettings, loc *time.Location, now time.Time, inWindow deadlineWindowFunc) []*models.Task {
	if !s.DeadlineEnabled {
		return nil
	}
	if s.QuietEnabled {
		if _, quiet := quietHoursEnd(now, loc, s.QuietFrom, s.QuietTo); quiet {
			return nil
		}
	}
	var due []*models.Task
	for _, task := range tasks {
		if inWindow(task, s, now) {
			due = append(due, task)
		}
	}
	slices.SortStableFunc(due, func(a, b *models.Task) int {
		if c := a.DeadLine.Compare(b.DeadLine); c != 0 {
			return c
		}
		return cmp.Compare(a.TaskId, b.TaskId)
	})
	return due
}

// deadlineLogKey — ключ журнала для дедлайна: перенесённый срок даёт новый ключ и новое уведомление.
func deadlineLogKey(deadline time.Time) string {
	return deadline.UTC().Format(time.RFC3339)
}

// dateKey — локальная дата YYYY-MM-DD (ключ журнала для утра и вечера).
func dateKey(t time.Time, loc *time.Location) string {
	return t.In(loc).Format(time.DateOnly)
}

// sameLocalDate — одна ли календарная дата у моментов a и b по loc.
func sameLocalDate(a, b time.Time, loc *time.Location) bool {
	return dateKey(a, loc) == dateKey(b, loc)
}

// truncateName обрезает название до limit символов вместе с «…».
func truncateName(name string, limit int) string {
	name = strings.TrimSpace(name)
	runes := []rune(name)
	if len(runes) <= limit {
		return name
	}
	return strings.TrimRight(string(runes[:limit-1]), " ") + "…"
}

// quoted — название задачи в «ёлочках», обрезанное до reminderNameLimit.
func quoted(name string) string {
	return "«" + truncateName(name, reminderNameLimit) + "»"
}

// pluralRu выбирает форму слова по числу: pluralRu(3, "дедлайн", "дедлайна", "дедлайнов") → «дедлайна».
func pluralRu(n int, one, few, many string) string {
	abs := n % 100
	if abs < 0 {
		abs = -abs
	}
	last := abs % 10
	switch {
	case abs > 10 && abs < 20:
		return many
	case last == 1:
		return one
	case last >= 2 && last <= 4:
		return few
	}
	return many
}

var monthsShort = [...]string{"янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"}

// calendarDayDiff — сколько календарных дней от a до b по loc (как calendarDayDiff во фронтенде).
func calendarDayDiff(a, b time.Time, loc *time.Location) int {
	la, lb := a.In(loc), b.In(loc)
	startA := time.Date(la.Year(), la.Month(), la.Day(), 0, 0, 0, 0, time.UTC)
	startB := time.Date(lb.Year(), lb.Month(), lb.Day(), 0, 0, 0, 0, time.UTC)
	return int(startB.Sub(startA).Hours() / 24)
}

// formatDeadlineLabel — дедлайн в будущем по «Форматам» design/system.md:
// «сегодня, 18:00», «завтра, 09:30», «через 3 дня», «12 окт» (с годом, если не текущий).
func formatDeadlineLabel(deadline, now time.Time, loc *time.Location) string {
	local := deadline.In(loc)
	days := calendarDayDiff(now, deadline, loc)
	switch {
	case days <= 0:
		return "сегодня, " + local.Format("15:04")
	case days == 1:
		return "завтра, " + local.Format("15:04")
	case days <= 6:
		return fmt.Sprintf("через %d %s", days, pluralRu(days, "день", "дня", "дней"))
	}
	label := fmt.Sprintf("%d %s", local.Day(), monthsShort[local.Month()-1])
	if local.Year() != now.In(loc).Year() {
		label += fmt.Sprintf(" %d", local.Year())
	}
	return label
}

// formatUntil — «через N» без слова «через»: «45 мин», «3 ч», «2 ч 50 мин». Округление до минуты, не меньше 1 мин.
func formatUntil(d time.Duration) string {
	minutes := max(int(math.Round(d.Minutes())), 1)
	hours, rest := minutes/60, minutes%60
	switch {
	case hours == 0:
		return fmt.Sprintf("%d мин", rest)
	case rest == 0:
		return fmt.Sprintf("%d ч", hours)
	}
	return fmt.Sprintf("%d ч %d мин", hours, rest)
}

// remainingWorkMinutes — сколько работы осталось: Te × (100 − %) / 100, округлено до 5 мин.
// Ненулевой остаток не округляется до нуля: меньше 5 минут — это 0:05.
func remainingWorkMinutes(task *models.Task) int {
	exact := float64(task.TimeForExecution) * float64(100-task.PercentOfCompleting) / 100
	if exact <= 0 {
		return 0
	}
	rounded := int(math.Round(exact/remainingWorkRoundTo)) * remainingWorkRoundTo
	return max(rounded, remainingWorkRoundTo)
}

// morningMessage — «1. Утро: составь план». activeTasks — активные задачи пользователя (не пусто).
func morningMessage(activeTasks []*models.Task, now time.Time, loc *time.Location) PushMessage {
	var nearest *models.Task
	for _, task := range activeTasks {
		if !task.DeadLine.After(now) || calendarDayDiff(now, task.DeadLine, loc) > 1 {
			continue
		}
		if nearest == nil || task.DeadLine.Before(nearest.DeadLine) {
			nearest = task
		}
	}

	body := fmt.Sprintf("Активных задач: %d. ", len(activeTasks))
	if nearest != nil {
		body += fmt.Sprintf("Ближе всего срок у %s — %s.", quoted(nearest.Name), formatDeadlineLabel(nearest.DeadLine, now, loc))
	} else {
		body += "Сколько времени готовы отдать делам сегодня?"
	}
	return PushMessage{Title: "Составьте план на сегодня", Body: body, URL: "/day", Tag: "plan-morning"}
}

// eveningMessage — «2. Вечер: отметь сделанное» по задачам плана дня.
// false — в плане не осталось невыполненных задач, напоминать не о чем.
func eveningMessage(planTasks []*models.Task) (PushMessage, bool) {
	var left []*models.Task
	for _, task := range planTasks {
		if task.Status == models.StatusActive {
			left = append(left, task)
		}
	}
	if len(left) == 0 {
		return PushMessage{}, false
	}
	slices.SortStableFunc(left, func(a, b *models.Task) int {
		if a.Priority != b.Priority {
			if a.Priority > b.Priority {
				return -1
			}
			return 1
		}
		return cmp.Compare(a.TaskId, b.TaskId)
	})

	total := len(planTasks)
	var body string
	switch len(left) {
	case 1:
		body = fmt.Sprintf("В плане осталась 1 задача из %d: %s.", total, quoted(left[0].Name))
	case 2:
		body = fmt.Sprintf("В плане осталось 2 из %d: %s и %s.", total, quoted(left[0].Name), quoted(left[1].Name))
	default:
		body = fmt.Sprintf("В плане осталось %d из %d: %s, %s и ещё %d.",
			len(left), total, quoted(left[0].Name), quoted(left[1].Name), len(left)-2)
	}
	return PushMessage{Title: "Отметьте, что сделали сегодня", Body: body, URL: "/day", Tag: "plan-evening"}, true
}

// deadlineMessage — «3. Дедлайн скоро» для одной задачи. Время до срока считается от DeadLine и now,
// а не от сохранённого NumberOfHoursUntilDL.
func deadlineMessage(task *models.Task, now time.Time, loc *time.Location) PushMessage {
	until := task.DeadLine.Sub(now)
	untilMinutes := max(int(math.Round(until.Minutes())), 1)
	work := remainingWorkMinutes(task)

	body := fmt.Sprintf("Дедлайн через %s — %s. ", formatUntil(until), formatDeadlineLabel(task.DeadLine, now, loc))
	if work > untilMinutes {
		body += fmt.Sprintf("Работы ≈ %s — больше, чем осталось времени.", formatDuration(work))
	} else {
		body += fmt.Sprintf("Осталось ≈ %s работы.", formatDuration(work))
	}
	return PushMessage{
		Title: truncateName(task.Name, deadlineTitleLimit),
		Body:  body,
		URL:   fmt.Sprintf("/tasks/%d", task.TaskId),
		Tag:   fmt.Sprintf("deadline-%d", task.TaskId),
	}
}

// deadlineSummaryMessage — одна сводка вместо нескольких «Дедлайн скоро» (tasks — по сроку ↑, не меньше двух).
func deadlineSummaryMessage(tasks []*models.Task, hoursBefore int, now time.Time, loc *time.Location) PushMessage {
	window := "в ближайший час"
	if hoursBefore != 1 {
		window = fmt.Sprintf("в ближайшие %d ч", hoursBefore)
	}
	title := fmt.Sprintf("%d %s %s", len(tasks), pluralRu(len(tasks), "дедлайн", "дедлайна", "дедлайнов"), window)

	parts := make([]string, 0, 2)
	for _, task := range tasks[:min(2, len(tasks))] {
		when := task.DeadLine.In(loc).Format("15:04")
		if !sameLocalDate(task.DeadLine, now, loc) {
			when = formatDeadlineLabel(task.DeadLine, now, loc)
		}
		parts = append(parts, truncateName(task.Name, reminderNameLimit)+" — "+when)
	}
	body := strings.Join(parts, ", ")
	if rest := len(tasks) - len(parts); rest > 0 {
		body += fmt.Sprintf(" и ещё %d", rest)
	}
	return PushMessage{Title: title, Body: body, URL: "/all-tasks", Tag: "deadline-summary"}
}

// testMessage — «4. Тестовое».
func testMessage() PushMessage {
	return PushMessage{
		Title: "Уведомления работают",
		Body:  "Так будут приходить напоминания о плане и дедлайнах.",
		URL:   "/profile",
		Tag:   "test",
	}
}
