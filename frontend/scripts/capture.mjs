import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'screenshots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})

async function shot(url, file) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 400))
  await page.screenshot({
    path: path.join(outDir, file),
    type: 'png',
  })
}

await shot('http://127.0.0.1:5173/', 'p0-dashboard.png')
await shot('http://127.0.0.1:5173/customers', 'p0-customers.png')
await shot('http://127.0.0.1:5173/ai', 'p1-ai.png')
await shot('http://127.0.0.1:5173/ai?demo=chat', 'p1-ai-chat.png')
await shot('http://127.0.0.1:5173/tasks', 'p1-tasks.png')
await shot('http://127.0.0.1:5173/settings', 'p1-settings.png')
await browser.close()
console.log(`wrote ${outDir}/p0-dashboard.png`)
console.log(`wrote ${outDir}/p0-customers.png`)
console.log(`wrote ${outDir}/p1-ai.png`)
console.log(`wrote ${outDir}/p1-ai-chat.png`)
console.log(`wrote ${outDir}/p1-tasks.png`)
console.log(`wrote ${outDir}/p1-settings.png`)
