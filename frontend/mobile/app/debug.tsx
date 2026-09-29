import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Button, Card, Header, Row, Screen, SectionTitle, T } from '../src/components/ui';
import { API_ENDPOINT, USE_MOCK, USE_MOCK_CORE, USE_MOCK_SHOPS } from '../src/config';
import type { SessionView } from '../src/data/types';
import { apiRequest } from '../src/lib/api';
import { authClient } from '../src/lib/auth';
import { clearDebugEvents, debugLog, decodeJwtClaims, getDebugEvents, maskId } from '../src/lib/debug';
import { describeError } from '../src/lib/errors';
import { sessionApi } from '../src/lib/sessionApi';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

const hhmmss = (t: number) => new Date(t).toTimeString().slice(0, 8);

/** Màn chẩn đoán: chỉ hiện khi chạy bản dev. Giúp biết app nối được Core chưa, token Firebase ra sao, lỗi gì. */
export default function Debug() {
  const app = useApp();
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [, refresh] = useState(0);

  if (!__DEV__) {
    return (
      <Screen>
        <Header title="Chẩn đoán" />
        <T size={14} color={colors.muted}>
          Màn này chỉ dùng khi phát triển.
        </T>
      </Screen>
    );
  }

  const run = async (name: string, fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setResult(`${name}…`);
    try {
      const out = await fn();
      debugLog('debug', name, '→', out.split('\n')[0]);
      setResult(out);
    } catch (e) {
      debugLog('debug', name, '✗', describeError(e));
      setResult(`✗ ${describeError(e)}`);
    } finally {
      setBusy(false);
      refresh((n) => n + 1);
    }
  };

  const checkCore = () =>
    run('Kiểm tra kết nối Core', async () => {
      const started = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        // /v3/api-docs là đường dẫn công khai của Core (không cần token)
        const res = await fetch(`${API_ENDPOINT}/v3/api-docs`, { signal: ctrl.signal });
        return `✓ Core trả HTTP ${res.status} sau ${Date.now() - started} ms\n${API_ENDPOINT}`;
      } catch (e) {
        const why = ctrl.signal.aborted
          ? 'Hết 8 giây không có phản hồi (thường do tường lửa chặn hoặc sai IP).'
          : `Lỗi: ${String(e)}`;
        return (
          `✗ Không kết nối được tới ${API_ENDPOINT}\n${why}\n` +
          'Kiểm tra: Core đang chạy? IP đúng (IP Wi-Fi của máy)? điện thoại cùng Wi-Fi? Windows Firewall / mạng Public? ' +
          'Android chặn HTTP (thử tunnel https)?' +
          (Platform.OS === 'web' ? '\nTrên web còn có thể bị CORS chặn (Core chưa cấu hình CORS): hãy thử trên Android.' : '')
        );
      } finally {
        clearTimeout(timer);
      }
    });

  const showToken = () =>
    run('Xem token Firebase', async () => {
      const token = await authClient.getIdToken();
      if (!token) return 'Chưa đăng nhập Firebase (không có token).';
      const c = decodeJwtClaims(token);
      if (!c) return `Có token (${token.length} ký tự) nhưng không đọc được claims.`;
      const exp = typeof c.exp === 'number' ? Math.round((c.exp * 1000 - Date.now()) / 60000) : null;
      const fb = c.firebase as { sign_in_provider?: string } | undefined;
      return [
        `aud (project): ${String(c.aud)}   ← Core cần FIREBASE_PROJECT_ID trùng giá trị này`,
        `iss: ${String(c.iss)}`,
        `provider: ${fb?.sign_in_provider ?? '?'}`,
        `uid: ${String(c.sub).slice(0, 6)}…`,
        `phone: ${maskId(c.phone_number as string | undefined) || '—'}   email: ${maskId(c.email as string | undefined) || '—'}`,
        exp === null ? '' : exp > 0 ? `hết hạn sau ~${exp} phút (SDK tự làm mới)` : `ĐÃ HẾT HẠN ${-exp} phút trước`,
      ]
        .filter(Boolean)
        .join('\n');
    });

  const callMe = () =>
    run('GET /me', async () => {
      // Gọi thẳng để 401 chỉ hiện lỗi, không tự đăng xuất khỏi app
      const s = USE_MOCK_CORE ? await sessionApi.me() : await apiRequest<SessionView>('/me', { handle401: false });
      return (
        `✓ /me${USE_MOCK_CORE ? ' (Core GIẢ LẬP)' : ''}\n` +
        `id=${s.user.id}  role=${s.role}  needsOnboarding=${s.needsOnboarding}  shops=${s.shops.length}\n` +
        `tên: ${s.user.displayName}`
      );
    });

  const rows: [string, string][] = [
    ['Chế độ', USE_MOCK ? 'MOCK toàn bộ' : USE_MOCK_CORE ? 'Firebase thật, Core giả lập' : 'Firebase thật + Core thật'],
    ['Tạo tiệm', USE_MOCK_SHOPS ? 'giả lập (lưu ở máy)' : 'gọi POST /shops'],
    ['API_ENDPOINT', API_ENDPOINT],
    ['Nền tảng', `${Platform.OS} ${String(Platform.Version)}`],
    ['Firebase', authClient.currentPhone() ? `SĐT ${maskId(authClient.currentPhone())}` : authClient.currentEmail() ? `email ${maskId(authClient.currentEmail())}` : 'chưa đăng nhập'],
    ['App', app.loggedIn ? `đã đăng nhập · shopId=${app.shopId ?? '—'}` : 'chưa đăng nhập'],
  ];
  const events = getDebugEvents();

  return (
    <Screen>
      <Header title="Chẩn đoán kết nối" subtitle="Chỉ có ở bản dev" />

      <Card>
        {rows.map(([k, v]) => (
          <Row key={k} style={{ paddingVertical: 4, alignItems: 'flex-start' }}>
            <T size={12} color={colors.faint} style={{ width: 92 }}>
              {k}
            </T>
            <T size={12.5} w="semibold" style={{ flex: 1 }} selectable>
              {v}
            </T>
          </Row>
        ))}
      </Card>

      <Button title="Kiểm tra kết nối Core" icon="wifi" onPress={checkCore} loading={busy} style={{ marginTop: 14 }} />
      <Row style={{ marginTop: 10 }}>
        <Button title="Xem token" variant="outline" small style={{ flex: 1 }} onPress={showToken} disabled={busy} />
        <Button title="Gọi GET /me" variant="outline" small style={{ flex: 1 }} onPress={callMe} disabled={busy} />
      </Row>

      {result ? (
        <Card style={{ marginTop: 12 }}>
          <T size={12} selectable style={{ lineHeight: 18 }}>
            {result}
          </T>
        </Card>
      ) : null}

      <SectionTitle
        title="Nhật ký gần đây"
        action="Xoá"
        onAction={() => {
          clearDebugEvents();
          refresh((n) => n + 1);
        }}
      />
      <Card style={{ paddingVertical: 8 }}>
        {events.length ? (
          events.slice(0, 40).map((ev, i) => (
            <T key={`${ev.at}-${i}`} size={12} color={colors.muted} selectable style={{ paddingVertical: 2, lineHeight: 17 }}>
              {hhmmss(ev.at)} [{ev.tag}] {ev.text}
            </T>
          ))
        ) : (
          <T size={12} color={colors.faint}>
            Chưa có sự kiện nào.
          </T>
        )}
      </Card>

      <Button title="Làm mới" variant="soft" small onPress={() => refresh((n) => n + 1)} style={{ marginTop: 12, marginBottom: 40 }} />
    </Screen>
  );
}
