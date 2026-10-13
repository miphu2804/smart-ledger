import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Inlined as a literal so the admin branch in App.tsx folds away when the flag is off.
  const { VITE_ADMIN_ENABLED = '' } = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_ADMIN_ENABLED': JSON.stringify(VITE_ADMIN_ENABLED),
    },
  }
})
