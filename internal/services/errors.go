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
)
