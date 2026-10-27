// Chạy trong trang trước mọi script của app: camera giả (canvas dọc 720×1280 vẽ gói hàng có mã EAN-13, đổi bằng window.__cam)
// và các hàm tiện ích window.__h để bấm, gõ, cuộn theo chữ hiển thị hoặc aria-label.
(() => {
  // ---------- EAN-13 ----------
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function ean13Bits(code) {
    const d = code.split('').map(Number);
    const par = PARITY[d[0]];
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[d[i]];
    return bits + '101';
  }

  window.__cam = { code: '8935049500544', label: 'Nước ngọt CocaCola', tint: '#d62828' };
  function drawScene(ctx, w, h, t) {
    const cam = window.__cam;
    // kệ hàng mờ phía sau (khung dọc 720×1280 như camera điện thoại)
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#4a4752');
    bg.addColorStop(1, '#1e1d24');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 7; i++) ctx.fillRect(0, 140 + i * 170, w, 8);
    // gói hàng trong tay, lắc nhẹ
    const sway = Math.sin(t / 700) * 3;
    ctx.save();
    ctx.translate(w / 2 + sway, h / 2 + 10);
    ctx.rotate(Math.sin(t / 900) * 0.01);
    const pw = 560, ph = 760;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -pw / 2 + 14, -ph / 2 + 18, pw, ph, 40);
    ctx.fill();
    ctx.fillStyle = cam.tint;
    roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 40);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, -pw / 2 + 28, -ph / 2 + 28, pw - 56, 96, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(cam.label, 0, -ph / 2 + 92);
    // nhãn trắng mặt sau
    const lw = 460, lh = 430, ly = -ph / 2 + 180;
    ctx.fillStyle = '#fff';
    roundRect(ctx, -lw / 2, ly, lw, lh, 18);
    ctx.fill();
    ctx.fillStyle = '#d4d4da';
    for (let i = 0; i < 4; i++) {
      const lineW = [360, 300, 340, 220][i];
      roundRect(ctx, -lw / 2 + 40, ly + 36 + i * 30, lineW, 12, 6);
      ctx.fill();
    }
    if (cam.code) {
      const bits = ean13Bits(cam.code);
      const mod = 4, bw = bits.length * mod;
      const x0 = -bw / 2, y0 = ly + 170, bh = 170;
      ctx.fillStyle = '#000';
      for (let i = 0; i < bits.length; i++) {
        if (bits[i] !== '1') continue;
        const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
        ctx.fillRect(x0 + i * mod, y0, mod, guard ? bh + 14 : bh);
      }
      ctx.font = '26px monospace';
      ctx.fillText(cam.code.split('').join(' '), 0, y0 + bh + 44);
    } else {
      ctx.fillStyle = '#e4e4ea';
      for (let i = 0; i < 4; i++) {
        roundRect(ctx, -lw / 2 + 40, ly + 200 + i * 34, [380, 330, 360, 250][i], 12, 6);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const fakeGUM = async () => {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 1280;
    const ctx = c.getContext('2d');
    const loop = (t) => {
      drawScene(ctx, c.width, c.height, t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    drawScene(ctx, c.width, c.height, 0);
    return c.captureStream(20);
  };
  try {
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
    navigator.mediaDevices.getUserMedia = fakeGUM;
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'fake', label: 'Camera', groupId: 'g' }];
  } catch {}

  // ---------- tiện ích ----------
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01;
  };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const clickable = (el) => el.closest('[role="button"],[role="tab"],[role="link"],[role="menuitem"],[role="checkbox"],[role="switch"],a,button,[tabindex]') || el;
  window.__h = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    find(text, { exact = true, within = document } = {}) {
      const els = [...within.querySelectorAll('*')].filter((e) => e.children.length === 0 || e.childElementCount < 4);
      const hits = els.filter((e) => visible(e) && (exact ? textOf(e) === text : textOf(e).includes(text)));
      // phần tử sâu nhất
      hits.sort((a, b) => textOf(a).length - textOf(b).length);
      return hits[0] || null;
    },
    async waitText(text, ms = 8000, exact = false) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (this.find(text, { exact })) return true;
        await this.sleep(150);
      }
      throw new Error(`text not found: ${text}`);
    },
    async click(text, opts = {}) {
      await this.waitText(text, opts.ms ?? 8000, opts.exact ?? true);
      const el = this.find(text, { exact: opts.exact ?? true });
      clickable(el).click();
      await this.sleep(opts.after ?? 700);
    },
    async clickLabel(label, after = 700) {
      const el = [...document.querySelectorAll(`[aria-label="${label}"]`)].find(visible);
      if (!el) throw new Error(`label not found: ${label}`);
      el.click();
      await this.sleep(after);
    },
    async type(placeholder, value, after = 400) {
      const el = [...document.querySelectorAll('input,textarea')].find((i) => visible(i) && (i.placeholder || '').includes(placeholder));
      if (!el) throw new Error(`input not found: ${placeholder}`);
      el.focus();
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await this.sleep(after);
      return el;
    },
    scroller() {
      return [...document.querySelectorAll('div')].filter((d) => {
        const s = getComputedStyle(d);
        return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 40 && visible(d);
      }).sort((a, b) => b.clientHeight - a.clientHeight)[0];
    },
    async scrollTo(y, after = 900) {
      const s = this.scroller();
      if (s) {
        s.scrollTop = y;
        s.dispatchEvent(new Event('scroll'));
      }
      await this.sleep(after);
      return s ? s.scrollTop : -1;
    },
    async scrollToText(text, offset = 100, after = 900) {
      const el = this.find(text, { exact: false });
      const s = this.scroller();
      if (!el || !s) throw new Error(`cannot scroll to ${text}`);
      s.scrollTop += el.getBoundingClientRect().top - s.getBoundingClientRect().top - offset;
      s.dispatchEvent(new Event('scroll'));
      await this.sleep(after);
    },
    dump(max = 1500) {
      return textOf(document.body).slice(0, max);
    },
  };
})();
