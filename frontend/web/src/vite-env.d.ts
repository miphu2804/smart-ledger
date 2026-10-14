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

/** Nội dung `site.yaml`, vite.config.ts inline lúc build. */
declare const __SITE__: {
  contact_email?: string | null
  social?: { facebook?: string | null; tiktok?: string | null } | null
}
