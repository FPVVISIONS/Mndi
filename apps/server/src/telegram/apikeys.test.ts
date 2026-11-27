import { describe, expect, it } from 'vitest';
import { KeysError, TelegramKeysClient, parseApps, parseCreateHash } from './apikeys.js';

const APPS_PAGE = `
<form class="form-horizontal" id="app_edit_form">
<div class="form-group">
  <label for="app_id" class="col-md-4 text-right control-label">App api_id:</label>
  <div class="col-md-7">
    <span class="form-control input-xlarge uneditable-input" onclick="this.select();"><strong>2471139</strong></span>
  </div>
</div>
<div class="form-group">
  <label for="app_hash" class="col-md-4 text-right control-label">App api_hash:</label>
  <div class="col-md-7">
    <span class="form-control input-xlarge uneditable-input" onclick="this.select();">0F1E2D3C4B5A69788796a5b4c3d2e1f0</span>
  </div>
</div>
</form>`;

const CREATE_PAGE = `
<form class="form-horizontal" id="app_create_form">
  <input type="hidden" name="hash" value="9f8e7d6c5b4a" />
  <input type="text" class="form-control" id="app_title" name="app_title" value="" />
</form>`;

function res(body: string, cookies: string[] = []): Response {
  const headers = new Headers();
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(body, { status: 200, headers });
}

describe('my.telegram.org parsing', () => {
  it('reads existing keys', () => {
    expect(parseApps(APPS_PAGE)).toEqual({
      apiId: 2471139,
      apiHash: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
    });
  });

  it('returns null when no app exists and finds the create token', () => {
    expect(parseApps(CREATE_PAGE)).toBeNull();
    expect(parseCreateHash(CREATE_PAGE)).toBe('9f8e7d6c5b4a');
  });
});

describe('TelegramKeysClient', () => {
  it('signs in, creates an app when none exists, and returns its keys', async () => {
    const calls: { url: string; body?: string; cookie?: string }[] = [];
    let created = false;
    const fake = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, body: init.body as string | undefined, cookie: headers.cookie });
      if (url.endsWith('/auth/send_password')) return res('{"random_hash":"abc123"}');
      if (url.endsWith('/auth/login'))
        return res('true', ['stel_token=tok; path=/; secure; HttpOnly']);
      if (url.endsWith('/apps/create')) {
        created = true;
        return res('');
      }
      if (url.endsWith('/apps')) return res(created ? APPS_PAGE : CREATE_PAGE);
      throw new Error('unexpected ' + url);
    }) as unknown as typeof fetch;

    const client = new TelegramKeysClient(fake);
    await client.sendCode('+15550001111');
    const keys = await client.getKeys(' Xy7AbC12dEf ');
    expect(keys.apiId).toBe(2471139);

    const login = calls.find((c) => c.url.endsWith('/auth/login'))!;
    expect(login.body).toContain('random_hash=abc123');
    expect(login.body).toContain('password=Xy7AbC12dEf');
    const create = calls.find((c) => c.url.endsWith('/apps/create'))!;
    expect(create.cookie).toContain('stel_token=tok');
    expect(create.body).toContain('hash=9f8e7d6c5b4a');
    expect(create.body).toMatch(/app_shortname=mq[a-z]{3}\d{5}/);
  });

  it('reports a wrong code and rate limiting', async () => {
    const wrong = (async (url: string) =>
      url.endsWith('/auth/send_password')
        ? res('{"random_hash":"h"}')
        : res('Invalid confirmation code!')) as unknown as typeof fetch;
    const c = new TelegramKeysClient(wrong);
    await c.sendCode('+15550001111');
    await expect(c.getKeys('nope')).rejects.toMatchObject({ reason: 'code_invalid' });

    const limited = (async () =>
      res('Sorry, too many tries. Please try again later.')) as unknown as typeof fetch;
    await expect(new TelegramKeysClient(limited).sendCode('+1555')).rejects.toBeInstanceOf(
      KeysError,
    );
  });
});
