import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import type { AppStatus, AuthState, ChatSummary } from '@marquee/shared';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import type { ByteSource } from '../stream/range.js';
import { LocalFileSource } from '../stream/sources.js';
import type { FileRow, TelegramBackend } from '../telegram/backend.js';
import { MOCK_CHATS } from './seed.js';

const { sources, files } = schema;

/**
 * Stand-in for Telegram in demo mode. Walks through the same login steps, accepting the code
 * 12345 and the password "demo", so onboarding can be built and tested without an account.
 */
export class MockBackend implements TelegramBackend {
  private state: AppStatus['telegram']['state'];
  private auth: AuthState = { step: 'phone' };
  private listeners: (() => void)[] = [];
  private phone = '';

  constructor(
    private readonly db: Db,
    loggedIn: boolean,
  ) {
    this.state = loggedIn ? 'ready' : 'logged-out';
    if (loggedIn) this.auth = { step: 'done' };
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }

  status(): AppStatus['telegram'] {
    return {
      state: this.state,
      user: this.state === 'ready' ? { name: 'Demo account' } : undefined,
    };
  }
  authState(): AuthState {
    return this.auth;
  }
  async saveCredentials(): Promise<AuthState> {
    return (this.auth = { step: 'phone' });
  }
  async sendPhone(phone: string): Promise<AuthState> {
    if (phone.replace(/\D/g, '').length < 7)
      return (this.auth = { step: 'phone', error: 'phone_invalid' });
    this.phone = phone;
    return (this.auth = { step: 'code', codeViaApp: true });
  }
  async submitCode(code: string): Promise<AuthState> {
    if (code.replace(/\D/g, '') !== '12345')
      return (this.auth = { ...this.auth, step: 'code', error: 'code_invalid' });
    if (this.phone.replace(/\D/g, '').endsWith('9'))
      return (this.auth = { step: 'password', hint: 'First pet' });
    return this.finish();
  }
  async submitPassword(pw: string): Promise<AuthState> {
    if (pw !== 'demo')
      return (this.auth = { step: 'password', hint: 'First pet', error: 'password_invalid' });
    return this.finish();
  }
  private finish(): AuthState {
    this.state = 'ready';
    this.auth = { step: 'done' };
    this.emit();
    return this.auth;
  }
  async startQr(): Promise<AuthState> {
    const svg = await QRCode.toString('tg://login?token=demo-only', { type: 'svg', margin: 1 });
    setTimeout(() => {
      if (this.auth.step === 'qr') this.finish();
    }, 6000);
    return (this.auth = { step: 'qr', qr: { svg, expiresAt: Date.now() + 30_000 } });
  }
  async cancelAuth(): Promise<AuthState> {
    return (this.auth = { step: 'phone' });
  }
  async logout(): Promise<void> {
    this.state = 'logged-out';
    this.auth = { step: 'phone' };
    this.emit();
  }
  async listChats(): Promise<ChatSummary[]> {
    const kinds = new Map(
      this.db
        .select()
        .from(sources)
        .all()
        .map((s) => [s.chatId, s.kind]),
    );
    return MOCK_CHATS.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      members: c.members,
      kind: kinds.get(c.id) ?? null,
      indexed: this.db.select().from(files).where(eq(files.chatId, c.id)).all().length,
    }));
  }
  async byteSource(file: FileRow): Promise<ByteSource | null> {
    return file.localPath ? new LocalFileSource(file.localPath, file.mime) : null;
  }
}
