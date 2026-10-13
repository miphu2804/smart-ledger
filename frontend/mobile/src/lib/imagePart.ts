/**
 * Phần `image` của form upload, bản cho web: ảnh đã được chọn và thu nhỏ thành `Blob` (xem `productPhoto.ts`).
 * Bản cho Android/iOS nằm ở `imagePart.native.ts`.
 */
export function imagePart(image: { uri: string; blob?: Blob }): Blob {
  if (!image.blob) throw new Error('Ảnh trên web phải có dữ liệu blob');
  return image.blob;
}
