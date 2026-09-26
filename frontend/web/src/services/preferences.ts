/**
 * Preference cá nhân của ADMIN.
 * Backend chưa có → lưu localStorage (PUT /admin/me/preferences khi có API).
 */
import { useSyncExternalStore } from 'react'
import type { AdminPreferences } from '../types'
import { readJSON, writeJSON } from '../utils/storage'
import { getSession } from './authService'
import { log } from './mockStore'

const KEY = 'snl_admin_prefs'
const listeners = new Set<() => void>()
let cache: AdminPreferences | null = null

export const AVATAR_COLORS = ['#2F7A43', '#3478F6', '#C47A16', '#8A5CF6', '#C84337', '#30312F']

function defaults(): AdminPreferences {
  return {
    displayName: getSession()?.user.fullName ?? 'Quản trị viên',
    avatarColor: AVATAR_COLORS[0],
    locale: 'vi',
    theme: 'light',
    density: 'comfortable',
    sidebarCollapsed: false,
  }
}

export function getPreferences(): AdminPreferences {
  if (!cache) cache = { ...defaults(), ...(readJSON<Partial<AdminPreferences>>(KEY) ?? {}) }
  return cache
}

export function setPreferences(patch: Partial<AdminPreferences>, audited = false) {
  cache = { ...getPreferences(), ...patch }
  writeJSON(KEY, cache)
  if (audited) log('Cập nhật hồ sơ cá nhân', cache.displayName)
  listeners.forEach((l) => l())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function usePreferences(): AdminPreferences {
  return useSyncExternalStore(subscribe, getPreferences)
}

/** Xoá cache khi đổi tài khoản */
export function resetPreferencesCache() {
  cache = null
  listeners.forEach((l) => l())
}
