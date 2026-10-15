import type { UpdateManifest } from './appUpdate';

/** Web và iOS không tự cài APK; bản Android nằm ở appUpdateInstall.native.ts. */
export const installedVersionCode = NaN;

export async function downloadAndInstall(_manifest: UpdateManifest, _onProgress: (fraction: number) => void): Promise<void> {
  throw new Error('Tự cập nhật chỉ có trên Android');
}
