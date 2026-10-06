import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { ApiError } from '../api/client'
import { fetchNotificationSettings, updateNotificationSettings } from '../api/notifications'
import type { NotificationSettings, NotificationSettingsUpdateRequest } from '../api/types'
import { CURRENT_USER_ID } from '../api/user'
import { applySettingsPatch, revertSettingsPatch } from '../lib/notificationSettings'
import { queryKeys } from './queryKeys'
import { useToast } from './useToast'

const SAVE_MUTATION_KEY = ['notificationSettings', 'save'] as const

export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => fetchNotificationSettings(CURRENT_USER_ID),
  })
}

interface SaveVariables {
  patch: NotificationSettingsUpdateRequest
  /** Фоновая синхронизация (часовой пояс): без Toast при ошибке */
  silent?: boolean
}

/**
 * Сохранение настройки: изменение применяется сразу (оптимистично), при ошибке откатываются
 * только поля этого изменения и показывается Toast «Не удалось сохранить настройку» + «Повторить».
 */
export function useSaveNotificationSettings(): (patch: NotificationSettingsUpdateRequest, options?: { silent?: boolean }) => void {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const key = queryKeys.notificationSettings
  const isLastSave = () => queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) <= 1

  const { mutate } = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    // Изменения уходят на сервер строго по очереди: две правки одного поля не придут в обратном порядке
    scope: { id: 'notificationSettings' },
    mutationFn: ({ patch }: SaveVariables) => updateNotificationSettings(CURRENT_USER_ID, patch),
    onMutate: async ({ patch }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<NotificationSettings>(key)
      if (previous) queryClient.setQueryData<NotificationSettings>(key, applySettingsPatch(previous, patch))
      return { previous }
    },
    onError: (error, { patch, silent }, context) => {
      const previous = context?.previous
      if (previous) {
        queryClient.setQueryData<NotificationSettings>(key, (current) => (current ? revertSettingsPatch(current, previous, patch) : previous))
      }
      if (silent) return
      // 400 — сервер не принял значение: повтор с тем же значением не поможет, показываем причину
      if (error instanceof ApiError && error.status === 400) {
        showToast({ message: `Не удалось сохранить настройку. ${error.message}` })
        return
      }
      showToast({
        message: 'Не удалось сохранить настройку',
        action: { label: 'Повторить', onClick: () => mutate({ patch }) },
      })
    },
    onSuccess: async (settings) => {
      // Фоновый запрос (возврат на вкладку), начатый до ответа, принёс бы старые значения — отменяем
      await queryClient.cancelQueries({ queryKey: key })
      // Пока в очереди другие изменения, ответ о них не знает — оставляем оптимистичные значения.
      // Своя мутация в onSuccess ещё считается выполняющейся, поэтому сравниваем с 1.
      if (isLastSave()) queryClient.setQueryData<NotificationSettings>(key, settings)
    },
    onSettled: () => {
      // Очередь изменений пуста — сверяемся с сервером (после ошибки и отката — особенно)
      if (isLastSave()) void queryClient.invalidateQueries({ queryKey: key })
    },
  })

  return useCallback(
    (patch: NotificationSettingsUpdateRequest, options?: { silent?: boolean }) => mutate({ patch, silent: options?.silent }),
    [mutate],
  )
}
