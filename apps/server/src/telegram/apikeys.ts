/**
 * Creates (or reads) the person's own Telegram API keys on my.telegram.org, so sign-in needs only a
 * phone number. my.telegram.org signs in with the phone number too: it sends a one-time code to the
 * Telegram app, and with that code we can open "API development tools", read the api_id and api_hash
 * if an app already exists, or create one.
 *
 * Nothing here is stored except the resulting keys, which the caller encrypts.
 */

const BASE = 'https://my.telegram.org';
const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export type KeysErrorReason =
  'phone_invalid' | 'code_invalid' | 'too_many_tries' | 'network' | 'create_failed';

export class KeysError extends Error {
  constructor(
    readonly reason: KeysErrorReason,
    /** A short, secret-free note on what Telegram answered, shown to the person for support. */
    readonly detail?: string,
  ) {
    super(`my.telegram.org: ${reason}${detail ? ` (${detail})` : ''}`);
  }
}

/** First words of a page or answer, without markup or anything that looks like a token. */
export function snippet(text: string): string {
  const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1];
  const plain = (title ?? text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[a-f0-9]{16,}/gi, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 80 ? `${plain.slice(0, 80)}…` : plain || '(empty)';
}

export interface ApiKeys {
  apiId: number;
  apiHash: string;
}

/** The page as plain text: tags removed, and the values of inputs kept as text. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<input[^>]*value=["']([^"']*)["'][^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reads api_id and api_hash from the /apps page, or null when no app exists yet. */
export function parseApps(html: string): ApiKeys | null {
  const text = pageText(html);
  const id = /api[_ ]?id:?\s*(\d{4,12})\b/i.exec(text);
  const hash = /api[_ ]?hash:?\s*([a-f0-9]{32})\b/i.exec(text);
  if (!id || !hash) return null;
  return { apiId: Number(id[1]), apiHash: hash[1]!.toLowerCase() };
}

/** What the page says around "api_id", with every number and key hidden, for error messages. */
export function maskedPage(html: string): string {
  const text = pageText(html);
  const at = Math.max(0, text.search(/api[_ ]?id/i));
  return text
    .slice(Math.max(0, at - 30), at + 170)
    .replace(/[0-9a-f]{8,}/gi, '#')
    .replace(/\d/g, '#');
}

/** The hidden form token the create-app form needs. */
export function parseCreateHash(html: string): string | null {
  const m =
    /name=["']hash["'][^>]*value=["']([^"']+)["']/i.exec(html) ??
    /value=["']([^"']+)["'][^>]*name=["']hash["']/i.exec(html);
  return m ? m[1]! : null;
}

/** Keeps cookies across requests (my.telegram.org uses stel_token and stel_ssid). */
class Jar {
  private readonly cookies = new Map<string, string>();

  take(res: Response): void {
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const list =
      typeof h.getSetCookie === 'function'
        ? h.getSetCookie()
        : (h.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    for (const line of list) {
      const pair = line.split(';')[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (value === '' || value === 'deleted') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

export class TelegramKeysClient {
  private readonly jar = new Jar();
  private phone = '';
  private randomHash = '';
  private loggedIn = false;
  private lastStatus = 0;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  private async request(path: string, form?: Record<string, string>): Promise<string> {
    const headers: Record<string, string> = {
      'user-agent': UA,
      accept: form ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,*/*',
      origin: BASE,
      referer: `${BASE}/${path.startsWith('/apps') ? 'apps' : 'auth'}`,
    };
    const cookie = this.jar.header();
    if (cookie) headers.cookie = cookie;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['x-requested-with'] = 'XMLHttpRequest';
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(BASE + path, {
        method: form ? 'POST' : 'GET',
        headers,
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: ctrl.signal,
        redirect: 'follow',
      });
      this.jar.take(res);
      this.lastStatus = res.status;
      const text = await res.text();
      if (res.status >= 500) throw new KeysError('network');
      return text;
    } catch (err) {
      if (err instanceof KeysError) throw err;
      throw new KeysError('network');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks my.telegram.org to send its one-time code to the person's Telegram app. */
  async sendCode(phone: string): Promise<void> {
    const text = await this.request('/auth/send_password', { phone });
    if (/too many tries/i.test(text)) throw new KeysError('too_many_tries');
    let hash: string | undefined;
    try {
      hash = (JSON.parse(text) as { random_hash?: string }).random_hash;
    } catch {
      hash = undefined;
    }
    if (!hash) throw new KeysError(/invalid|phone/i.test(text) ? 'phone_invalid' : 'network');
    this.phone = phone;
    this.randomHash = hash;
  }

  /** True once the code was accepted, so a failed key step can be retried without a new code. */
  get signedIn(): boolean {
    return this.loggedIn;
  }

  /** Signs in with the code, then returns existing keys or creates an app and returns its keys. */
  async getKeys(code: string): Promise<ApiKeys> {
    if (!this.loggedIn) {
      if (!this.randomHash) throw new KeysError('code_invalid');
      const text = await this.request('/auth/login', {
        phone: this.phone,
        random_hash: this.randomHash,
        password: code.trim(),
      });
      if (/too many tries/i.test(text)) throw new KeysError('too_many_tries');
      if (text.trim() !== 'true' && !this.jar.has('stel_token'))
        throw new KeysError('code_invalid', snippet(text));
      this.loggedIn = true;
    }

    let page = await this.request('/apps');
    const existing = parseApps(page);
    if (existing) return existing;

    const hash = parseCreateHash(page);
    if (!hash) {
      const where = /send_password|auth\/login|id="my_login/i.test(page)
        ? 'sign-in page'
        : snippet(page);
      // The sign-in did not stick (no cookie): the next attempt needs a new code.
      if (where === 'sign-in page') this.loggedIn = false;
      throw new KeysError(
        'create_failed',
        `apps ${this.lastStatus}, ${where}, cookie ${this.jar.has('stel_token') ? 'yes' : 'no'}`,
      );
    }

    // Short names must be unique across Telegram, so add digits. Telegram sometimes answers
    // "ERROR" to a title, platform or empty URL it dislikes; try a few variants before giving up.
    const variants = [
      { title: 'Marquee', platform: 'android', url: '' },
      { title: 'Marquee Player', platform: 'other', url: '' },
      { title: 'My Media Library', platform: 'desktop', url: 'https://github.com' },
      { title: 'Home Library', platform: 'android', url: 'https://github.com' },
    ];
    let answer = '';
    for (const v of variants) {
      const digits = String(Math.floor(10000 + Math.random() * 89999));
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      const tail = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join(
        '',
      );
      answer = await this.request('/apps/create', {
        hash: parseCreateHash(page) ?? hash,
        app_title: v.title,
        app_shortname: `mq${tail}${digits}`,
        app_url: v.url,
        app_platform: v.platform,
        app_desc: '',
      });
      page = await this.request('/apps');
      const created = parseApps(page);
      if (created) return created;
    }
    throw new KeysError(
      'create_failed',
      `create said: ${snippet(answer)} | page: ${maskedPage(page)}`,
    );
  }
}
