import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createManualServer, validateOrigin } from './zalo-manual-server.mjs';
import { acceptsMessage, completeLogin } from './zalo-manual/client.mjs';

const origin = 'https://manual.example.test';
const accessKey = 'synthetic-gate-key-with-at-least-32-characters';

function assertFirebaseExchangeUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'identitytoolkit.googleapis.com');
  assert.equal(url.port, '');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  assert.equal(url.pathname, '/v1/accounts:signInWithCustomToken');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()], ['key']);
  assert.ok(url.searchParams.get('key'));
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function localRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const destination = new URL(url);
    const req = http.request({ hostname: destination.hostname, port: destination.port,
      path: options.rawPath ?? destination.pathname + destination.search,
      method: options.method ?? 'GET', headers: options.headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const headers = new Headers();
        for (let index = 0; index < res.rawHeaders.length; index += 2) {
          headers.append(res.rawHeaders[index], res.rawHeaders[index + 1]);
        }
        resolve({ status: res.statusCode, headers, text: async () => Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

test('only exact HTTPS origins accepted', () => {
  assert.equal(validateOrigin(origin), origin);
  for (const value of ['http://localhost:8792', `${origin}/`, `${origin}/path`, `${origin}?q=1`,
    'https://a:b@example.test', 'https://*.example.test', 'https://example.test#x']) {
    assert.throws(() => validateOrigin(value));
  }
});

test('manual upstream accepts only an explicit IPv4 loopback HTTP origin', () => {
  for (const upstream of ['http://attacker.invalid:18081', 'http://localhost:18081',
    'https://127.0.0.1:18081', 'http://127.0.0.1:18081/path',
    'http://127.0.0.1:18081/?target=attacker', 'http://127.0.0.1:18081/#fragment',
    'http://user:password@127.0.0.1:18081', 'http://127.0.0.1:0']) {
    assert.throws(() => createManualServer({ origin, accessKey, upstream }));
  }
});

test('gate, host, origin and exact route checks protect the loopback proxy', async t => {
  const calls = [];
  const upstream = http.createServer((req, res) => {
    calls.push({ method: req.method, path: req.url, headers: req.headers });
    res.setHeader('Set-Cookie', '__Host-provider=synthetic; Secure; HttpOnly; Path=/; SameSite=Lax');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  const upstreamUrl = await listen(upstream);
  const server = createManualServer({ origin, accessKey, upstream: upstreamUrl });
  const base = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });
  const headers = { Host: new URL(origin).host, Origin: origin };
  const request = (path, options = {}) => localRequest(base + path, { ...options,
    headers: { ...headers, ...options.headers }, redirect: 'manual' });

  assert.equal((await fetch(base + '/', { headers: { Host: 'attacker.test' } })).status, 403);
  assert.equal((await request('/api/v1/auth/zalo/authorize')).status, 401);
  assert.equal((await request('/unlock', { method: 'POST', body: JSON.stringify({ key: 'wrong' }) })).status, 401);
  assert.equal((await request('/unlock', { method: 'POST', headers: { Origin: 'https://wrong.test' },
    body: JSON.stringify({ key: accessKey }) })).status, 403);
  const unlock = await request('/unlock', { method: 'POST', body: JSON.stringify({ key: accessKey }) });
  assert.equal(unlock.status, 204);
  const cookie = unlock.headers.get('set-cookie');
  assert.match(cookie, /__Host-zalo-manual=/);
  assert.match(cookie, /Secure; HttpOnly; SameSite=Lax; Path=\//);
  const gateHeaders = { Cookie: cookie.split(';')[0] };
  assert.equal((await request('/api/v1/auth/zalo/authorize?purpose=LOGIN', { headers: gateHeaders })).status, 200);
  assert.equal(calls[0].path, '/api/v1/auth/zalo/authorize?purpose=LOGIN');
  assert.equal(calls[0].headers.cookie, undefined, 'manual gate never forwarded to Core');
  assert.equal(calls[0].headers['x-forwarded-for'], undefined);
  assert.equal((await request('/api/v1/products', { headers: gateHeaders })).status, 404);
  assert.equal((await request('/actuator/health', { headers: gateHeaders })).status, 404);
  assert.equal((await request('/api/v1/auth/zalo/link', { method: 'POST', headers: gateHeaders })).status, 404);
  assert.equal((await request('/api/v1/auth/zalo/exchange', { method: 'DELETE', headers: gateHeaders })).status, 404);
  assert.equal((await request('/api/v1/auth/zalo/exchange', { method: 'POST', headers: {
    ...gateHeaders, Origin: 'https://wrong.test' } })).status, 403);
  assert.equal((await request('/api/v1/auth/zalo/exchange', { method: 'POST', headers: gateHeaders,
    body: 'x'.repeat(8193) })).status, 413);
  assert.equal((await request('/api/v1/auth/session', { method: 'POST', headers: {
    ...gateHeaders, Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json',
    'X-Forwarded-For': 'untrusted' }, body: '{}' })).status, 200);
  assert.equal(calls.at(-1).headers.authorization, 'Bearer synthetic-token');
  assert.equal(calls.at(-1).headers.origin, origin);
  assert.equal(calls.at(-1).headers['x-forwarded-for'], undefined);
  assert.equal((await request('/api/v1/auth/zalo/callback?code=synthetic', { headers: {
    ...gateHeaders, Cookie: `${gateHeaders.Cookie}; __Host-sl_zalo_attempt=synthetic` } })).status, 200);
  assert.equal(calls.at(-1).headers.cookie, '__Host-sl_zalo_attempt=synthetic');
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(await page.text(), new RegExp(accessKey));
  const verifier = await request('/zalo_verifierMysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu.html');
  assert.match(await verifier.text(), /zalo-platform-site-verification/);
});

test('proxy pins its network destination and rejects ambiguous request targets', async t => {
  const calls = [];
  const upstream = http.createServer((req, res) => {
    calls.push({ path: req.url, host: req.headers.host });
    if (req.url.includes('redirect=1')) res.writeHead(302, { Location: 'https://attacker.invalid/' });
    res.end('synthetic');
  });
  const upstreamUrl = await listen(upstream);
  const server = createManualServer({ origin, accessKey, upstream: upstreamUrl });
  const base = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });
  const headers = { Host: new URL(origin).host, Origin: origin };
  const unlock = await localRequest(base + '/unlock', { method: 'POST', headers,
    body: JSON.stringify({ key: accessKey }) });
  assert.equal(unlock.status, 204);
  headers.Cookie = unlock.headers.get('set-cookie').split(';')[0];
  const callback = '/api/v1/auth/zalo/callback';
  for (const rawPath of [`http://attacker.invalid${callback}`, `//attacker.invalid${callback}`,
    `\\\\attacker.invalid${callback}`, '/api/v1/auth/zalo/../me',
    '/api/v1/auth/zalo/%2e%2e/me', '/api/v1/auth/zalo/%2f%2fattacker.invalid',
    `${callback}#fragment`, `${callback}?code=synthetic#fragment`]) {
    const response = await localRequest(base, { headers, rawPath });
    assert.ok([400, 404].includes(response.status), 'Ambiguous target must be rejected.');
    assert.equal(calls.length, 0, 'No upstream request for a rejected target.');
  }
  const query = '?code=synthetic&next=https%3A%2F%2Fattacker.invalid%2F';
  assert.equal((await localRequest(base + callback + query, { headers })).status, 200);
  assert.deepEqual(calls, [{ path: callback + query, host: new URL(upstreamUrl).host }]);
  const redirect = await localRequest(base + callback + '?redirect=1', { headers });
  assert.equal(redirect.status, 302);
  assert.equal(calls.length, 2, 'Proxy does not follow redirects.');
});

test('Firebase URL assertion rejects lookalike hosts, credentials and alternate endpoints', () => {
  assertFirebaseExchangeUrl('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic');
  for (const value of [
    'https://identitytoolkitXgoogleapisYcom/v1/accounts:signInWithCustomToken?key=synthetic',
    'https://identitytoolkit.googleapis.com.attacker.invalid/v1/accounts:signInWithCustomToken?key=synthetic',
    'https://user:password@identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic',
    'http://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic',
    'https://identitytoolkit.googleapis.com:444/v1/accounts:signInWithCustomToken?key=synthetic',
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic',
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic#fragment',
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic&other=1',
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic&key=other',
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=',
  ]) assert.throws(() => assertFirebaseExchangeUrl(value));
});

test('popup identity and purpose are checked before accepting proof', () => {
  const popup = {};
  const attempt = { popup, requestId: 'request123', purpose: 'LOGIN' };
  const event = { origin, source: popup,
    data: { type: 'smartledger:zalo', purpose: 'LOGIN', requestId: 'request123', proof: 'synthetic' } };
  assert.equal(acceptsMessage(event, attempt, origin), true);
  assert.equal(acceptsMessage({ ...event, origin: 'https://wrong.test' }, attempt, origin), false);
  assert.equal(acceptsMessage({ ...event, source: {} }, attempt, origin), false);
  assert.equal(acceptsMessage({ ...event, data: { ...event.data, purpose: 'LINK' } }, attempt, origin), false);
  assert.equal(acceptsMessage({ ...event, data: { ...event.data, requestId: 'other' } }, attempt, origin), false);
  assert.equal(acceptsMessage(event, null, origin), false);
});

test('real-flow client uses custom token only with Firebase and ID token only with Core', async () => {
  const calls = [];
  const responses = [{ firebaseCustomToken: 'synthetic-custom', displayName: 'Test owner' },
    { idToken: 'synthetic-id', localId: 'synthetic-uid', refreshToken: 'not-retained' },
    { user: { id: 7, displayName: 'Test owner' }, role: 'OWNER', needsOnboarding: true, shops: [] }];
  const result = await completeLogin('synthetic-proof', 'synthetic-verifier', 'public-api-key', async (url, init) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => responses.shift() };
  });
  assert.equal(calls[0].url, '/api/v1/auth/zalo/exchange');
  assert.equal(JSON.parse(calls[1].body).token, 'synthetic-custom');
  assertFirebaseExchangeUrl(calls[1].url);
  assert.equal(calls[2].headers.Authorization, 'Bearer synthetic-id');
  assert.equal(result.user.id, 7);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-id|synthetic-custom|not-retained/);
});

test('provider errors never surface raw response/token in UI errors', async () => {
  await assert.rejects(completeLogin('p', 'v', 'key', async () => ({ ok: false, status: 503,
    json: async () => ({ code: 'zalo_unavailable', message: 'secret-provider-body' }) })),
  error => error.message === 'Core exchange: zalo_unavailable (503)');
});
