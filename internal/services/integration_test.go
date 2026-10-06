package services_test

// Интеграционные тесты поведения сервисов на настоящем PostgreSQL (см. internal/testdb).
// Страховка перед рефакторингом репозиториев: проверяется только наблюдаемое поведение сервисов.
// Тесты делят одну БД и не используют t.Parallel.

import (
	"io"
	"log/slog"
	"math"
	"testing"
	"time"

	"TaskManager/internal/models"
	"TaskManager/internal/repository"
	"TaskManager/internal/services"
	"TaskManager/internal/testdb"
)

type env struct {
	tasks  *services.TaskServiceImpl
	groups *services.GroupServiceImpl
	days   *services.DayServiceImpl
}

// newEnv собирает сервисы так же, как cmd/taskManager/main.go, на чистой БД.
func newEnv(t *testing.T) *env {
	t.Helper()
	db := testdb.Open(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	taskRepo := repository.NewTaskRepository(db)
	groupRepo := repository.NewGroupRepository(db)
	dayRepo := repository.NewDayRepository(db)

	taskService := services.NewTaskService(taskRepo, groupRepo, logger)
	return &env{
		tasks:  taskService,
		groups: services.NewGroupService(groupRepo, taskRepo, taskService, logger),
		days:   services.NewDayService(dayRepo, taskRepo, logger),
	}
}

const eps = 1e-6

// inHours — дедлайн ровно через h часов и 30 минут: Tl = h при усечении до целых часов,
// и тест не зависит от секунд, прошедших между созданием и расчётом.
func inHours(h int) time.Time {
	return time.Now().Add(time.Duration(h)*time.Hour + 30*time.Minute)
}

// wantPriority — формула из CLAUDE.md: Pt = Pg * Te / Tl * %in.
func wantPriority(pg uint64, te, tl, percent int) float64 {
	return float64(pg) * float64(te) / float64(tl) * float64(100-percent) / 100
}

func near(a, b float64) bool { return math.Abs(a-b) < eps }

func (e *env) newGroup(t *testing.T, user int64, name string, weight uint64) *models.Group {
	t.Helper()
	g, err := e.groups.CreateGroup(models.GroupCreateRequest{UserId: user, GroupPriority: weight, Name: name})
	if err != nil {
		t.Fatalf("CreateGroup(%s): %v", name, err)
	}
	return g
}

func (e *env) newTask(t *testing.T, user int64, name string, groupID int64, te, hours, percent int) *models.Task {
	t.Helper()
	task, err := e.tasks.CreateTask(models.TaskCreateRequest{
		UserID: user, Name: name, Deadline: inHours(hours), TimeForExecution: te,
		PercentOfCompleting: percent, GroupId: groupID,
	})
	if err != nil {
		t.Fatalf("CreateTask(%s): %v", name, err)
	}
	return task
}

func (e *env) reload(t *testing.T, id int64) *models.Task {
	t.Helper()
	task, err := e.tasks.GetById(id)
	if err != nil || task == nil {
		t.Fatalf("GetById(%d): task=%v err=%v", id, task, err)
	}
	return task
}

func assertTask(t *testing.T, task *models.Task, groupID int64, pg uint64, tl int, priority float64) {
	t.Helper()
	if task.GroupId != groupID {
		t.Errorf("GroupId = %d, want %d", task.GroupId, groupID)
	}
	if task.GroupPriority != pg {
		t.Errorf("GroupPriority = %d, want %d", task.GroupPriority, pg)
	}
	if task.HoursUntilDeadline != tl {
		t.Errorf("HoursUntilDeadline = %d, want %d", task.HoursUntilDeadline, tl)
	}
	if !near(task.Priority, priority) {
		t.Errorf("Priority = %v, want %v", task.Priority, priority)
	}
}

func taskIDs(tasks []*models.Task) map[int64]bool {
	ids := make(map[int64]bool, len(tasks))
	for _, task := range tasks {
		ids[task.TaskId] = true
	}
	return ids
}

// 1. Создание задачи с группой и без: Pg, Tl и Priority по формуле; результат сохранён в БД.
func TestCreateTask_Formula(t *testing.T) {
	e := newEnv(t)
	group := e.newGroup(t, 1, "Работа", 5)

	tests := []struct {
		name               string
		groupID            int64
		te, hours, percent int
		wantPg             uint64
	}{
		{"без группы", 0, 60, 10, 0, 1},
		{"с группой веса 5", group.GroupId, 120, 24, 0, 5},
		{"с группой и прогрессом 50%", group.GroupId, 90, 9, 50, 5},
		{"без группы, дедлайн через час", 0, 30, 1, 0, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			created := e.newTask(t, 1, tt.name, tt.groupID, tt.te, tt.hours, tt.percent)
			want := wantPriority(tt.wantPg, tt.te, tt.hours, tt.percent)
			assertTask(t, created, tt.groupID, tt.wantPg, tt.hours, want)
			if created.Status != models.StatusActive {
				t.Errorf("Status = %d, want %d", created.Status, models.StatusActive)
			}
			assertTask(t, e.reload(t, created.TaskId), tt.groupID, tt.wantPg, tt.hours, want)
		})
	}
}

