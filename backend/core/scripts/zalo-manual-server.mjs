// Test tooling only: never bundled in the Core application or exposed by production security rules.
import http from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const verifierName = 'zalo_verifierMysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu.html';
const routes = new Set(['GET /api/v1/auth/zalo/authorize', 'GET /api/v1/auth/zalo/callback',
  'POST /api/v1/auth/zalo/exchange', 'POST /api/v1/auth/session', 'GET /api/v1/me']);
const lifetime = 2 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest();
const equal = (a, b) => typeof a === 'string' && timingSafeEqual(hash(a), hash(b));

export function validateOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || value.includes('*')) {
    throw new Error('Use an exact HTTPS test origin without trailing slash, path or query.');
  }
  return value;
}

function bodyOf(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0, oversized = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 8192) {
        oversized = true;
        chunks.length = 0;
        reject(new Error('body-too-large'));
      } else if (!oversized) chunks.push(chunk);
    });
    req.once('end', () => { if (!oversized) resolveBody(Buffer.concat(chunks)); });
    req.once('error', reject);
  });
}

function relay(req, res, upstream, body) {
  return new Promise(resolveRequest => {
    const headers = { host: new URL(upstream).host };
    for (const name of ['authorization', 'content-type', 'origin']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim())
      .filter(value => value.startsWith('__Host-sl_zalo_'));
    if (cookies.length) headers.cookie = cookies.join('; ');
    if (req.method === 'POST') headers['content-length'] = body.length;
    const target = http.request(new URL(req.url, upstream), { method: req.method, headers }, response => {
      // Upstream is loopback Core only. Never follow redirects or log callback URLs/bodies.
      for (const name of ['content-type', 'location', 'set-cookie', 'content-security-policy',
        'retry-after', 'x-content-type-options', 'x-frame-options', 'www-authenticate']) {
        if (response.headers[name]) res.setHeader(name, response.headers[name]);
      }
      res.statusCode = response.statusCode;
      response.pipe(res);
      response.once('end', resolveRequest);
      response.once('error', () => { res.destroy(); resolveRequest(); });
    });
    const timer = setTimeout(() => target.destroy(), 30_000);
    timer.unref();
    const clear = () => clearTimeout(timer);
    res.once('close', () => { clear(); target.destroy(); resolveRequest(); });
    target.once('error', () => {
      clear();
      if (!res.headersSent) { res.statusCode = 502; res.end('Local Core unavailable.'); }
      else res.destroy();
      resolveRequest();
    });
    target.end(body);
  });
}

export function createManualServer({ origin, accessKey, upstream = 'http://127.0.0.1:18081' }) {
  validateOrigin(origin);
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/' ||
    target.search || target.hash || target.username || target.password) throw new Error('Loopback Core required.');
  if (typeof accessKey !== 'string' || accessKey.length < 32 || accessKey.length > 200) {
    throw new Error('A temporary access key of 32–200 characters is required.');
  }
  const gate = createHmac('sha256', accessKey).update(origin).digest('base64url');
  const deadline = Date.now() + lifetime;
  let windowStart = Date.now(), total = 0, unlocks = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const respond = (code, value = '') => { res.statusCode = code; res.end(value); };
    try {
      if (Date.now() > deadline) return respond(410, 'Manual session expired. Restart locally.');
      if (req.headers.host !== new URL(origin).host) return respond(403);
      if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); total = 0; unlocks = 0; }
      if (++total > 120) { res.setHeader('Retry-After', '60'); return respond(429); }
      const path = req.url.split('?')[0];
      if (req.method === 'GET' && path === `/${verifierName}`) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return respond(200, '<!doctype html><meta property="zalo-platform-site-verification" content="MysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu">');
      }
      if (req.method === 'GET' && (path === '/' || path === '/client.mjs')) {
        res.setHeader('Content-Type', path === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
        const filename = path === '/' ? 'index.html' : 'client.mjs';
        return respond(200, await readFile(new URL(`./zalo-manual/${filename}`, import.meta.url)));
      }
      if (req.method === 'POST' && req.headers.origin !== origin) return respond(403);
      if (path === '/unlock' && req.method === 'POST') {
        if (++unlocks > 10) return respond(429);
        const body = await bodyOf(req);
        let key;
        try { key = JSON.parse(body.toString('utf8')).key; } catch { return respond(400); }
        if (!equal(key, accessKey)) return respond(401);
        res.setHeader('Set-Cookie', `__Host-zalo-manual=${gate}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`);
        return respond(204);
      }
      const cookie = (req.headers.cookie ?? '').split(';').map(value => value.trim())
        .find(value => value.startsWith('__Host-zalo-manual='))?.slice('__Host-zalo-manual='.length);
      if (!equal(cookie, gate)) return respond(401, 'Open the local shortcut to unlock this test.');
      if (!routes.has(`${req.method} ${path}`)) return respond(404);
      await relay(req, res, upstream, req.method === 'POST' ? await bodyOf(req) : Buffer.alloc(0));
    } catch (error) {
      if (!res.headersSent && !res.destroyed) respond(error.message === 'body-too-large' ? 413 : 400);
      else res.destroy();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 24;
  return server;
}

