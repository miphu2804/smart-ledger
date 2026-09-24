#!/usr/bin/env node
/**
 * Proxy CHỈ DÙNG KHI DEV: chuyển tiếp mọi request tới Core và thêm header CORS.
 *
 * Vì sao cần: bản web chạy trong trình duyệt nên bị chặn khi gọi Core (Core chưa cấu hình CORS). App Android/iOS không
 * bị ảnh hưởng. Khi backend bật CORS thì bỏ proxy này.
 *
 * Dùng:
 *   node scripts/dev-cors-proxy.js
 *   rồi đặt EXPO_PUBLIC_API_ENDPOINT=http://127.0.0.1:8010 trong .env và chạy `npm run web`.
 *
 * Biến môi trường: CORE_URL (mặc định http://localhost:8000), PORT (mặc định 8010).
 * Chỉ lắng nghe ở 127.0.0.1 nên máy khác trong mạng không dùng được.
 */
const http = require('http');

const TARGET = new URL(process.env.CORE_URL || 'http://localhost:8000');
const PORT = Number(process.env.PORT || 8010);

http
  .createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':
        req.headers['access-control-request-headers'] || 'Authorization,Content-Type,X-Shop-Id,X-Trace-Id',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const headers = { ...req.headers, host: TARGET.host };
    delete headers.origin; // Core không cấu hình CORS nên không cần Origin
    const upstream = http.request(
      { hostname: TARGET.hostname, port: TARGET.port || 80, path: req.url, method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode || 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'proxy_error', message: `Không tới được Core (${TARGET.origin}): ${err.code || err.message || err}` }));
    });
    req.pipe(upstream);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`CORS proxy: http://127.0.0.1:${PORT}  →  ${TARGET.origin}`);
  });
