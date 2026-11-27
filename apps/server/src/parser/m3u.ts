export interface ParsedChannel {
  name: string;
  url: string;
  logo: string | null;
  group: string;
  tvgId: string | null;
}

export interface ParsedPlaylist {
  channels: ParsedChannel[];
  epgUrl: string | null;
}

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/([A-Za-z0-9_-]+)="([^"]*)"/g))
    out[(m[1] ?? '').toLowerCase()] = m[2] ?? '';
  return out;
}

/** True for a single HLS stream (media or master playlist), false for a channel list. */
export function isHlsStream(text: string): boolean {
  return /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|VERSION)/.test(text);
}

export function parseM3U(text: string): ParsedPlaylist {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);
  const header = lines.find((l) => l.startsWith('#EXTM3U')) ?? '';
  const headerAttrs = attrs(header);
  const channels: ParsedChannel[] = [];
  let pending: { name: string; logo: string | null; group: string; tvgId: string | null } | null =
    null;
  let groupFallback = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const comma = line.lastIndexOf(',');
      const a = attrs(line);
      const title = comma >= 0 ? line.slice(comma + 1).trim() : '';
      pending = {
        name: title || a['tvg-name'] || 'Channel',
        logo: a['tvg-logo'] || null,
        group: a['group-title'] || groupFallback,
        tvgId: a['tvg-id'] || null,
      };
    } else if (line.startsWith('#EXTGRP:')) {
      groupFallback = line.slice(8).trim();
      if (pending && !pending.group) pending.group = groupFallback;
    } else if (!line.startsWith('#')) {
      if (/^https?:\/\//i.test(line)) {
        channels.push({
          name:
            pending?.name ?? line.replace(/^https?:\/\/(www\.)?/, '').split(/[/?]/)[0] ?? 'Channel',
          url: line,
          logo: pending?.logo ?? null,
          group: pending?.group ?? '',
          tvgId: pending?.tvgId ?? null,
        });
      }
      pending = null;
    }
  }
  return { channels, epgUrl: headerAttrs['url-tvg'] || headerAttrs['x-tvg-url'] || null };
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const STREAM_EXT = /\.(m3u8?|mpd|ts|mp4|webm)(\?|$)/i;

/** Pull stream-looking links out of a message, with the first line of text as a name hint. */
export function extractStreamLinks(text: string): { url: string; name: string }[] {
  const urls = [...text.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;]+$/, ''));
  const hint =
    text
      .split('\n')
      .map((l) =>
        l
          .replace(URL_RE, '')
          .replace(/[*_`#>:\-–]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .find((l) => l.length > 1) ?? '';
  return urls.filter((u) => STREAM_EXT.test(u)).map((url) => ({ url, name: hint }));
}

/** Names a channel from its URL when nothing better exists. */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
    const base = last
      .replace(/\.(m3u8?|ts|mp4|webm)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    return base && !/^(index|playlist|master|stream|live|chunklist)$/i.test(base)
      ? base
      : u.hostname;
  } catch {
    return 'Channel';
  }
}
