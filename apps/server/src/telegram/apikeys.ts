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
  constructor(readonly reason: KeysErrorReason) {
    super(`my.telegram.org: ${reason}`);
  }
}

export interface ApiKeys {
  apiId: number;
  apiHash: string;
}

/** Reads api_id and api_hash from the /apps page, or null when no app exists yet. */
export function parseApps(html: string): ApiKeys | null {
  const id = /api_id[\s\S]{0,400}?<strong>\s*(\d{3,12})\s*<\/strong>/i.exec(html);
  const hash = /api_hash[\s\S]{0,400}?>\s*([a-f0-9]{32})\s*</i.exec(html);
  if (!id || !hash) return null;
  return { apiId: Number(id[1]), apiHash: hash[1]!.toLowerCase() };
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

  /** Signs in with the code, then returns existing keys or creates an app and returns its keys. */
  async getKeys(code: string): Promise<ApiKeys> {
    if (!this.randomHash) throw new KeysError('code_invalid');
    const text = await this.request('/auth/login', {
      phone: this.phone,
      random_hash: this.randomHash,
      password: code.trim(),
    });
    if (/too many tries/i.test(text)) throw new KeysError('too_many_tries');
    if (text.trim() !== 'true' && !this.jar.has('stel_token')) throw new KeysError('code_invalid');

    let page = await this.request('/apps');
    const existing = parseApps(page);
    if (existing) return existing;

    const hash = parseCreateHash(page);
    if (!hash) throw new KeysError('create_failed');
    // Short names must be unique across Telegram, so add digits. Telegram may also refuse a title
    // it has seen too often; try a couple of variants before giving up.
    for (let attempt = 0; attempt < 3; attempt++) {
      const suffix = String(Math.floor(100000 + Math.random() * 899999));
      await this.request('/apps/create', {
        hash,
        app_title: attempt === 0 ? 'Marquee' : `Marquee ${suffix.slice(0, 3)}`,
        app_shortname: `marquee${suffix}`,
        app_url: '',
        app_platform: 'android',
        app_desc: 'Personal media library',
      });
      page = await this.request('/apps');
      const created = parseApps(page);
      if (created) return created;
    }
    throw new KeysError('create_failed');
  }
}