async function quickTunnel(onChild) {
  const binary = new URL('../target/zalo-manual/cloudflared.exe', import.meta.url);
  const expected = '4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6';
  if (createHash('sha256').update(await readFile(binary)).digest('hex') !== expected) {
    throw new Error('Download/verify the documented Cloudflare binary first.');
  }
  return new Promise((resolveOrigin, reject) => {
    const child = spawn(fileURLToPath(binary), ['tunnel', '--url', 'http://127.0.0.1:8792',
      '--no-autoupdate'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    onChild(child);
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Tunnel startup timeout.')); }, 45_000);
    let output = '';
    child.stderr.on('data', chunk => {
      // Parse only the assigned public origin; never print or persist tunnel request/error logs.
      output = (output + chunk.toString('utf8')).slice(-16_384);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { clearTimeout(timeout); resolveOrigin(validateOrigin(match[0])); }
    });
    child.on('error', () => { clearTimeout(timeout); reject(new Error('Cannot start tunnel.')); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Tunnel exited.')); });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let tunnel;
  process.on('exit', () => tunnel?.kill());
  try {
    const origin = process.argv[2] === '--tunnel' ? await quickTunnel(child => { tunnel = child; })
      : validateOrigin(process.env.ZALO_MANUAL_ORIGIN);
    const accessKey = process.env.ZALO_MANUAL_ACCESS_KEY || randomBytes(32).toString('base64url');
    const server = createManualServer({ origin, accessKey });
    const directory = new URL('../target/zalo-manual/', import.meta.url);
    await mkdir(directory, { recursive: true });
    // A private local shortcut, never served by the proxy. Fragment is not sent to tunnel access logs.
    const shortcut = `<!doctype html><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${origin}/#${encodeURIComponent(accessKey)}">`;
    await writeFile(new URL('open.html', directory), shortcut, { mode: 0o600 });
    await writeFile(new URL('current-origin.txt', directory), `${origin}\n`, { mode: 0o600 });
    server.listen(8792, '127.0.0.1', () => {
      console.log(`Test origin: ${origin}`);
      console.log('Manual gateway: 127.0.0.1:8792. Open target/zalo-manual/open.html locally.');
    });
    const stop = () => { tunnel?.kill(); server.close(() => process.exit(0)); };
    server.on('error', () => { console.error('Cannot bind manual gateway. Check port 8792.'); tunnel?.kill(); process.exitCode = 1; });
    tunnel?.once('exit', () => server.close(() => process.exit(1)));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    setTimeout(stop, lifetime).unref();
  } catch {
    tunnel?.kill();
    console.error('Invalid manual configuration. Follow docs/zalo-manual-login.md; no secret values are displayed.');
    process.exitCode = 1;
  }
}
