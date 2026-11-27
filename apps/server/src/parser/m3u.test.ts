import { describe, expect, it } from 'vitest';
import { extractStreamLinks, isHlsStream, nameFromUrl, parseM3U } from './m3u.js';

const LIST = `#EXTM3U url-tvg="http://epg.example/guide.xml"
#EXTINF:-1 tvg-id="harbor.news" tvg-logo="http://img.example/h.png" group-title="News",Harbor News
http://stream.example/harbor/index.m3u8
#EXTINF:-1 group-title="Sport",Coast Sport HD
#EXTVLCOPT:http-user-agent=X
http://stream.example/sport.ts
#EXTINF:-1,No Group
https://stream.example/plain.m3u8?token=abc
`;

describe('parseM3U', () => {
  it('reads names, logos, groups and ids', () => {
    const { channels } = parseM3U(LIST);
    expect(channels).toHaveLength(3);
    expect(channels[0]).toEqual({
      name: 'Harbor News',
      url: 'http://stream.example/harbor/index.m3u8',
      logo: 'http://img.example/h.png',
      group: 'News',
      tvgId: 'harbor.news',
    });
    expect(channels[1]).toMatchObject({ name: 'Coast Sport HD', group: 'Sport', logo: null });
    expect(channels[2]).toMatchObject({ name: 'No Group', group: '' });
  });
  it('reads the guide url from the header', () => {
    expect(parseM3U(LIST).epgUrl).toBe('http://epg.example/guide.xml');
    expect(parseM3U('#EXTM3U\nhttp://a/b.m3u8').epgUrl).toBeNull();
  });
  it('names bare URLs after their host', () => {
    const { channels } = parseM3U('#EXTM3U\nhttp://tv.example/live.m3u8');
    expect(channels[0]?.name).toBe('tv.example');
  });
  it('handles CRLF and a BOM', () => {
    const { channels } = parseM3U('﻿#EXTM3U\r\n#EXTINF:-1,One\r\nhttp://a/1.m3u8\r\n');
    expect(channels.map((c) => c.name)).toEqual(['One']);
  });
});

describe('isHlsStream', () => {
  it('tells a stream from a channel list', () => {
    expect(isHlsStream('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts')).toBe(true);
    expect(isHlsStream('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8')).toBe(true);
    expect(isHlsStream(LIST)).toBe(false);
  });
});

describe('extractStreamLinks', () => {
  it('finds stream links and a name hint', () => {
    const links = extractStreamLinks(
      '**Harbor News** live\nhttps://s.example/h/index.m3u8.\nhttps://example.com/page',
    );
    expect(links).toEqual([{ url: 'https://s.example/h/index.m3u8', name: 'Harbor News live' }]);
  });
  it('ignores messages without stream links', () => {
    expect(extractStreamLinks('see https://example.com/watch')).toEqual([]);
  });
});

describe('nameFromUrl', () => {
  it('uses the file name unless it is generic', () => {
    expect(nameFromUrl('http://a.example/streams/coast_radio.m3u8')).toBe('coast radio');
    expect(nameFromUrl('http://a.example/live/index.m3u8')).toBe('a.example');
  });
});
