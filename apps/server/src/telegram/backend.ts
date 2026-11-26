import type { AppStatus, AuthState, ChatSummary } from '@marquee/shared';
import type { ByteSource } from '../stream/range.js';
import type { schema } from '../db/client.js';

export type FileRow = typeof schema.files.$inferSelect;

/** What the HTTP layer needs from Telegram. A real client and a demo stand-in both implement it. */
export interface TelegramBackend {
  status(): AppStatus['telegram'];
  authState(): AuthState;
  saveCredentials(apiId: number, apiHash: string): Promise<AuthState>;
  sendPhone(phone: string): Promise<AuthState>;
  submitCode(code: string): Promise<AuthState>;
  submitPassword(password: string): Promise<AuthState>;
  startQr(): Promise<AuthState>;
  cancelAuth(): Promise<AuthState>;
  logout(): Promise<void>;
  listChats(): Promise<ChatSummary[]>;
  byteSource(file: FileRow): Promise<ByteSource | null>;
  onChange(listener: () => void): void;
}
