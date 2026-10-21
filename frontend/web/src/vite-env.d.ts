/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENDPOINT?: string
  readonly VITE_USE_MOCK?: string
  readonly VITE_ADMIN_ENABLED?: string
  readonly VITE_ANDROID_APK_URL?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Nội dung `site.yaml`, vite.config.ts inline lúc build. */
declare const __SITE__: {
  contact_email?: string | null
  social?: { facebook?: string | null; tiktok?: string | null; instagram?: string | null } | null
}
