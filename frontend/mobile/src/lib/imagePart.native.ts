import { File } from 'expo-file-system';

/**
 * Phần `image` của form upload, bản cho Android/iOS: đọc thẳng file ảnh trên máy theo `uri`.
 *
 * `fetch` toàn cục của app là bản của Expo (expo/fetch). Bản này không nhận kiểu `{ uri, name, type }` của React Native
 * (ném "Unsupported FormDataPart implementation" trước khi gửi, app báo thành lỗi mạng); nó nhận `File` của
 * expo-file-system, vốn có `bytes()`, `name` và `type` để dựng phần multipart.
 */
export function imagePart(image: { uri: string; blob?: Blob }): Blob {
  return new File(image.uri) as unknown as Blob;
}
