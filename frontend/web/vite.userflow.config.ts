import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Builds the userflow page (src/userflow) into docs/product/userflow/index.html, which opens straight from disk like
// the credential map. Browsers refuse module scripts and fonts loaded from file:// URLs, so the script, the styles and
// the fonts are inlined into the page; only the screenshots stay as files next to it.
export default defineConfig({
  root: 'src/userflow',
  base: './',
  plugins: [react(), inlineBundle()],
  build: {
    outDir: '../../../../docs/product/userflow',
    // The folder also holds the screenshots and its README.
    emptyOutDir: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
  },
})

/** Moves every emitted script and stylesheet into the HTML page and drops the separate files. */
function inlineBundle(): Plugin {
  return {
    name: 'userflow-inline-bundle',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = Object.values(bundle).find((file) => file.type === 'asset' && file.fileName.endsWith('.html'))
      if (!page || page.type !== 'asset') return
      let html = String(page.source)
      for (const file of Object.values(bundle)) {
        const name = file.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (file.type === 'chunk') {
          const code = file.code.replaceAll('</script', '<\\/script')
          html = html.replace(new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`), () => `<script type="module">${code}</script>`)
        } else if (file.fileName.endsWith('.css')) {
          html = html.replace(new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`), () => `<style>${String(file.source)}</style>`)
        } else continue
        delete bundle[file.fileName]
      }
      page.source = html
    },
  }
}
