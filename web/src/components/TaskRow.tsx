import type { ReactNode } from 'react'
import type { Task } from '../api/types'
import { cx } from '../lib/cx'
import { describeDeadline } from '../lib/dates'
import { durationToWords, formatDuration } from '../lib/format'
import { isDone, normalizeForSearch, type PriorityLevel } from '../lib/tasks'
import { Checkbox } from './Checkbox'
import { Icon } from './Icon'
import { PriorityChip } from './PriorityChip'
import styles from './TaskRow.module.css'

interface TaskRowProps {
  task: Task
  level: PriorityLevel
  /** Название группы — первым фактом мета-строки (экран «День») */
  groupName?: string
  /** Нормализованный поисковый запрос для подсветки в названии */
  query?: string
  pending?: boolean
  /** Разделитель сверху (строки внутри GroupSection) */
  divider?: boolean
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}

export function TaskRow({ task, level, groupName, query = '', pending = false, divider = false, onToggle, onOpen }: TaskRowProps) {
  const done = isDone(task)
  const nameId = `task-name-${task.TaskId}`
  const deadline = describeDeadline(task.DeadLine)
  const showProgress = task.PercentOfCompleting > 0 && task.PercentOfCompleting < 100

  return (
    <article
      className={cx(styles.task, styles[level], done && styles.done, divider && styles.divider)}
      onClick={() => onOpen(task)}
    >
      <Checkbox
        checked={done}
        pending={pending}
        labelledBy={nameId}
        title={done ? 'Вернуть задачу в работу' : undefined}
        onChange={() => onToggle(task)}
      />
      <div className={styles.body}>
        <p className={styles.name} id={nameId}>
          <button
            type="button"
            className={styles.open}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(task)
            }}
          >
            {highlight(task.Name, query)}
          </button>
        </p>
        <div className={styles.meta}>
          <span className={styles.facts}>
            {groupName && !done && (
              <span className={styles.fact}>
                <Icon name="folder" size="xs" />
                {groupName}
              </span>
            )}
            {!done && (
              <span className={styles.fact}>
                <Icon name="clock" size="xs" />
                <span aria-hidden="true">{formatDuration(task.TimeForExecution)}</span>
                <span className="visually-hidden">Время на выполнение: {durationToWords(task.TimeForExecution)}</span>
              </span>
            )}
            <span className={cx(styles.fact, !done && styles[deadline.tone])}>
              <Icon name="flag" size="xs" />
              <span className="visually-hidden">Дедлайн: </span>
              {deadline.text}
            </span>
            {!done && showProgress && <span className={styles.fact}>{task.PercentOfCompleting}%</span>}
          </span>
          {!done && <PriorityChip priority={task.Priority} level={level} />}
        </div>
      </div>
    </article>
  )
}

/** Выделяет совпадение запроса в названии; поиск без регистра и с «ё» = «е». */
function highlight(name: string, query: string): ReactNode {
  if (!query) return name
  const index = normalizeForSearch(name).indexOf(query)
  if (index < 0) return name
  return (
    <>
      {name.slice(0, index)}
      <mark>{name.slice(index, index + query.length)}</mark>
      {name.slice(index + query.length)}
    </>
  )
}
