import { USE_MOCK } from '../../config';
import { firebaseAuth } from './firebase';
import { mockAuth } from './mock';
import { AuthClient } from './types';

export { AuthError } from './types';
export type { AuthClient, AuthErrorCode } from './types';

/** USE_MOCK=true → giả lập (mọi email đều xác minh được ngay). USE_MOCK=false → Firebase thật (native hoặc web tuỳ nền tảng). */
export const authClient: AuthClient = USE_MOCK ? mockAuth : firebaseAuth;
