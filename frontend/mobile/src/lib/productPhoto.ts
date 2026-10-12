/**
 * Ảnh mặt hàng trước khi tải lên Core (POST /products/{id}/image).
 *
 * Core chỉ nhận JPEG/PNG, tối đa 5 MiB và mỗi cạnh 1–2048 px. App chưa có thư viện thu nhỏ ảnh trên máy, nên:
 * - Trên web: chọn file rồi thu nhỏ bằng canvas trước khi gửi.
 * - Trên máy: chụp bằng camera của app ở cỡ ảnh không vượt giới hạn (xem `choosePictureSize`).
 */

import { Platform } from 'react-native';

/** Nguồn ảnh theo nền tảng: web mở hộp chọn file của trình duyệt, Android/iOS chụp bằng camera của app. */
export const PHOTO_SOURCE: 'files' | 'camera' = Platform.OS === 'web' ? 'files' : 'camera';

/** Cạnh dài nhất Core cho phép. */
export const MAX_IMAGE_SIDE = 2048;
/** Cạnh dài nhất app gửi lên: đủ nét cho thẻ sản phẩm, file nhỏ để tải nhanh trên mạng di động. */
const TARGET_IMAGE_SIDE = 1280;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PickedImage {
  /** `file://` (máy) hoặc `blob:` (web); dùng để xem trước và làm nguồn gửi trên máy */
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
  /** Web: dữ liệu ảnh sau khi thu nhỏ. Trên máy, ảnh được gửi theo `uri`. */
  blob?: Blob;
}

/** Lỗi khi chọn ảnh, kèm câu tiếng Việt để hiện cho người dùng. */
export class PhotoError extends Error {}

/**
 * Chọn cỡ ảnh cho camera từ danh sách của máy (`getAvailablePictureSizesAsync`). Chỉ xét các cỡ dạng "RỘNGxCAO"
 * (iOS còn trả các tên như "Photo", "High" không biết trước số điểm ảnh). Lấy cỡ lớn nhất có cạnh dài ≤ `TARGET_IMAGE_SIDE`;
 * không có thì lấy cỡ nhỏ nhất còn nằm trong giới hạn của Core. Không cỡ nào hợp lệ thì trả `undefined`.
 */
export function choosePictureSize(sizes: readonly string[]): string | undefined {
  const parsed = sizes
    .map((size) => {
      const match = /^(\d+)x(\d+)$/.exec(size.trim());
      return match ? { size, long: Math.max(Number(match[1]), Number(match[2])), area: Number(match[1]) * Number(match[2]) } : null;
    })
    .filter((entry): entry is { size: string; long: number; area: number } => entry !== null && entry.long >= 1 && entry.long <= MAX_IMAGE_SIDE);
  if (!parsed.length) return undefined;
  const preferred = parsed.filter((entry) => entry.long <= TARGET_IMAGE_SIDE);
  if (preferred.length) return preferred.reduce((best, entry) => (entry.area > best.area ? entry : best)).size;
  return parsed.reduce((best, entry) => (entry.area < best.area ? entry : best)).size;
}

/** Ảnh chụp có nằm trong giới hạn kích thước của Core không. */
export function fitsCoreLimits(width: number, height: number): boolean {
  return width >= 1 && height >= 1 && width <= MAX_IMAGE_SIDE && height <= MAX_IMAGE_SIDE;
}

/**
 * Web: mở hộp chọn file của trình duyệt (trên điện thoại có cả "Chụp ảnh"), thu nhỏ về `TARGET_IMAGE_SIDE` và xuất JPEG.
 * Trả `null` khi người dùng đóng hộp chọn mà không chọn gì.
 */
export function pickImageOnWeb(): Promise<PickedImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    input.style.display = 'none';
    // Một số trình duyệt di động chỉ phát sự kiện `change` khi ô chọn file nằm trong trang
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      shrinkOnWeb(file).then(resolve, reject);
    });
    input.click();
  });
}

async function shrinkOnWeb(file: File): Promise<PickedImage> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw new PhotoError('Chỉ nhận ảnh JPEG hoặc PNG');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoError('Không đọc được ảnh này. Hãy chọn ảnh khác');
  }
  const scale = Math.min(1, TARGET_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('Trình duyệt không xử lý được ảnh này');
  // JPEG không có nền trong suốt: tô trắng trước để ảnh PNG trong suốt không ra nền đen
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
  if (!blob) throw new PhotoError('Trình duyệt không xử lý được ảnh này');
  if (blob.size > MAX_IMAGE_BYTES) throw new PhotoError('Ảnh quá lớn (tối đa 5 MB)');
  return { uri: URL.createObjectURL(blob), width, height, mimeType: 'image/jpeg', blob };
}
