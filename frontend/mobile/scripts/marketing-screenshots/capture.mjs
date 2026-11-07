// Captures the marketing image set (docs/marketing) from the web build of the app running in preview mode: a 390×844 @3x frame = 1170×2532 PNG.
// Run the mock web build first (see docs/marketing/README.md), then from the repo root:
//   node frontend/mobile/scripts/marketing-screenshots/capture.mjs docs/marketing [dashboard|chat|barcode|voice ...]
// APP_URL changes the web build address (default http://localhost:8082), CHROME_PATH changes the Chrome path.
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './cdp.mjs';

const BASE = process.env.APP_URL || 'http://localhost:8082';
const OUT = process.argv[2] || 'docs/marketing';
const ONLY = process.argv.slice(3);
const page = await launch();
await page.addInit(readFileSync(new URL('./page-helpers.js', import.meta.url), 'utf8'));
const J = JSON.stringify;
const labels = `return [...document.querySelectorAll('[aria-label],input,textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map(e => (e.getAttribute('aria-label') || '') + (e.placeholder ? ' [ph:' + e.placeholder + ']' : '')).filter(Boolean).slice(-40).join(' | ')`;

async function run(js) {
  return page.eval(js + '\nreturn 1');
}
async function shot(dir, name, js = '', settle = 900) {
  try {
    if (js) await run(js);
    await new Promise((r) => setTimeout(r, settle));
    mkdirSync(join(OUT, dir), { recursive: true });
    await page.shot(join(OUT, dir, `${name}.png`));
    console.log(`ok  ${dir}/${name}  ${await page.eval('return location.pathname')}`);
  } catch (e) {
    console.log(`ERR ${dir}/${name}: ${e.message.split('\n')[0]}`);
    console.log(`    path=${await page.eval('return location.pathname')}`);
    console.log(`    labels=${await page.eval(labels)}`);
    throw e;
  }
}
async function fresh() {
  await page.goto(`${BASE}/`, 4000);
  await run(`if (__h.find('Vào app')) await __h.click('Vào app', { after: 2500 })`);
}
const tab = (name, after = 1800) => `await __h.click(${J(name)}, { after: ${after} })`;
const back = (after = 1500) => `history.back(); await __h.sleep(${after})`;

const flows = {
  async dashboard() {
    await fresh();
    await shot('dashboard', '01-overview', '', 1500);
    await shot('dashboard', '02-overview-priorities-and-bestsellers', `await __h.scrollToText('Ưu tiên hôm nay', 24)`);
    await shot('dashboard', '04-orders', tab('Đơn hàng'));
    await shot('dashboard', '05-create-order', tab('Tạo đơn', 2200));
    await shot('dashboard', '06-create-order-with-cart', `
      const adds = [...document.querySelectorAll('[aria-label="Thêm"]')].filter(e => e.getBoundingClientRect().width > 0);
      adds[0].click(); await __h.sleep(300); adds[0].click(); await __h.sleep(300);
      adds[2].click(); await __h.sleep(300); adds[3].click(); await __h.sleep(900);`);
    await shot('dashboard', '07-manage', tab('Quản lý'));
    await shot('dashboard', '03-revenue-report', `await __h.clickLabel('Báo cáo', 2500)`);
    await run(back());
    await shot('dashboard', '08-products', `await __h.clickLabel('Hàng hoá', 2500)`);
    await run(back());
    await shot('dashboard', '09-debts', `await __h.clickLabel('Công nợ', 2500)`);
  },
  async chat() {
    await fresh();
    await shot('chat', '01-ai-assistant', tab('Trợ lý Bobi', 2500));
    await shot('chat', '02-ask-question', `await __h.type('Nhập câu hỏi', 'Món nào sắp hết hàng?')`);
    await shot('chat', '03-answer', `
      await __h.clickLabel('Gửi tin nhắn', 1500);
      const box = document.querySelector('[aria-label="Tin nhắn cho trợ lý"]');
      if (box && box.value) await __h.clickLabel('Hỏi trợ lý: Món nào sắp hết hàng?', 500);
      await __h.sleep(9000);`);
  },
  async barcode() {
    await fresh();
    await run(`window.__cam = { code: null, label: 'Nước ngọt CocaCola', tint: '#d62828' }`);
    await run(tab('Tạo đơn', 2200));
    await shot('barcode', '01-scan-barcode', `await __h.clickLabel('Quét mã', 3000)`);
    await shot('barcode', '02-recognize-item', `window.__cam.code = '8935049500544'; await __h.sleep(3500)`);
    await shot('barcode', '03-draft-order-in-scanner', `await __h.click('Thêm', { after: 1500 }); window.__cam.code = null; await __h.sleep(1500)`);
    await shot('barcode', '04-code-not-in-catalog', `window.__cam = { code: '8936079140014', label: 'Bánh quy bơ dừa', tint: '#2f7a43' }; await __h.sleep(4000)`);
    await shot('barcode', '05-add-new-item', `
      const exactThem = (root) => [...root.querySelectorAll('*')].find((e) => (e.innerText || '').trim() === 'Thêm' && e.getBoundingClientRect().width > 0);
      let box = __h.find('Chạm để thêm mặt hàng', { exact: false });
      while (box && !exactThem(box)) box = box.parentElement;
      const btn = box && exactThem(box);
      if (!btn) throw new Error('banner Thêm not found');
      (btn.closest('[role=button]') || btn).click();
      await __h.sleep(2000);
      await __h.type('Ví dụ: Sting', 'Bánh quy bơ dừa hộp 300g', 300);
      const inputs = [...document.querySelectorAll('input')].filter((i) => i.getBoundingClientRect().width > 0 && i.getBoundingClientRect().top > 400);
      const price = inputs.find((i) => i.value === '0' || i.placeholder === '0');
      if (price) {
        price.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(price, '35000');
        price.dispatchEvent(new Event('input', { bubbles: true }));
        price.blur();
      }
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      await __h.sleep(800);`);
  },
  async voice() {
    await fresh();
    await run(tab('Tạo đơn', 2200));
    await shot('voice', '01-read-order', `await __h.clickLabel('Đọc đơn', 3000)`);
    await run(`await __h.click('Nhập tay', { exact: false, after: 1500 })`);
    await run(`
      const el = await __h.type('Nhập món và số lượng', '2 cà phê sữa đá 1 bánh mì thịt 3 mì gói', 300);
      for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await __h.sleep(3000);`);
    await shot('voice', '02-listen-and-record-order', `await __h.scrollTo(0, 1200)`);
    await run(`
      await __h.click('Nhập tay', { exact: false, after: 1200 });
      const el = await __h.type('Nhập món và số lượng', '1 sữa chua nếp cẩm', 300);
      for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await __h.sleep(3000);`);
    await shot('voice', '03-new-item-enter-quantity', `
      await __h.type('VD: 12000', '18000', 200);
      await __h.type('VD: 2', '1', 200);
      await __h.type('VD: cái, ly', 'hộp', 200);
      document.activeElement && document.activeElement.blur && document.activeElement.blur();`);
    await shot('voice', '04-order-recorded', `
      await __h.click('Thêm vào danh mục', { after: 2000 });
      const s = __h.scroller(); if (s) { s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll')); }
      await __h.sleep(1200);`);
  },
};

try {
  for (const [name, fn] of Object.entries(flows)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    try {
      await fn();
    } catch (e) {
      console.log(`flow ${name} stopped`);
    }
  }
} finally {
  await page.close();
}
