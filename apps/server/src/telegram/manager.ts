import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import bigInt from 'big-integer';
import QRCode from 'qrcode';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { eq, sql } from 'drizzle-orm';
import type { AppStatus, AuthState, ChatSummary, TelegramState } from '@marquee/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { sleep, withBackoff } from '../lib/async.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import type { ChunkCache } from '../stream/chunkCache.js';
import { CHUNK_SIZE, ChunkedSource, LocalFileSource } from '../stream/sources.js';
import type { ByteSource } from '../stream/range.js';
import type { FileRow, TelegramBackend } from './backend.js';
import {
  floodSeconds,
  isFileReferenceExpired,
  isSessionDead,
  isTransient,
  toAuthError,
} from './errors.js';

const { settings, files } = schema;

type MediaLike = Api.TypeMessageMedia;

/** How long a sign-in step may wait for Telegram before telling the person it is unreachable. */
const CONNECT_TIMEOUT = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT connecting to Telegram')), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export class TelegramManager implements TelegramBackend {
  private client: TelegramClient | null = null;
  private state: TelegramState = 'unconfigured';
  private retryAt: number | undefined;
  private userName: string | undefined;
  private auth: AuthState = { step: 'phone' };
  private creds: { apiId: number; apiHash: string } | null = null;
  private phone = '';
  private codeHash = '';
  private passwordWaiter: ((pw: string) => void) | null = null;
  private qrCancelled = false;
  private listeners: (() => void)[] = [];
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly sources = new Map<number, ChunkedSource>();
  private readonly mediaCache = new Map<number, { media: MediaLike; at: number }>();

  constructor(
    private readonly cfg: Config,
    private readonly db: Db,
    private readonly key: Buffer,
    private readonly cache: ChunkCache,
  ) {}

  // ---- state ------------------------------------------------------------------------------

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private set(state: TelegramState, retryAt?: number): void {
    this.state = state;
    this.retryAt = retryAt;
    for (const l of this.listeners) l();
  }

  status(): AppStatus['telegram'] {
    return {
      state: this.state,
      retryAt: this.retryAt,
      user: this.userName ? { name: this.userName } : undefined,
    };
  }

  authState(): AuthState {
    return this.auth;
  }

  private sessionFile(): string {
    return join(this.cfg.dataDir, 'telegram.session');
  }

  get ready(): boolean {
    return this.state === 'ready' && this.client !== null;
  }

  get tg(): TelegramClient | null {
    return this.client;
  }

  // ---- startup ----------------------------------------------------------------------------

  async init(): Promise<void> {
    this.creds = this.loadCredentials();
    if (!this.creds) {
      this.auth = { step: 'credentials' };
      this.set('unconfigured');
      return;
    }
    if (!existsSync(this.sessionFile())) {
      this.auth = { step: 'phone' };
      this.set('logged-out');
      return;
    }
    this.set('connecting');
    try {
      const saved = decrypt(readFileSync(this.sessionFile(), 'utf8'), this.key);
      this.client = this.newClient(saved);
      await this.client.connect();
      if (!(await this.client.checkAuthorization()))
        throw Object.assign(new Error('AUTH_KEY_UNREGISTERED'), {});
      await this.afterLogin();
    } catch (err) {
      if (isSessionDead(err)) await this.dropSession();
      else this.beginReconnect();
    }
  }

  private loadCredentials(): { apiId: number; apiHash: string } | null {
    if (this.cfg.apiId && this.cfg.apiHash)
      return { apiId: this.cfg.apiId, apiHash: this.cfg.apiHash };
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'telegram_credentials'))
      .get();
    if (!row) return null;
    try {
      return JSON.parse(decrypt(row.value, this.key));
    } catch {
      return null;
    }
  }

  async saveCredentials(apiId: number, apiHash: string): Promise<AuthState> {
    if (!Number.isInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) {
      this.auth = { step: 'credentials', error: 'credentials_invalid' };
      return this.auth;
    }
    this.creds = { apiId, apiHash };
    const value = encrypt(JSON.stringify(this.creds), this.key);
    this.db
      .insert(settings)
      .values({ key: 'telegram_credentials', value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
    this.auth = { step: 'phone' };
    this.set('logged-out');
    return this.auth;
  }

  private newClient(session: string): TelegramClient {
    const c = this.creds!;
    const client = new TelegramClient(new StringSession(session), c.apiId, c.apiHash, {
      connectionRetries: 5,
      retryDelay: 1500,
      autoReconnect: true,
      useWSS: false,
      deviceModel: 'Marquee',
      appVersion: this.cfg.version,
    });
    client.setLogLevel('none' as never);
    return client;
  }

  // ---- auth -------------------------------------------------------------------------------

  private fail(step: AuthState['step'], err: unknown): AuthState {
    const { code, waitSeconds } = toAuthError(err);
    this.auth = { ...this.auth, step, error: code, waitSeconds };
    return this.auth;
  }

  private async freshClient(): Promise<TelegramClient> {
    if (this.client) await this.client.disconnect().catch(() => undefined);
    const client = this.newClient('');
    this.client = client;
    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT);
    } catch (err) {
      // Stop GramJS from retrying in the background after we have given up on this attempt.
      void client.disconnect().catch(() => undefined);
      throw err;
    }
    return client;
  }

  async sendPhone(phone: string): Promise<AuthState> {
    if (!this.creds) return this.fail('credentials', new Error('API_ID_INVALID'));
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.replace(/\D/g, '').length < 7)
      return this.fail('phone', new Error('PHONE_NUMBER_INVALID'));
    try {
      const client = await this.freshClient();
      const res = await withTimeout(
        client.sendCode({ apiId: this.creds.apiId, apiHash: this.creds.apiHash }, digits),
        CONNECT_TIMEOUT,
      );
      this.phone = digits;
      this.codeHash = res.phoneCodeHash;
      this.auth = { step: 'code', codeViaApp: res.isCodeViaApp };
    } catch (err) {
      return this.fail('phone', err);
    }
    return this.auth;
  }

  async submitCode(code: string): Promise<AuthState> {
    const client = this.client;
    if (!client) return this.fail('phone', new Error('PHONE_CODE_EXPIRED'));
    try {
      const res = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phone,
          phoneCodeHash: this.codeHash,
          phoneCode: code.replace(/\D/g, ''),
        }),
      );
      if (res instanceof Api.auth.AuthorizationSignUpRequired)
        return this.fail('phone', new Error('NO_ACCOUNT'));
      await this.afterLogin();
    } catch (err) {
      if (/SESSION_PASSWORD_NEEDED/.test((err as { errorMessage?: string }).errorMessage ?? '')) {
        void this.runPasswordFlow(client);
        return this.auth;
      }
      const e = toAuthError(err);
      return this.fail(e.code === 'code_expired' ? 'phone' : 'code', err);
    }
    return this.auth;
  }

  private passwordFlowCallbacks() {
    return {
      password: (hint?: string) =>
        new Promise<string>((resolve) => {
          this.auth = {
            step: 'password',
            hint,
            error: this.auth.error === 'password_invalid' ? 'password_invalid' : undefined,
          };
          this.passwordWaiter = resolve;
          for (const l of this.listeners) l();
        }),
      onError: async (err: Error) => {
        const e = toAuthError(err);
        this.auth = { ...this.auth, error: e.code, waitSeconds: e.waitSeconds };
        // A wrong password asks again; anything else ends the attempt.
        return e.code !== 'password_invalid';
      },
    };
  }

  private async runPasswordFlow(client: TelegramClient): Promise<void> {
    this.auth = { step: 'password' };
    try {
      await client.signInWithPassword(this.creds!, this.passwordFlowCallbacks());
      await this.afterLogin();
    } catch (err) {
      if (this.auth.step !== 'done') this.fail('phone', err);
    }
  }

  async submitPassword(password: string): Promise<AuthState> {
    const waiter = this.passwordWaiter;
    this.passwordWaiter = null;
    if (!waiter) return this.auth;
    this.auth = { ...this.auth, error: undefined };
    waiter(password);
    // Give the sign-in attempt a moment to settle so the response reflects the outcome.
    for (
      let i = 0;
      i < 40 && this.auth.step === 'password' && !this.auth.error && !this.passwordWaiter;
      i++
    )
      await sleep(250);
    return this.auth;
  }

  async startQr(): Promise<AuthState> {
    if (!this.creds) return this.fail('credentials', new Error('API_ID_INVALID'));
    try {
      const client = await this.freshClient();
      this.qrCancelled = false;
      this.auth = { step: 'qr' };
      void client
        .signInUserWithQrCode(this.creds, {
          qrCode: async ({ token, expires }) => {
            if (this.qrCancelled) throw new Error('AUTH_USER_CANCEL');
            const url = `tg://login?token=${token.toString('base64url')}`;
            const svg = await QRCode.toString(url, {
              type: 'svg',
              margin: 1,
              errorCorrectionLevel: 'M',
            });
            this.auth = { step: 'qr', qr: { svg, expiresAt: expires * 1000 } };
            for (const l of this.listeners) l();
          },
          ...this.passwordFlowCallbacks(),
        })
        .then(() => this.afterLogin())
        .catch((err) => {
          if (!this.qrCancelled && this.auth.step !== 'done') this.fail('phone', err);
        });
      for (let i = 0; i < 30 && !this.auth.qr; i++) await sleep(200);
    } catch (err) {
      return this.fail('phone', err);
    }
    return this.auth;
  }

  async cancelAuth(): Promise<AuthState> {
    this.qrCancelled = true;
    this.passwordWaiter = null;
    if (this.state !== 'ready') {
      await this.client?.disconnect().catch(() => undefined);
      this.client = null;
    }
    this.auth = this.creds ? { step: 'phone' } : { step: 'credentials' };
    return this.auth;
  }

  private async afterLogin(): Promise<void> {
    const client = this.client!;
    writeFileSync(this.sessionFile(), encrypt(String(client.session.save()), this.key), {
      mode: 0o600,
    });
    const me = await client.getMe();
    this.userName =
      me instanceof Api.User
        ? [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || undefined
        : undefined;
    this.auth = { step: 'done' };
    // Warm the entity cache so chats can be addressed by id.
    await this.call(() => client.getDialogs({ limit: 200 })).catch(() => undefined);
    this.set('ready');
    this.startHeartbeat();
  }

  async logout(): Promise<void> {
    try {
      await this.client?.invoke(new Api.auth.LogOut());
    } catch {
      // Already logged out on the server.
    }
    await this.dropSession();
  }

  private async dropSession(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    await this.client?.disconnect().catch(() => undefined);
    this.client = null;
    this.userName = undefined;
    rmSync(this.sessionFile(), { force: true });
    this.auth = this.creds ? { step: 'phone' } : { step: 'credentials' };
    this.set(this.creds ? 'logged-out' : 'unconfigured');
  }

  // ---- resilience -------------------------------------------------------------------------

  /** Run an API call, waiting out FLOOD_WAIT and retrying transient network failures with backoff. */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    return withBackoff(fn, {
      retries: 6,
      baseMs: 1000,
      maxMs: 30_000,
      shouldRetry: (err) => {
        const flood = floodSeconds(err);
        if (flood !== null) return flood > 600 ? null : flood * 1000 + 500;
        if (isSessionDead(err)) {
          void this.dropSession();
          return null;
        }
        return isTransient(err) ? undefined : null;
      },
      onWait: (ms, err) => {
        if (floodSeconds(err) !== null) this.set('flood-wait', Date.now() + ms);
        else if (this.state === 'ready') this.set('reconnecting');
      },
    }).then((v) => {
      if (this.state === 'flood-wait' || this.state === 'reconnecting') this.set('ready');
      return v;
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const c = this.client;
      if (!c || this.state === 'logged-out') return;
      if (!c.connected && this.state === 'ready') {
        this.set('reconnecting');
        void c
          .connect()
          .then(() => this.set('ready'))
          .catch(() => undefined);
      } else if (c.connected && this.state === 'reconnecting') {
        this.set('ready');
      }
    }, 15_000);
  }

  private beginReconnect(): void {
    this.set('reconnecting');
    void (async () => {
      for (let attempt = 0; attempt < 12 && this.state === 'reconnecting'; attempt++) {
        await sleep(Math.min(60_000, 2000 * 2 ** attempt));
        try {
          await this.init();
          if (this.state !== 'reconnecting') return;
        } catch {
          // Try again on the next lap.
        }
      }
      if (this.state === 'reconnecting') this.set('error');
    })();
  }

  // ---- chats ------------------------------------------------------------------------------

  async listChats(): Promise<ChatSummary[]> {
    const client = this.client;
    if (!client || !this.ready) return [];
    const dialogs = await this.call(() => client.getDialogs({ limit: 500 }));
    const kinds = new Map(
      this.db
        .select()
        .from(schema.sources)
        .all()
        .map((s) => [s.chatId, s.kind]),
    );
    const counts = new Map(
      this.db
        .all<{ chat: string; n: number }>(
          sql`SELECT chat_id AS chat, COUNT(*) AS n FROM files GROUP BY chat_id`,
        )
        .map((r) => [r.chat, r.n]),
    );
    return dialogs
      .filter((d) => d.isChannel || d.isGroup)
      .map<ChatSummary>((d) => {
        const id = String(d.id);
        const entity = d.entity as { participantsCount?: number } | undefined;
        return {
          id,
          title: d.title || 'Untitled',
          type: d.isChannel && !d.isGroup ? 'channel' : 'group',
          members: entity?.participantsCount ?? null,
          kind: kinds.get(id) ?? null,
          indexed: counts.get(id) ?? 0,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async entity(chatId: string) {
    const client = this.client;
    if (!client) throw new Error('Not connected');
    return this.call(() => client.getInputEntity(bigInt(chatId) as never));
  }

  // ---- streaming --------------------------------------------------------------------------

  private async mediaFor(file: FileRow, refresh = false): Promise<MediaLike> {
    const hit = this.mediaCache.get(file.id);
    if (hit && !refresh && Date.now() - hit.at < 20 * 60_000) return hit.media;
    const client = this.client;
    if (!client) throw new Error('Not connected');
    const entity = await this.entity(file.chatId);
    const [msg] = await this.call(() => client.getMessages(entity, { ids: [file.messageId] }));
    if (!msg?.media) throw new Error('Message no longer has media');
    this.mediaCache.set(file.id, { media: msg.media, at: Date.now() });
    return msg.media;
  }

  async byteSource(file: FileRow): Promise<ByteSource | null> {
    if (file.localPath) return new LocalFileSource(file.localPath, file.mime);
    if (!this.ready) return null;
    const existing = this.sources.get(file.id);
    if (existing) return existing;
    const client = this.client!;
    const fetcher = async function* (
      this: TelegramManager,
      index: number,
      count: number,
      signal: AbortSignal,
    ) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const media = await this.mediaFor(file, attempt > 0);
          const iter = client.iterDownload({
            file: media,
            offset: bigInt(index * CHUNK_SIZE),
            limit: count,
            requestSize: CHUNK_SIZE,
            chunkSize: CHUNK_SIZE,
            fileSize: bigInt(file.size),
          });
          for await (const chunk of iter) {
            if (signal.aborted) return;
            yield Buffer.from(chunk);
          }
          return;
        } catch (err) {
          if (attempt === 0 && isFileReferenceExpired(err)) continue;
          if (floodSeconds(err) !== null || isTransient(err)) {
            await this.call(() => Promise.reject(err)).catch(() => undefined);
          }
          throw err;
        }
      }
    }.bind(this);
    const source = new ChunkedSource(
      `f${file.id}`,
      file.size,
      file.mime || 'video/mp4',
      fetcher,
      this.cache,
    );
    this.sources.set(file.id, source);
    if (this.sources.size > 24) this.sources.delete(this.sources.keys().next().value as number);
    return source;
  }

  fileById(id: number): FileRow | undefined {
    return this.db.select().from(files).where(eq(files.id, id)).get();
  }
}
