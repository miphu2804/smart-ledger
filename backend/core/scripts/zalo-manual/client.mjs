// No third-party script, browser storage, console logging or token rendering.
const safeCode = value => typeof value === 'string' && /^[a-z_]{1,80}$/.test(value) ? value : 'request_failed';

async function jsonCall(fetcher, url, options, stage) {
  const response = await fetcher(url, { ...options, cache: 'no-store', redirect: 'error',
    credentials: url.startsWith('/') ? 'same-origin' : 'omit', signal: AbortSignal.timeout(45_000) });
  if (!response.ok) {
    let code = 'request_failed';
    try { code = safeCode((await response.json()).code); } catch { /* fixed error only */ }
    throw new Error(`${stage}: ${code} (${response.status})`);
  }
  return response.json();
}

export function acceptsMessage(event, attempt, origin) {
  return Boolean(attempt && event.origin === origin && event.source === attempt.popup &&
    event.data?.type === 'smartledger:zalo' && event.data.requestId === attempt.requestId &&
    event.data.purpose === attempt.purpose);
}

export async function completeLogin(proof, clientVerifier, apiKey, fetcher = fetch) {
  const headers = { 'Content-Type': 'application/json' };
  const exchange = await jsonCall(fetcher, '/api/v1/auth/zalo/exchange', { method: 'POST', headers,
    body: JSON.stringify({ proof, clientVerifier }) }, 'Core exchange');
  if (typeof exchange.firebaseCustomToken !== 'string') throw new Error('Core exchange: invalid_response');
  const firebase = await jsonCall(fetcher,
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    { method: 'POST', headers, body: JSON.stringify({ token: exchange.firebaseCustomToken, returnSecureToken: true }) },
    'Firebase');
  if (typeof firebase.idToken !== 'string') throw new Error('Firebase: invalid_response');
  const session = await jsonCall(fetcher, '/api/v1/auth/session', { method: 'POST',
    headers: { ...headers, Authorization: `Bearer ${firebase.idToken}` },
    body: JSON.stringify({ displayName: exchange.displayName || 'Người dùng Zalo thử nghiệm' }) }, 'Core session');
  // Return only the session, not credentials or Firebase refresh-token state.
  return session;
}

const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const challenge = async value => btoa(String.fromCharCode(...new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

async function initialize() {
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const login = document.getElementById('login');
  let attempt = null, previousUserId = null, generation = 0;
  const resetAttempt = () => {
    if (attempt?.timer) clearTimeout(attempt.timer);
    if (attempt?.popup && !attempt.popup.closed) attempt.popup.close();
    attempt = null;
    login.disabled = false;
  };
  const accessKey = location.hash.slice(1);
  history.replaceState(null, '', '/');
  if (accessKey) {
    try {
      const response = await fetch('/unlock', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: accessKey }),
        signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error();
    } catch {
      status.textContent = 'Không mở được quyền thử. Mở lại file open.html trên máy đang chạy Core.';
      return;
    }
  }
  status.textContent = 'Sẵn sàng. Nhập Firebase Web API key rồi bấm đăng nhập.';
  login.disabled = false;
  document.getElementById('reset').onclick = () => {
    generation++;
    resetAttempt(); result.textContent = ''; document.getElementById('apiKey').value = '';
    status.textContent = 'Đã xóa kết quả; không lưu token vào trình duyệt. Tài khoản Firebase/DB không bị xóa.';
  };
  login.onclick = async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!document.getElementById('consent').checked || !/^AIza[\w-]{20,100}$/.test(apiKey)) {
      status.textContent = 'Cần xác nhận thử nghiệm và nhập Firebase Web API key hợp lệ.'; return;
    }
    resetAttempt();
    generation++;
    // Open synchronously during the user gesture, before waiting for crypto.
    const popup = window.open('about:blank', '_blank', 'popup,width=560,height=740');
    if (!popup) { status.textContent = 'Trình duyệt chặn popup. Cho phép popup và thử lại.'; return; }
    const current = { popup, purpose: 'LOGIN', requestId: token(), clientVerifier: token(), apiKey, generation };
    attempt = current; login.disabled = true;
    try {
      const clientChallenge = await challenge(current.clientVerifier);
      if (attempt !== current) return;
      const query = new URLSearchParams({ purpose: current.purpose, clientOrigin: location.origin,
        requestId: current.requestId, clientChallenge });
      current.timer = setTimeout(() => {
        if (attempt === current) { resetAttempt(); status.textContent = 'Hết thời gian. Bắt đầu lượt đăng nhập mới.'; }
      }, 310_000);
      popup.location.replace(`/api/v1/auth/zalo/authorize?${query}`);
      status.textContent = 'Hoàn tất xác nhận trong popup Zalo. Không đóng trang thử này.';
    } catch { resetAttempt(); status.textContent = 'Không khởi tạo được lượt thử. Bắt đầu lại.'; }
  };
  window.addEventListener('message', async event => {
    if (!acceptsMessage(event, attempt, location.origin)) return;
    const current = attempt;
    // Consume the browser attempt before asynchronous I/O, so duplicate postMessage cannot exchange twice.
    attempt = null; clearTimeout(current.timer);
    if (event.data.error || typeof event.data.proof !== 'string') {
      login.disabled = false; status.textContent = `Zalo/Core: ${safeCode(event.data.error)}. Hãy bắt đầu lại.`; return;
    }
    status.textContent = 'Đang đổi kết quả qua Firebase và mở phiên Core…';
    try {
      const session = await completeLogin(event.data.proof, current.clientVerifier, current.apiKey);
      if (generation !== current.generation) return;
      const comparison = previousUserId === null ? 'Lượt thành công đầu tiên trong trang này.'
        : previousUserId === session.user.id ? 'Đăng nhập lại: giữ nguyên ID người dùng Core.' : 'Tài khoản Core khác lượt trước.';
      previousUserId = session.user.id;
      result.textContent = JSON.stringify({ userId: session.user.id, displayName: session.user.displayName,
        role: session.role, needsOnboarding: session.needsOnboarding, shopCount: session.shops?.length ?? 0,
        comparison }, null, 2);
      status.textContent = 'Thành công: Zalo → Firebase → Core local (DB tạm).';
    } catch (error) {
      if (generation !== current.generation) return;
      status.textContent = /^[\w :_()-]+$/.test(error.message) ? error.message : 'Không hoàn tất được lượt thử. Bắt đầu lại.';
    } finally { if (generation === current.generation) login.disabled = false; }
  });
}

if (typeof document !== 'undefined') initialize();
