/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENDPOINT?: string
  readonly VITE_USE_MOCK?: string
  readonly VITE_ADMIN_ENABLED?: string
  readonly VITE_ANDROID_APK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