// Ошибки создания: пустое имя, дедлайн меньше часа, чужая и несуществующая группа.
func TestCreateTask_Validation(t *testing.T) {
	e := newEnv(t)
	foreign := e.newGroup(t, 2, "Чужая", 3)

	tests := []struct {
		name  string
		input models.TaskCreateRequest
		want  error
	}{
		{"пустое имя", models.TaskCreateRequest{UserID: 1, Name: "  ", Deadline: inHours(5), TimeForExecution: 10}, services.ErrEmptyTaskName},
		{"дедлайн раньше чем через час", models.TaskCreateRequest{UserID: 1, Name: "x", Deadline: time.Now().Add(30 * time.Minute), TimeForExecution: 10}, services.ErrInvalidDeadline},
		{"дедлайн в прошлом", models.TaskCreateRequest{UserID: 1, Name: "x", Deadline: time.Now().Add(-5 * time.Hour), TimeForExecution: 10}, services.ErrInvalidDeadline},
		{"чужая группа", models.TaskCreateRequest{UserID: 1, Name: "x", Deadline: inHours(5), TimeForExecution: 10, GroupId: foreign.GroupId}, services.ErrTaskGroupInvalid},
		{"несуществующая группа", models.TaskCreateRequest{UserID: 1, Name: "x", Deadline: inHours(5), TimeForExecution: 10, GroupId: 999}, services.ErrTaskGroupInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := e.tasks.CreateTask(tt.input); err != tt.want {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
		})
	}
}

// 1. Обновление задачи: смена времени/дедлайна/группы пересчитывает Pg, Tl и Priority.
func TestUpdateTask_Recalculates(t *testing.T) {
	e := newEnv(t)
	g4 := e.newGroup(t, 1, "G4", 4)
	g9 := e.newGroup(t, 1, "G9", 9)
	task := e.newTask(t, 1, "задача", 0, 60, 10, 0)

	ptr := func(v int) *int { return &v }
	gid := func(v int64) *int64 { return &v }

	// время выполнения и дедлайн
	deadline := inHours(20)
	updated, err := e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{TimeForExecution: ptr(120), Deadline: &deadline})
	if err != nil {
		t.Fatal(err)
	}
	assertTask(t, updated, 0, 1, 20, wantPriority(1, 120, 20, 0))

	// в группу веса 4
	updated, err = e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{GroupId: gid(g4.GroupId)})
	if err != nil {
		t.Fatal(err)
	}
	assertTask(t, updated, g4.GroupId, 4, 20, wantPriority(4, 120, 20, 0))

	// в другую группу веса 9 вместе с прогрессом
	updated, err = e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{GroupId: gid(g9.GroupId), PercentOfCompleting: ptr(25)})
	if err != nil {
		t.Fatal(err)
	}
	assertTask(t, updated, g9.GroupId, 9, 20, wantPriority(9, 120, 20, 25))
	assertTask(t, e.reload(t, task.TaskId), g9.GroupId, 9, 20, wantPriority(9, 120, 20, 25))

	// обратно без группы
	updated, err = e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{GroupId: gid(0)})
	if err != nil {
		t.Fatal(err)
	}
	assertTask(t, updated, 0, 1, 20, wantPriority(1, 120, 20, 25))

	// ошибки обновления
	if _, err := e.tasks.UpdateTask(999, models.TaskUpdateRequest{}); err != services.ErrTaskNotFound {
		t.Errorf("несуществующая задача: err = %v", err)
	}
	past := time.Now().Add(-time.Hour)
	if _, err := e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{Deadline: &past}); err != services.ErrInvalidDeadline {
		t.Errorf("дедлайн в прошлом: err = %v", err)
	}
	if _, err := e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{GroupId: gid(999)}); err != services.ErrTaskGroupInvalid {
		t.Errorf("несуществующая группа: err = %v", err)
	}
}

