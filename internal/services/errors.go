package services

import "errors"

// Виды ошибок сервисов. Обработчик выбирает HTTP-статус по виду (errors.Is),
// а пользователю показывает текст конкретной ошибки.
var (
	// ErrKindNotFound — сущности нет (404)
	ErrKindNotFound = errors.New("не найдено")
	// ErrKindInvalidInput — данные запроса не проходят бизнес-проверки (400)
	ErrKindInvalidInput = errors.New("неверные данные")
	// ErrKindConflict — запрос противоречит существующим данным (409)
	ErrKindConflict = errors.New("конфликт с существующими данными")
	// ErrKindGone — сущность была, но больше не действует (410)
	ErrKindGone = errors.New("больше не действует")
)

// Error — ошибка, понятная пользователю: текст без технических подробностей и вид для выбора статуса.
type Error struct {
	kind error
	msg  string
}

func newError(kind error, msg string) *Error {
	return &Error{kind: kind, msg: msg}
}

func (e *Error) Error() string { return e.msg }

func (e *Error) Unwrap() error { return e.kind }

var (
	// ErrNotFound — записи с таким ID нет (для GenericService)
	ErrNotFound = newError(ErrKindNotFound, "запись не найдена")

	ErrTaskNotFound    = newError(ErrKindNotFound, "задача не найдена")
	ErrDayNotFound     = newError(ErrKindNotFound, "день не найден")
	ErrGroupNotFound   = newError(ErrKindNotFound, "группа не найдена")
	ErrInvalidDeadline = newError(ErrKindInvalidInput, "неверный дедлайн: он должен быть не раньше чем через час")
	ErrEmptyTaskName   = newError(ErrKindInvalidInput, "название задачи не может быть пустым")
	// ErrTaskGroupInvalid — в задаче указана несуществующая или чужая группа
	ErrTaskGroupInvalid = newError(ErrKindInvalidInput, "группа не найдена")
	// ErrGroupOwner — группа принадлежит другому пользователю
	ErrGroupOwner     = newError(ErrKindInvalidInput, "группа принадлежит другому пользователю")
	ErrEmptyGroupName = newError(ErrKindInvalidInput, "название группы не может быть пустым")
	ErrGroupNameTaken = newError(ErrKindConflict, "группа с таким названием уже есть")

	// Push-уведомления и настройки напоминаний (design/rules/push-states.md, design/rules/reminders.md)
	ErrSubscriptionNotFound = newError(ErrKindNotFound, "Подписка не найдена")
	// ErrSubscriptionGone — push-сервис ответил 404/410/403, подписка удалена
	ErrSubscriptionGone        = newError(ErrKindGone, "Подписка устарела")
	ErrInvalidEndpoint         = newError(ErrKindInvalidInput, "Неверный адрес подписки: ожидается https://")
	ErrInvalidSubscriptionKeys = newError(ErrKindInvalidInput, "Неверные ключи подписки")
	ErrInvalidClockTime        = newError(ErrKindInvalidInput, "Неверное время: ожидается ЧЧ:ММ, например 08:00")
	ErrInvalidDeadlineHours    = newError(ErrKindInvalidInput, "За сколько часов: от 1 до 24")
	ErrQuietHoursEqual         = newError(ErrKindInvalidInput, "Тихие часы: начало и конец не могут совпадать")
	ErrUnknownTimezone         = newError(ErrKindInvalidInput, "Неизвестный часовой пояс")
)
