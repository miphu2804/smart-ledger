#!/usr/bin/env node
/**
 * Máy chủ tĩnh chỉ để phát triển: phục vụ các file model giọng nói trong assets/models cho app (emulator hoặc điện thoại)
 * tải về. Xem assets/models/README.md.
 *
 *   node scripts/serve-stt-model.js [cổng]        (mặc định 8090)
 *
 * Chỉ đọc, chỉ phục vụ file nằm trực tiếp trong assets/models (không đi vào thư mục con, không thoát ra ngoài), bỏ qua
 * README.md. Không cần cài thêm gói nào.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 8090);
const DIR = path.resolve(__dirname, '..', 'assets', 'models');

function listFiles() {
  return fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== 'README.md' && !e.name.startsWith('.'))
    .map((e) => e.name);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let name;
  try {
    name = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\/+/, ''));
  } catch {
    res.writeHead(400).end();
    return;
  }
  // Chỉ nhận đúng tên một file đang có trong thư mục; mọi tên chứa dấu phân cách đường dẫn đều bị từ chối.
  if (!name || name !== path.basename(name) || !listFiles().includes(name)) {
    res.writeHead(404).end('not found');
    return;
  }
  const file = path.join(DIR, name);
  const { size } = fs.statSync(file);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
  console.log(`${new Date().toLocaleTimeString()}  ${req.socket.remoteAddress}  GET /${name}  (${size} B)`);
});

server.listen(PORT, '0.0.0.0', () => {
  const files = listFiles();
  console.log(`Phục vụ ${files.length} file từ ${DIR}`);
  files.forEach((f) => console.log(`  ${f}`));
  if (!files.length) console.log('  (thư mục trống: chép model vào đây trước, xem assets/models/README.md)');
  console.log('\nĐặt EXPO_PUBLIC_STT_MODEL_URL trong .env thành một trong các địa chỉ sau:');
  console.log(`  http://10.0.2.2:${PORT}/        (emulator Android)`);
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`  http://${i.address}:${PORT}/   (điện thoại thật nếu cùng mạng; mở cổng ${PORT} trên tường lửa)`));
});