// Просроченная задача при обновлении получает Tl = 1 (максимальный приоритет для её параметров).
// Дедлайн в прошлом через API не задать, поэтому задача создаётся с ближайшим допустимым дедлайном
// и сдвигается в прошлое напрямую в БД — через сервис это недостижимо; сам случай покрыт task_priority_test.go.
func TestUpdateTask_OverdueUsesOneHour(t *testing.T) {
	db := testdb.Open(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	taskRepo := repository.NewTaskRepository(db)
	svc := services.NewTaskService(taskRepo, repository.NewGroupRepository(db), logger)

	task, err := svc.CreateTask(models.TaskCreateRequest{UserID: 1, Name: "x", Deadline: inHours(5), TimeForExecution: 60})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.Task{}).Where("task_id = ?", task.TaskId).Update("deadline", time.Now().Add(-48*time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	desc := "обновили"
	updated, err := svc.UpdateTask(task.TaskId, models.TaskUpdateRequest{Description: &desc})
	if err != nil {
		t.Fatal(err)
	}
	assertTask(t, updated, 0, 1, 1, wantPriority(1, 60, 1, 0))
}

// 2. Смена веса группы (UpdateGroup) пересчитывает Pg и Priority задач группы и не трогает остальные.
func TestUpdateGroup_WeightRecalculatesTasks(t *testing.T) {
	e := newEnv(t)
	group := e.newGroup(t, 1, "Работа", 2)
	inGroup1 := e.newTask(t, 1, "a", group.GroupId, 60, 10, 0)
	inGroup2 := e.newTask(t, 1, "b", group.GroupId, 90, 30, 40)
	free := e.newTask(t, 1, "c", 0, 60, 10, 0)

	weight := uint64(7)
	if _, err := e.groups.UpdateGroup(group.GroupId, models.GroupUpdateRequest{GroupPriority: &weight}); err != nil {
		t.Fatal(err)
	}
	assertTask(t, e.reload(t, inGroup1.TaskId), group.GroupId, 7, 10, wantPriority(7, 60, 10, 0))
	assertTask(t, e.reload(t, inGroup2.TaskId), group.GroupId, 7, 30, wantPriority(7, 90, 30, 40))
	assertTask(t, e.reload(t, free.TaskId), 0, 1, 10, wantPriority(1, 60, 10, 0))

	// смена только названия вес и приоритеты не меняет
	name := "Новое имя"
	got, err := e.groups.UpdateGroup(group.GroupId, models.GroupUpdateRequest{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != name || got.GroupPriority != 7 {
		t.Errorf("группа после переименования: %+v", got)
	}
	assertTask(t, e.reload(t, inGroup1.TaskId), group.GroupId, 7, 10, wantPriority(7, 60, 10, 0))
}

// Название группы уникально у пользователя без учёта регистра и пробелов; у разных пользователей — можно.
func TestGroup_NameUniqueness(t *testing.T) {
	e := newEnv(t)
	e.newGroup(t, 1, "Дом", 3)
	if _, err := e.groups.CreateGroup(models.GroupCreateRequest{UserId: 1, GroupPriority: 3, Name: "  дом "}); err != services.ErrGroupNameTaken {
		t.Errorf("дубликат: err = %v, want ErrGroupNameTaken", err)
	}
	if _, err := e.groups.CreateGroup(models.GroupCreateRequest{UserId: 2, GroupPriority: 3, Name: "Дом"}); err != nil {
		t.Errorf("у другого пользователя имя свободно: %v", err)
	}
	if _, err := e.groups.CreateGroup(models.GroupCreateRequest{UserId: 1, GroupPriority: 3, Name: " "}); err != services.ErrEmptyGroupName {
		t.Errorf("пустое имя: err = %v", err)
	}
}

// 2. ReorderGroups: атомарно меняет веса нескольких групп и пересчитывает их задачи.
func TestReorderGroups_RecalculatesTasks(t *testing.T) {
	e := newEnv(t)
	a := e.newGroup(t, 1, "A", 1)
	b := e.newGroup(t, 1, "B", 2)
	c := e.newGroup(t, 1, "C", 3)
	ta := e.newTask(t, 1, "ta", a.GroupId, 60, 10, 0)
	tb := e.newTask(t, 1, "tb", b.GroupId, 60, 10, 0)
	tc := e.newTask(t, 1, "tc", c.GroupId, 60, 10, 50)

	// A и C меняются местами, B остаётся
	groups, err := e.groups.ReorderGroups(models.GroupReorderRequest{UserId: 1, Groups: []models.GroupWeight{
		{GroupId: a.GroupId, GroupPriority: 3},
		{GroupId: b.GroupId, GroupPriority: 2},
		{GroupId: c.GroupId, GroupPriority: 1},
	}})
	if err != nil {
		t.Fatal(err)
	}
	weights := map[int64]uint64{}
	for _, g := range groups {
		weights[g.GroupId] = g.GroupPriority
	}
	if len(groups) != 3 || weights[a.GroupId] != 3 || weights[b.GroupId] != 2 || weights[c.GroupId] != 1 {
		t.Errorf("веса после reorder: %v", weights)
	}
	assertTask(t, e.reload(t, ta.TaskId), a.GroupId, 3, 10, wantPriority(3, 60, 10, 0))
	assertTask(t, e.reload(t, tb.TaskId), b.GroupId, 2, 10, wantPriority(2, 60, 10, 0))
	assertTask(t, e.reload(t, tc.TaskId), c.GroupId, 1, 10, wantPriority(1, 60, 10, 50))

	// ошибки: дубликат, чужая/несуществующая группа — и ничего не меняется
	if _, err := e.groups.ReorderGroups(models.GroupReorderRequest{UserId: 1, Groups: []models.GroupWeight{
		{GroupId: a.GroupId, GroupPriority: 5}, {GroupId: a.GroupId, GroupPriority: 6},
	}}); err == nil {
		t.Error("дубликат группы должен вернуть ошибку")
	}
	if _, err := e.groups.ReorderGroups(models.GroupReorderRequest{UserId: 2, Groups: []models.GroupWeight{
		{GroupId: a.GroupId, GroupPriority: 5},
	}}); err == nil {
		t.Error("чужая группа должна вернуть ошибку")
	}
	assertTask(t, e.reload(t, ta.TaskId), a.GroupId, 3, 10, wantPriority(3, 60, 10, 0))
}

// 3. Удаление группы переводит её задачи в «без группы»: GroupId = 0, Pg = 1, приоритет пересчитан.
func TestDeleteGroup_DetachesTasks(t *testing.T) {
	e := newEnv(t)
	group := e.newGroup(t, 1, "Работа", 6)
	other := e.newGroup(t, 1, "Другая", 4)
	t1 := e.newTask(t, 1, "a", group.GroupId, 60, 10, 0)
	t2 := e.newTask(t, 1, "b", group.GroupId, 90, 20, 30)
	keep := e.newTask(t, 1, "c", other.GroupId, 60, 10, 0)

	assertTask(t, t1, group.GroupId, 6, 10, wantPriority(6, 60, 10, 0))

	if err := e.groups.DeleteGroup(group.GroupId); err != nil {
		t.Fatal(err)
	}
	assertTask(t, e.reload(t, t1.TaskId), 0, 1, 10, wantPriority(1, 60, 10, 0))
	assertTask(t, e.reload(t, t2.TaskId), 0, 1, 20, wantPriority(1, 90, 20, 30))
	assertTask(t, e.reload(t, keep.TaskId), other.GroupId, 4, 10, wantPriority(4, 60, 10, 0))

	if _, err := e.groups.GetGroupByID(group.GroupId); err != services.ErrGroupNotFound {
		t.Errorf("группа должна быть удалена: err = %v", err)
	}
	if err := e.groups.DeleteGroup(group.GroupId); err != services.ErrGroupNotFound {
		t.Errorf("повторное удаление: err = %v", err)
	}
	// задачи остались у пользователя и больше не связаны с группой в выдаче групп
	groups, err := e.groups.GetAllUserGroups(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].GroupId != other.GroupId {
		t.Errorf("группы пользователя после удаления: %+v", groups)
	}
}

// Состав группы (Group.Tasks по Task.GroupId) следует за созданием, сменой группы и удалением задачи.
func TestGroupMembership_FollowsTask(t *testing.T) {
	e := newEnv(t)
	g1 := e.newGroup(t, 1, "G1", 2)
	g2 := e.newGroup(t, 1, "G2", 3)
	task := e.newTask(t, 1, "a", g1.GroupId, 60, 10, 0)

	members := func(groupID int64) map[int64]bool {
		tasks, err := e.groups.GetAllGroupTasks(groupID)
		if err != nil {
			t.Fatal(err)
		}
		return taskIDs(tasks)
	}
	if m := members(g1.GroupId); !m[task.TaskId] || len(m) != 1 {
		t.Errorf("после создания в G1: %v", m)
	}

	to := g2.GroupId
	if _, err := e.tasks.UpdateTask(task.TaskId, models.TaskUpdateRequest{GroupId: &to}); err != nil {
		t.Fatal(err)
	}
	if m := members(g1.GroupId); len(m) != 0 {
		t.Errorf("G1 после переноса: %v", m)
	}
	if m := members(g2.GroupId); !m[task.TaskId] || len(m) != 1 {
		t.Errorf("G2 после переноса: %v", m)
	}

	if err := e.tasks.DeleteTask(task.TaskId); err != nil {
		t.Fatal(err)
	}
	if m := members(g2.GroupId); len(m) != 0 {
		t.Errorf("G2 после удаления задачи: %v", m)
	}
	if err := e.tasks.DeleteTask(task.TaskId); err != services.ErrTaskNotFound {
		t.Errorf("повторное удаление: err = %v", err)
	}
}

// AddTaskToGroup создаёт задачу в группе с её весом; чужую группу отвергает.
func TestAddTaskToGroup(t *testing.T) {
	e := newEnv(t)
	group := e.newGroup(t, 1, "G", 8)
	got, err := e.groups.AddTaskToGroup(group.GroupId, models.TaskCreateRequest{
		UserID: 1, Name: "в группе", Deadline: inHours(12), TimeForExecution: 60,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Tasks) != 1 {
		t.Fatalf("в группе %d задач, want 1", len(got.Tasks))
	}
	assertTask(t, e.reload(t, got.Tasks[0].TaskId), group.GroupId, 8, 12, wantPriority(8, 60, 12, 0))

	_, err = e.groups.AddTaskToGroup(group.GroupId, models.TaskCreateRequest{
		UserID: 2, Name: "чужая", Deadline: inHours(12), TimeForExecution: 60,
	})
	if err != services.ErrGroupOwner {
		t.Errorf("чужая группа: err = %v, want ErrGroupOwner", err)
	}
}

// 4. Фильтры GetTasksByUserID: status, groupId, date и их сочетания.
func TestGetTasksByUserID_Filters(t *testing.T) {
	e := newEnv(t)
	group := e.newGroup(t, 1, "G", 3)

	soonActive := e.newTask(t, 1, "soon-active", 0, 30, 5, 0)                 // дедлайн через 5 ч
	laterInGroup := e.newTask(t, 1, "later-group", group.GroupId, 30, 100, 0) // через 100 ч
	done := e.newTask(t, 1, "done", group.GroupId, 30, 50, 0)
	hundred := 100
	if _, err := e.tasks.UpdateTask(done.TaskId, models.TaskUpdateRequest{PercentOfCompleting: &hundred}); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name   string
		filter models.TaskFilter
		want   []int64
	}{
		{"без фильтра", models.TaskFilter{}, []int64{soonActive.TaskId, laterInGroup.TaskId, done.TaskId}},
		{"только активные", models.TaskFilter{Status: models.StatusActive}, []int64{soonActive.TaskId, laterInGroup.TaskId}},
		{"только выполненные", models.TaskFilter{Status: models.StatusCompleted}, []int64{done.TaskId}},
		{"по группе", models.TaskFilter{GroupId: group.GroupId}, []int64{laterInGroup.TaskId, done.TaskId}},
		{"группа и статус", models.TaskFilter{GroupId: group.GroupId, Status: models.StatusActive}, []int64{laterInGroup.TaskId}},
		{"дедлайн позже даты (через 10 ч)", models.TaskFilter{Date: time.Now().Add(10 * time.Hour)}, []int64{laterInGroup.TaskId, done.TaskId}},
		{"дедлайн позже даты (через 200 ч)", models.TaskFilter{Date: time.Now().Add(200 * time.Hour)}, nil},
		{"дата и статус", models.TaskFilter{Date: time.Now().Add(10 * time.Hour), Status: models.StatusActive}, []int64{laterInGroup.TaskId}},
		{"несуществующая группа", models.TaskFilter{GroupId: 999}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := e.tasks.GetTasksByUserID(1, tt.filter)
			if err != nil {
				t.Fatal(err)
			}
			gotIDs := taskIDs(got)
			if len(gotIDs) != len(tt.want) {
				t.Fatalf("получено %d задач %v, want %v", len(gotIDs), gotIDs, tt.want)
			}
			for _, id := range tt.want {
				if !gotIDs[id] {
					t.Errorf("нет задачи %d в %v", id, gotIDs)
				}
			}
		})
	}
}

// 6. Status = 2 <=> PercentOfCompleting = 100: на создании и обновлении, в обе стороны.
func TestStatusPercentInvariant(t *testing.T) {
	e := newEnv(t)
	ptr := func(v int) *int { return &v }
	st := func(v uint16) *uint16 { return &v }

	// на создании: 0–99 -> активна
	created := e.newTask(t, 1, "a", 0, 60, 10, 99)
	if created.Status != models.StatusActive || created.PercentOfCompleting != 99 {
		t.Errorf("создание с 99%%: status=%d percent=%d", created.Status, created.PercentOfCompleting)
	}

	tests := []struct {
		name        string
		start       models.TaskUpdateRequest // подготовка состояния
		input       models.TaskUpdateRequest
		wantStatus  uint16
		wantPercent int
	}{
		{"percent=100 -> выполнена", models.TaskUpdateRequest{}, models.TaskUpdateRequest{PercentOfCompleting: ptr(100)}, models.StatusCompleted, 100},
		{"status=2 -> 100%", models.TaskUpdateRequest{}, models.TaskUpdateRequest{Status: st(models.StatusCompleted)}, models.StatusCompleted, 100},
		{"percent<100 у выполненной -> активна", models.TaskUpdateRequest{Status: st(models.StatusCompleted)}, models.TaskUpdateRequest{PercentOfCompleting: ptr(40)}, models.StatusActive, 40},
		{"status=1 у выполненной -> 0%", models.TaskUpdateRequest{Status: st(models.StatusCompleted)}, models.TaskUpdateRequest{Status: st(models.StatusActive)}, models.StatusActive, 0},
		{"status=1 и percent=30 у выполненной -> 30%", models.TaskUpdateRequest{Status: st(models.StatusCompleted)}, models.TaskUpdateRequest{Status: st(models.StatusActive), PercentOfCompleting: ptr(30)}, models.StatusActive, 30},
		{"status=1 у активной на 60% не сбрасывает процент", models.TaskUpdateRequest{PercentOfCompleting: ptr(60)}, models.TaskUpdateRequest{Status: st(models.StatusActive)}, models.StatusActive, 60},
		// 100% важнее статуса: противоречивый запрос закрывает задачу
		{"percent=100 и status=1 -> выполнена", models.TaskUpdateRequest{}, models.TaskUpdateRequest{PercentOfCompleting: ptr(100), Status: st(models.StatusActive)}, models.StatusCompleted, 100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := e.newTask(t, 1, tt.name, 0, 60, 10, 0)
			if _, err := e.tasks.UpdateTask(task.TaskId, tt.start); err != nil {
				t.Fatal(err)
			}
			if _, err := e.tasks.UpdateTask(task.TaskId, tt.input); err != nil {
				t.Fatal(err)
			}
			got := e.reload(t, task.TaskId)
			if got.Status != tt.wantStatus || got.PercentOfCompleting != tt.wantPercent {
				t.Errorf("status=%d percent=%d, want status=%d percent=%d", got.Status, got.PercentOfCompleting, tt.wantStatus, tt.wantPercent)
			}
			if (got.Status == models.StatusCompleted) != (got.PercentOfCompleting == 100) {
				t.Errorf("инвариант нарушен: status=%d percent=%d", got.Status, got.PercentOfCompleting)
			}
			if got.Status == models.StatusCompleted && got.Priority != 0 {
				t.Errorf("у выполненной задачи Priority = %v, want 0 (%%in = 0)", got.Priority)
			}
		})
	}
}

// 7. Задачи, группы и дни другого пользователя не попадают в чтения, ограниченные userId.
func TestUserScoping(t *testing.T) {
	e := newEnv(t)
	mine := e.newTask(t, 1, "моя", 0, 60, 10, 0)
	e.newTask(t, 2, "чужая", 0, 60, 10, 0)
	e.newGroup(t, 2, "чужая группа", 5)
	myGroup := e.newGroup(t, 1, "моя группа", 5)

	tasks, err := e.tasks.GetTasksByUserID(1, models.TaskFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if ids := taskIDs(tasks); len(ids) != 1 || !ids[mine.TaskId] {
		t.Errorf("задачи пользователя 1: %v", ids)
	}
	none, err := e.tasks.GetTasksByUserID(3, models.TaskFilter{})
	if err != nil || len(none) != 0 {
		t.Errorf("задачи пользователя 3: %v, err=%v", none, err)
	}

	groups, err := e.groups.GetAllUserGroups(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].GroupId != myGroup.GroupId {
		t.Errorf("группы пользователя 1: %+v", groups)
	}

	// чужая задача в группу не назначается
	other := e.newTask(t, 2, "ещё чужая", 0, 60, 10, 0)
	gid := myGroup.GroupId
	if _, err := e.tasks.UpdateTask(other.TaskId, models.TaskUpdateRequest{GroupId: &gid}); err != services.ErrTaskGroupInvalid {
		t.Errorf("перенос чужой задачи в группу: err = %v, want ErrTaskGroupInvalid", err)
	}

	// дни: список только своих, план строится только из своих задач
	day1, err := e.days.CreateDay(&models.DayCreateRequest{Date: time.Now(), UserId: 1, TimeForTasks: 240})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.days.CreateDay(&models.DayCreateRequest{Date: time.Now(), UserId: 2, TimeForTasks: 240}); err != nil {
		t.Fatal(err)
	}
	days, err := e.days.GetDaysByUserID(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].DayId != day1.DayId {
		t.Errorf("дни пользователя 1: %+v", days)
	}
	if len(day1.Slots) != 1 || day1.Slots[0].TaskId != mine.TaskId {
		t.Errorf("слоты дня пользователя 1: %+v", day1.Slots)
	}
}

// slotsByTask — минуты слотов по задачам; проверяет общие правила: >= 15, кратно 5, сумма <= total.
func slotsByTask(t *testing.T, day *models.Day, total int) map[int64]int {
	t.Helper()
	m := make(map[int64]int, len(day.Slots))
	sum := 0
	for _, s := range day.Slots {
		m[s.TaskId] = s.Minutes
		sum += s.Minutes
		if s.Minutes < 15 || s.Minutes%5 != 0 {
			t.Errorf("слот задачи %d: %d мин (нужно >= 15 и кратно 5)", s.TaskId, s.Minutes)
		}
	}
	if sum > total {
		t.Errorf("сумма слотов %d больше времени дня %d", sum, total)
	}
	return m
}

// 5. Создание дня: слоты только у активных задач с дедлайном позже начала дня, поля дня заполнены.
func TestCreateDay_Slots(t *testing.T) {
	e := newEnv(t)
	today := time.Now()
	a := e.newTask(t, 1, "a", 0, 60, 30, 0)
	b := e.newTask(t, 1, "b", 0, 45, 30, 0)
	done := e.newTask(t, 1, "done", 0, 60, 30, 0)
	hundred := 100
	if _, err := e.tasks.UpdateTask(done.TaskId, models.TaskUpdateRequest{PercentOfCompleting: &hundred}); err != nil {
		t.Fatal(err)
	}

	day, err := e.days.CreateDay(&models.DayCreateRequest{Date: today, UserId: 1, TimeForTasks: 180})
	if err != nil {
		t.Fatal(err)
	}
	if day.TimeForTasks != 180 || day.UserId != 1 {
		t.Errorf("день: %+v", day)
	}
	if day.AmountOfTasks != len(day.Slots) {
		t.Errorf("AmountOfTasks = %d, слотов %d", day.AmountOfTasks, len(day.Slots))
	}
	m := slotsByTask(t, day, 180)
	if _, ok := m[done.TaskId]; ok {
		t.Error("выполненная задача не должна попасть в новый план")
	}
	if m[a.TaskId] == 0 || m[b.TaskId] == 0 {
		t.Errorf("активные задачи a и b должны быть в плане: %v", m)
	}
	if len(day.Tasks) != len(day.Slots) {
		t.Errorf("Tasks=%d, Slots=%d", len(day.Tasks), len(day.Slots))
	}
	// приоритет дня — сумма Priority невыполненных задач плана
	sum := 0.0
	for _, task := range day.Tasks {
		sum += task.Priority
	}
	if !near(day.PriorityOfTheDay, sum) {
		t.Errorf("PriorityOfTheDay = %v, want %v", day.PriorityOfTheDay, sum)
	}

	// день в будущем, дальше дедлайнов всех задач: плана нет, список слотов пустой, а не null
	empty, err := e.days.CreateDay(&models.DayCreateRequest{Date: time.Now().Add(1000 * time.Hour), UserId: 1, TimeForTasks: 120})
	if err != nil {
		t.Fatal(err)
	}
	if empty.Slots == nil || len(empty.Slots) != 0 || empty.Tasks == nil || len(empty.Tasks) != 0 {
		t.Errorf("пустой день: Slots=%v Tasks=%v", empty.Slots, empty.Tasks)
	}

	got, err := e.days.GetDayByID(day.DayId)
	if err != nil || len(got.Slots) != len(day.Slots) {
		t.Errorf("GetDayByID: %+v err=%v", got, err)
	}
	if _, err := e.days.GetDayByID(999); err != services.ErrDayNotFound {
		t.Errorf("несуществующий день: err = %v", err)
	}
}

// Слишком много задач на малое время: в план попадают только самые приоритетные, не больше total/15.
func TestCreateDay_TooManyTasksKeepsTopPriority(t *testing.T) {
	e := newEnv(t)
	urgent := e.newTask(t, 1, "срочная", 0, 120, 3, 0) // самый высокий Priority
	for i := 0; i < 3; i++ {
		e.newTask(t, 1, "фон", 0, 30, 200, 0)
	}
	day, err := e.days.CreateDay(&models.DayCreateRequest{Date: time.Now(), UserId: 1, TimeForTasks: 30})
	if err != nil {
		t.Fatal(err)
	}
	m := slotsByTask(t, day, 30)
	if len(m) != 2 || m[urgent.TaskId] == 0 {
		t.Errorf("слоты: %v (ожидалось 2 слота, среди них срочная задача)", m)
	}
}

// 5. Пересборка дня: слоты выполненных задач сохраняют минуты, остаток делится между активными.
func TestUpdateDay_CompletedKeepMinutes(t *testing.T) {
	e := newEnv(t)
	a := e.newTask(t, 1, "a", 0, 60, 30, 0)
	b := e.newTask(t, 1, "b", 0, 60, 30, 0)
	day, err := e.days.CreateDay(&models.DayCreateRequest{Date: time.Now(), UserId: 1, TimeForTasks: 120})
	if err != nil {
		t.Fatal(err)
	}
	before := slotsByTask(t, day, 120)
	if before[a.TaskId] == 0 || before[b.TaskId] == 0 {
		t.Fatalf("исходный план должен содержать обе задачи: %v", before)
	}

	// задача a выполнена
	status := uint16(models.StatusCompleted)
	if _, err := e.tasks.UpdateTask(a.TaskId, models.TaskUpdateRequest{Status: &status}); err != nil {
		t.Fatal(err)
	}
	// новая активная задача появилась после создания плана
	c := e.newTask(t, 1, "c", 0, 60, 30, 0)

	rebuilt, err := e.days.UpdateDay(day.DayId, &models.DayUpdateRequest{TimeForTasks: 300})
	if err != nil {
		t.Fatal(err)
	}
	if rebuilt.TimeForTasks != 300 {
		t.Errorf("TimeForTasks = %d, want 300", rebuilt.TimeForTasks)
	}
	after := slotsByTask(t, rebuilt, 300)
	if after[a.TaskId] != before[a.TaskId] {
		t.Errorf("выполненная задача: %d мин, было %d — минуты должны сохраниться", after[a.TaskId], before[a.TaskId])
	}
	if after[b.TaskId] == 0 || after[c.TaskId] == 0 {
		t.Errorf("активные b и c должны быть в плане: %v", after)
	}
	if rebuilt.AmountOfTasks != len(rebuilt.Slots) || len(rebuilt.Slots) != 3 {
		t.Errorf("AmountOfTasks=%d, слотов %d, want 3", rebuilt.AmountOfTasks, len(rebuilt.Slots))
	}
	// выполненная задача не входит в приоритет дня
	wantPriority := e.reload(t, b.TaskId).Priority + e.reload(t, c.TaskId).Priority
	if rebuilt.PriorityOfTheDay <= 0 || rebuilt.PriorityOfTheDay > wantPriority+eps {
		t.Errorf("PriorityOfTheDay = %v, ожидалось > 0 и <= %v (без выполненной)", rebuilt.PriorityOfTheDay, wantPriority)
	}

	// без timeForTasks план пересобирается с прежним временем
	again, err := e.days.UpdateDay(day.DayId, &models.DayUpdateRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if again.TimeForTasks != 300 {
		t.Errorf("TimeForTasks после пересборки без параметра = %d, want 300", again.TimeForTasks)
	}
	if slotsByTask(t, again, 300)[a.TaskId] != before[a.TaskId] {
		t.Error("минуты выполненной задачи изменились при повторной пересборке")
	}

	// время дня меньше уже выполненного — ошибка
	if _, err := e.days.UpdateDay(day.DayId, &models.DayUpdateRequest{TimeForTasks: 15}); err == nil && before[a.TaskId] > 15 {
		t.Error("ожидалась ошибка: время дня меньше выполненного")
	}
	if _, err := e.days.UpdateDay(999, &models.DayUpdateRequest{}); err != services.ErrDayNotFound {
		t.Errorf("несуществующий день: err = %v", err)
	}
}

// Удаление дня и удаление задачи убирают слоты; план других задач остаётся.
func TestDeleteDayAndTaskCleanSlots(t *testing.T) {
	e := newEnv(t)
	a := e.newTask(t, 1, "a", 0, 60, 30, 0)
	b := e.newTask(t, 1, "b", 0, 60, 30, 0)
	day, err := e.days.CreateDay(&models.DayCreateRequest{Date: time.Now(), UserId: 1, TimeForTasks: 120})
	if err != nil {
		t.Fatal(err)
	}

	if err := e.tasks.DeleteTask(a.TaskId); err != nil {
		t.Fatal(err)
	}
	got, err := e.days.GetDayByID(day.DayId)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range got.Slots {
		if s.TaskId == a.TaskId {
			t.Error("слот удалённой задачи остался в плане")
		}
	}
	if m := slotsByTask(t, got, 120); m[b.TaskId] == 0 {
		t.Errorf("слот задачи b пропал: %v", m)
	}

	if err := e.days.DeleteDay(day.DayId); err != nil {
		t.Fatal(err)
	}
	if _, err := e.days.GetDayByID(day.DayId); err != services.ErrDayNotFound {
		t.Errorf("день после удаления: err = %v", err)
	}
	if err := e.days.DeleteDay(day.DayId); err != services.ErrDayNotFound {
		t.Errorf("повторное удаление: err = %v", err)
	}
}
