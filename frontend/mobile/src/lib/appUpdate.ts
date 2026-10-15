/**
 * Kiểm tra bản APK mới trên R2. CD ghi `version.json` cạnh APK sau mỗi lần phát hành production
 * (xem docs/development/ci-cd.md, mục Android build); app so `versionCode` của bản đang chạy với file này.
 * Phần này không import gì của React Native để chạy được bằng `node --test`.
 */
export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  /** Địa chỉ tuyệt đối của file APK (bản release của Android chặn HTTP thường, và trình cài đặt chỉ nhận APK ký đúng keystore); trỏ tới bản trong builds/ để file không bị ghi đè lúc đang tải. */
  apk: string;
}

const FETCH_TIMEOUT_MS = 8000;

/** Trả về bản mới hơn bản đang cài, hoặc null khi đã mới nhất, chưa cấu hình, hoặc không lấy được file (lỗi mạng không làm phiền người dùng). */
export async function findNewerBuild(
  manifestUrl: string,
  installedVersionCode: number,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateManifest | null> {
  if (!manifestUrl || !Number.isInteger(installedVersionCode)) return null;
  try {
    const res = await fetchImpl(manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const manifest = parseManifest(await res.json());
    // Cùng nguồn với version.json: ai chỉ sửa được file này không trỏ được tới APK ở nơi khác.
    if (!manifest || new URL(manifest.apk).origin !== new URL(manifestUrl).origin) return null;
    return manifest.versionCode > installedVersionCode ? manifest : null;
  } catch {
    return null;
  }
}

export function parseManifest(raw: unknown): UpdateManifest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { versionCode, versionName, apk } = raw as Record<string, unknown>;
  if (!Number.isInteger(versionCode) || typeof versionName !== 'string' || typeof apk !== 'string') return null;
  return { versionCode: versionCode as number, versionName, apk };
}
