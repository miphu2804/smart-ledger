import type { AdminPreferences } from './types'

export const PREFS_KEY = 'smartledger.admin.preferences'

export const defaultPreferences: AdminPreferences = {
  theme: 'light',
  density: 'comfortable',
  locale: 'en',
}

function applyPreferences(prefs: AdminPreferences) {
  document.documentElement.dataset.theme = prefs.theme
  document.documentElement.dataset.density = prefs.density
  document.documentElement.lang = prefs.locale
}

export function loadPreferences(): AdminPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) {
      applyPreferences(defaultPreferences)
      return defaultPreferences
    }
    const parsed = JSON.parse(raw) as Partial<AdminPreferences>
    const prefs: AdminPreferences = {
      theme:
        parsed.theme === 'system' || parsed.theme === 'dark' ? parsed.theme : 'light',
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      locale: parsed.locale === 'vi' ? 'vi' : 'en',
    }
    applyPreferences(prefs)
    return prefs
  } catch {
    applyPreferences(defaultPreferences)
    return defaultPreferences
  }
}

export function savePreferences(prefs: AdminPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  document.documentElement.dataset.theme = prefs.theme
  document.documentElement.dataset.density = prefs.density
  document.documentElement.lang = prefs.locale
}
