import type { AppStatus, AuthState, ChatSummary } from '@marquee/shared';
import type { ByteSource } from '../stream/range.js';
import type { schema } from '../db/client.js';

export type FileRow = typeof schema.files.$inferSelect;

/** What the HTTP layer needs from Telegram. A real client and a demo stand-in both implement it. */
export interface TelegramBackend {
  status(): AppStatus['telegram'];
  authState(): AuthState;
  saveCredentials(apiId: number, apiHash: string): Promise<AuthState>;
  resetCredentials(): Promise<AuthState>;
  /** Phone-only sign-in: create API keys on my.telegram.org with a code sent to Telegram. */
  requestKeysCode(phone: string): Promise<AuthState>;
  submitKeysCode(code: string): Promise<AuthState>;
  sendPhone(phone: string): Promise<AuthState>;
  submitCode(code: string): Promise<AuthState>;
  resendCode(): Promise<AuthState>;
  submitPassword(password: string): Promise<AuthState>;
  startQr(): Promise<AuthState>;
  cancelAuth(): Promise<AuthState>;
  logout(): Promise<void>;
  listChats(): Promise<ChatSummary[]>;
  /** What a chat mostly holds, judged from its recent messages: 'live' links and playlists, 'media' files, or 'empty'. */
  probeChat(chatId: string): Promise<'live' | 'media' | 'empty'>;
  byteSource(file: FileRow): Promise<ByteSource | null>;
  onChange(listener: () => void): void;
}
