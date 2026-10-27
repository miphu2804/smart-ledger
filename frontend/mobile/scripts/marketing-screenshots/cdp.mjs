// Điều khiển Chrome chạy ẩn qua DevTools Protocol, không cần thư viện ngoài (Node 22 có sẵn WebSocket và fetch).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome');
const PORT = Number(process.env.CDP_PORT || 9333);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'sl-shots-'));
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-extensions',
    '--lang=vi-VN',
    '--window-size=390,844',
    'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    await sleep(200);
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!version) throw new Error('Chrome did not start');
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Ho_Chi_Minh' });
  await send('Emulation.setLocaleOverride', { locale: 'vi-VN' });

  const page = {
    send,
    async addInit(source) {
      await send('Page.addScriptToEvaluateOnNewDocument', { source });
    },
    async goto(url, waitMs = 2500) {
      await send('Page.navigate', { url });
      await sleep(waitMs);
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() {
      try { ws.close(); } catch {}
      proc.kill();
    },
  };
  return page;
}

export { sleep };
