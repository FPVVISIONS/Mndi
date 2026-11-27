import { gunzipSync } from 'node:zlib';

export interface EpgProgramme {
  channel: string;
  start: number;
  stop: number;
  title: string;
}

function parseXmltvTime(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(s);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se, tz = '+0000'] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  const sign = tz.startsWith('-') ? -1 : 1;
  const offset = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5))) * 60_000;
  return Math.floor((utc - offset) / 1000);
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");

/**
 * Minimal XMLTV reader. It keeps only programmes for wanted channel ids inside the window,
 * so a very large guide file never turns into a very large table.
 */
export function parseXmltv(
  xml: string,
  wanted: Set<string>,
  fromSec: number,
  toSec: number,
): EpgProgramme[] {
  const out: EpgProgramme[] = [];
  const re = /<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1] ?? '';
    const channel = /channel="([^"]*)"/.exec(attrs)?.[1];
    if (!channel || !wanted.has(channel)) continue;
    const start = parseXmltvTime(/start="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const stop = parseXmltvTime(/stop="([^"]*)"/.exec(attrs)?.[1] ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < fromSec || start > toSec)
      continue;
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2] ?? '')?.[1];
    if (title) out.push({ channel, start, stop, title: decode(title.trim()) });
  }
  return out;
}

export async function fetchXmltv(url: string, maxBytes = 80 * 1024 * 1024): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Guide responded ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('Guide file is too large');
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? gunzipSync(buf) : buf).toString('utf8');
}
