import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import {
  extractStreamLinks,
  isHlsStream,
  nameFromUrl,
  parseM3U,
  type ParsedChannel,
} from '../parser/m3u.js';
import { fetchXmltv, parseXmltv } from './epg.js';
import { replaceEpg } from './channels.js';

const { channels } = schema;

function isBlockedAddress(ip: string): boolean {
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:')) return true;
  const m = /^(?:::ffff:)?(\d+)\.(\d+)\./.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 0 || (a === 169 && b === 254);
}

/** Refuse loopback and link-local targets. LAN addresses are allowed because IPTV boxes live there. */
export async function assertPublicEnough(url: URL): Promise<void> {
  if (!/^https?:$/.test(url.protocol)) throw new Error('Unsupported protocol');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addrs.some(isBlockedAddress)) throw new Error('Blocked address');
}

export class LiveService {
  constructor(
    private readonly db: Db,
    private readonly secret: Buffer,
  ) {}

  /** Signature that marks a URL as one this server produced, so the proxy is never an open relay. */
  sign(url: string): string {
    return createHmac('sha256', this.secret).update(url).digest('base64url').slice(0, 22);
  }

  verify(url: string, sig: string): boolean {
    const expected = Buffer.from(this.sign(url));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  proxyUrl(url: string): string {
    return `/api/live/proxy?u=${Buffer.from(url).toString('base64url')}&s=${this.sign(url)}`;
  }

  private upsert(sourceId: string, list: ParsedChannel[]): number {
    const now = Math.floor(Date.now() / 1000);
    let added = 0;
    for (const c of list) {
      const key = createHash('sha1').update(c.url).digest('hex');
      const res = this.db
        .insert(channels)
        .values({
          sourceId,
          key,
          name: c.name.slice(0, 120),
          logo: c.logo,
          grp: c.group.slice(0, 80),
          url: c.url,
          tvgId: c.tvgId,
          addedAt: now,
        })
        .onConflictDoUpdate({
          target: channels.key,
          set: {
            name: c.name.slice(0, 120),
            logo: c.logo,
            grp: c.group.slice(0, 80),
            tvgId: c.tvgId,
          },
        })
        .run();
      added += res.changes;
    }
    return added;
  }

  async ingestPlaylist(sourceId: string, text: string): Promise<number> {
    const parsed = parseM3U(text);
    const n = this.upsert(sourceId, parsed.channels);
    if (parsed.epgUrl) void this.refreshEpg(parsed.epgUrl).catch(() => undefined);
    return n;
  }

  /** Handle a link posted in a chat: a single stream, or a playlist that expands to many channels. */
  async ingestLink(sourceId: string, url: string, nameHint: string): Promise<number> {
    if (/\.m3u8?(\?|$)/i.test(url)) {
      try {
        await assertPublicEnough(new URL(url));
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const text = (await res.text()).slice(0, 5 * 1024 * 1024);
        if (res.ok && text.includes('#EXTM3U') && !isHlsStream(text))
          return this.ingestPlaylist(sourceId, text);
      } catch {
        // Unreachable right now: keep it as a single channel and let playback report the problem.
      }
    }
    return this.upsert(sourceId, [
      { name: nameHint || nameFromUrl(url), url, logo: null, group: '', tvgId: null },
    ]);
  }

  async ingestMessageText(sourceId: string, text: string): Promise<number> {
    let n = 0;
    for (const link of extractStreamLinks(text))
      n += await this.ingestLink(sourceId, link.url, link.name);
    return n;
  }

  async refreshEpg(url: string): Promise<void> {
    const rows = this.db.select().from(channels).all();
    const wanted = new Set(rows.map((r) => r.tvgId).filter((v): v is string => Boolean(v)));
    if (!wanted.size) return;
    const now = Math.floor(Date.now() / 1000);
    const xml = await fetchXmltv(url);
    replaceEpg(this.db, parseXmltv(xml, wanted, now - 3600, now + 36 * 3600));
  }

  channel(id: number) {
    return this.db.select().from(channels).where(eq(channels.id, id)).get();
  }
}
