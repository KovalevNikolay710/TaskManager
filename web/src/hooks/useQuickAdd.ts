import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { Task, TaskCreateRequest } from '../api/types'
import type { QuickAddSheetProps } from '../components/QuickAddSheet'
import { NO_GROUP_ID } from '../lib/groups'
import { QUICK_PARAM, clearQuickDraft, readQuickDraft, saveQuickDraft, type QuickAddValues } from '../lib/quickAdd'
import { writeLastGroupId } from '../lib/storage'
import { queryKeys } from './queryKeys'
import { useCreateTask } from './useTaskMutations'
import { useToast } from './useToast'

interface UseQuickAddOptions {
  /** Задача создана, лист ещё открыт (например, подсветить новую карточку под листом) */
  onCreated?: (task: Task) => void
  /** Лист закрыт и все запросы завершились; created — задачи, созданные за время, пока он был открыт (≥ 1) */
  onFinished: (created: Task[]) => void
}

/** Запись истории, добавленная при открытии листа: «Назад» закрывает лист, а не уводит с экрана. */
interface QuickAddHistoryState {
  quickAdd?: boolean
}

/** Если «Назад» за столько мс не закрыл лист (предыдущей записи нет), убираем параметр сами */
const BACK_FALLBACK_MS = 300

/** Поле, в котором клавиша N — это ввод текста, а не команда. */
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)
}

/**
 * «Быстрая задача» поверх экрана («Все задачи», «День»): лист открыт, пока в адресе есть ?quick=1.
 * Открывают Fab, «Новая задача», клавиша N и ярлык PWA (адрес сразу с ?quick=1).
 * Возвращает open() для кнопок и props листа (null — лист закрыт).
 */
export function useQuickAdd({ onCreated, onFinished }: UseQuickAddOptions) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const createTask = useCreateTask()

  const isOpen = params.get(QUICK_PARAM) === '1'
  const pushed = (location.state as QuickAddHistoryState | null)?.quickAdd === true

  // Сессия листа: сколько задач создано, пока он открыт, и сколько запросов ещё в пути.
  // Лист можно закрыть во время отправки — тогда итог покажем, когда запрос завершится.
  // generation растёт при каждом открытии: так видно, открыт ли ещё тот лист, из которого ушёл запрос.
  const session = useRef({ open: false, generation: 0, pending: 0, created: [] as Task[], discarded: false })
  const closing = useRef(false)
  const backFallback = useRef<number | undefined>(undefined)
  const callbacks = useRef({ onCreated, onFinished })
  useEffect(() => {
    callbacks.current = { onCreated, onFinished }
  })

  const finish = useCallback(() => {
    const s = session.current
    if (s.open || s.pending > 0) return
    const created = s.created
    s.created = []
    if (!s.discarded && created.length > 0) callbacks.current.onFinished(created)
  }, [])

  useEffect(() => {
    const s = session.current
    if (isOpen && !s.open) {
      s.open = true
      s.generation += 1
      s.discarded = false
      if (s.pending === 0) s.created = []
    } else if (!isOpen && s.open) {
      s.open = false
      closing.current = false
      window.clearTimeout(backFallback.current)
      finish()
    }
  }, [isOpen, finish])
  useEffect(() => () => window.clearTimeout(backFallback.current), [])

  const open = useCallback(() => {
    if (isOpen) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(QUICK_PARAM, '1')
        return next
      },
      { state: { quickAdd: true } satisfies QuickAddHistoryState },
    )
  }, [isOpen, setParams])
  // Актуальный open для отложенных действий (кнопка в Toast), а не тот, что был в замыкании при отправке
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  })

  const removeParam = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(QUICK_PARAM)
        return next
      },
      { replace: true },
    )
  }, [setParams])

  /** ×, подложка, свайп, Esc: снять запись ?quick=1 (history.back) или, если экран открыт ярлыком, убрать параметр. */
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (!pushed) {
      removeParam()
      return
    }
    navigate(-1)
    // Страховка: записи, на которую возвращаться, нет — лист закрываем заменой адреса
    window.clearTimeout(backFallback.current)
    backFallback.current = window.setTimeout(() => {
      if (session.current.open) removeParam()
    }, BACK_FALLBACK_MS)
  }, [pushed, navigate, removeParam])

  /** Уйти с экрана из листа («Подробнее», «Открыть»): запись ?quick=1 заменяется новым экраном. */
  const leaveTo = useCallback(
    (path: string) => {
      session.current.discarded = true
      if (pushed) {
        navigate(path, { replace: true })
      } else {
        removeParam()
        navigate(path)
      }
    },
    [pushed, navigate, removeParam],
  )

  const create = useCallback(
    async (input: Omit<TaskCreateRequest, 'userId'>, values: QuickAddValues) => {
      const s = session.current
      const generation = s.generation
      s.pending += 1
      try {
        const task = await createTask.mutateAsync(input)
        writeLastGroupId(task.GroupId)
        clearQuickDraft()
        // Выбранную группу удалили, пока лист был открыт: бэкенд молча создал задачу без группы
        if (input.groupId !== NO_GROUP_ID && task.GroupId === NO_GROUP_ID) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.groups })
        }
        if (!s.discarded) {
          s.created.push(task)
          callbacks.current.onCreated?.(task)
        }
        return task
      } catch (error) {
        // На время отправки лист черновик не держит (иначе закрыл — открыл — отправил ещё раз).
        // Не получилось — возвращаем введённое в черновик, если там уже нет чего-то нового
        if (!s.discarded && !readQuickDraft(new Date())) saveQuickDraft(values, new Date())
        // Лист, из которого ушёл запрос, уже закрыт: ошибку некому показать, кроме Toast
        const sheetGone = !s.open || s.generation !== generation
        if (sheetGone && !s.discarded) {
          showToast({
            message: 'Не удалось добавить задачу',
            action: s.open ? undefined : { label: 'Повторить', onClick: () => openRef.current() },
          })
        }
        throw error
      } finally {
        s.pending -= 1
        finish()
      }
    },
    [createTask, queryClient, showToast, finish],
  )

  // Клавиша N (десктоп): code, а не key — чтобы работала и в русской раскладке
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyN' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (isTypingTarget(event.target) || document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      open()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const sheet: QuickAddSheetProps | null = isOpen
    ? {
        onClose: close,
        onCreate: create,
        onMore: (search) => {
          // Введённое уходит в адрес полной формы — черновик больше не нужен
          clearQuickDraft()
          leaveTo(search ? `/tasks/new?${search}` : '/tasks/new')
        },
        onOpenTask: (taskId) => leaveTo(`/tasks/${taskId}`),
      }
    : null

  return { open, sheet }
}
