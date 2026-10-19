/** Real browser regression for the Java-rendered popup, using synthetic data and loopback only. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = JSON.parse(await readFile(join(coreDirectory, 'target', 'zalo-popup-test.json'), 'utf8'));
assert.equal(artifact.proof, 'synthetic-proof', 'Only the synthetic test artifact is accepted.');
assert.equal(artifact.requestId, 'browser-regression');
assert.equal(artifact.originPlaceholder, 'http://127.0.0.1:0');
const chromeExecutable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitFor(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(75);
  }
  throw new Error(`Timed out: ${description}`);
}

class Devtools {
  sequence = 0;
  pending = new Map();
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`Chrome protocol: ${message.error.message}`));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Chrome protocol closed.'));
      }
      this.pending.clear();
    });
  }
  async send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome protocol timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return response;
  }
  async evaluate(sessionId, expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error('Browser evaluation failed.');
    return result.result.value;
  }
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

let chrome;
let devtools;
let profile;
let callbackOrigin;
let clientOrigin;
const servedHeaders = [];
const callbackServer = createServer((request, response) => {
  if (request.url !== '/callback' && request.url !== '/wrong-target') {
    response.writeHead(404).end();
    return;
  }
  const target = request.url === '/wrong-target' ? callbackOrigin : clientOrigin;
  const headers = Object.fromEntries(Object.entries(artifact.headers)
    .map(([key, value]) => [key, value.replaceAll(artifact.originPlaceholder, target)]));
  servedHeaders.push(headers);
  response.writeHead(200, headers);
  response.end(artifact.html.replaceAll(artifact.originPlaceholder, target));
});
const clientServer = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><title>Synthetic Zalo popup receiver</title><script>
    window.received = [];
    window.validated = [];
    window.launch = url => {
      window.popup = window.open(url, 'zaloPopup' + Date.now());
      return Boolean(window.popup);
    };
    window.addEventListener('message', event => {
      const correctOrigin = event.origin === ${JSON.stringify(callbackOrigin)};
      const correctSource = event.source === window.popup;
      window.received.push({ correctOrigin, correctSource, data: event.data });
      if (correctOrigin && correctSource && event.data.type === 'smartledger:zalo'
          && event.data.requestId === 'browser-regression' && event.data.purpose === 'LOGIN') {
        window.validated.push(event.data);
      }
    });
    </script>`);
});

try {
  callbackOrigin = await listen(callbackServer);
  clientOrigin = await listen(clientServer);
  const temporaryRoot = await realpath(tmpdir());
  profile = await mkdtemp(join(temporaryRoot, 'smartledger-zalo-popup-'));
  chrome = spawn(chromeExecutable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-features=Translate,MediaRouter',
    'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let startupError;
  chrome.on('error', error => { startupError = error; });
  const endpoint = await waitFor(async () => {
    if (startupError) throw new Error('Cannot start Chrome.');
    if (chrome.exitCode !== null) throw new Error('Chrome exited before the regression started.');
    try {
      const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      return `ws://127.0.0.1:${Number(port)}${path}`;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }, 'Chrome debugging endpoint');
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Cannot connect to Chrome.')), { once: true });
  });
  devtools = new Devtools(socket);
  const { targetId } = await devtools.send('Target.createTarget', { url: clientOrigin });
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });
  await waitFor(() => devtools.evaluate(sessionId, `typeof window.launch === 'function'`), 'receiver page');
  assert.equal(await devtools.evaluate(sessionId, `window.launch(${JSON.stringify(callbackOrigin + '/callback')})`), true);
  await waitFor(() => devtools.evaluate(sessionId, 'window.validated.length === 1 && window.popup.closed'),
    'correct popup handoff and closure');
  const received = await devtools.evaluate(sessionId, 'window.received');
  assert.equal(received.length, 1);
  assert.equal(received[0].correctOrigin, true);
  assert.equal(received[0].correctSource, true);
  assert.deepEqual(received[0].data, {
    type: 'smartledger:zalo', requestId: 'browser-regression', purpose: 'LOGIN', proof: 'synthetic-proof', error: null,
  });
  console.log('PASS: actual callback posts only to the exact origin; receiver verifies origin/source/requestId/purpose; popup closes.');

  const orphan = await devtools.send('Target.createTarget', { url: callbackOrigin + '/callback' });
  const orphanSession = await devtools.send('Target.attachToTarget', { targetId: orphan.targetId, flatten: true });
  await waitFor(() => devtools.evaluate(orphanSession.sessionId,
    `Boolean(document.getElementById('result')?.textContent.includes('Không tìm thấy cửa sổ'))`), 'orphan safe failure');
  const orphanView = await devtools.evaluate(orphanSession.sessionId,
    '({ text: document.body.innerText, url: location.href, opener: Boolean(window.opener) })');
  assert.equal(orphanView.opener, false);
  assert.equal(orphanView.url, callbackOrigin + '/callback');
  assert.equal(orphanView.text.includes('synthetic-proof'), false);
  console.log('PASS: orphan callback fails safely, without a visible proof or URL fallback.');

  await devtools.evaluate(sessionId, 'window.received = []; window.validated = [];');
  assert.equal(await devtools.evaluate(sessionId,
    `window.launch(${JSON.stringify(callbackOrigin + '/wrong-target')})`), true);
  await waitFor(() => devtools.evaluate(sessionId, 'window.popup.closed'), 'wrong-origin popup closure');
  await delay(250);
  assert.equal(await devtools.evaluate(sessionId, 'window.received.length'), 0);
  assert.equal(await devtools.evaluate(sessionId, 'window.validated.length'), 0);
  assert.ok(servedHeaders.length >= 3);
  for (const headers of servedHeaders) {
    const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    assert.equal(normalized['cache-control'], 'no-store');
    assert.equal(normalized['referrer-policy'], 'no-referrer');
    assert.match(normalized['content-security-policy'], /script-src 'nonce-[A-Za-z0-9_-]{43}'/);
    assert.ok(!normalized['content-security-policy'].includes('unsafe-inline'));
  }
  console.log('PASS: wrong target origin receives no message; actual nonce CSP and no-store/no-referrer headers retained.');
  console.log('Chrome popup regression passed: 3 scenarios; loopback and synthetic data only.');
} finally {
  if (devtools) {
    await devtools.send('Browser.close').catch(() => {});
    devtools.socket.close();
  }
  if (chrome && chrome.exitCode === null) {
    await Promise.race([once(chrome, 'exit'), delay(3000)]);
    if (chrome.exitCode === null) chrome.kill();
  }
  await Promise.all([callbackServer, clientServer].map(server => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  })));
  if (profile) {
    const temporaryRoot = await realpath(tmpdir());
    assert.equal(dirname(profile), temporaryRoot);
    assert.ok(basename(profile).startsWith('smartledger-zalo-popup-'));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
