import { describe, expect, it } from 'vitest';
import { parseXmltv } from './epg.js';

const XML = `<tv>
<programme start="20250101180000 +0200" stop="20250101190000 +0200" channel="a.news"><title lang="en">Evening &amp; News</title></programme>
<programme start="20250101190000 +0200" stop="20250101200000 +0200" channel="a.news"><title>Weather</title></programme>
<programme start="20250101180000 +0000" stop="20250101190000 +0000" channel="other"><title>Skipped</title></programme>
</tv>`;

describe('parseXmltv', () => {
  const from = Date.UTC(2025, 0, 1, 0) / 1000;
  const to = Date.UTC(2025, 0, 2, 0) / 1000;
  it('keeps wanted channels, applies the zone offset and decodes entities', () => {
    const p = parseXmltv(XML, new Set(['a.news']), from, to);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ title: 'Evening & News', start: Date.UTC(2025, 0, 1, 16) / 1000 });
  });
  it('drops programmes outside the window', () => {
    const p = parseXmltv(XML, new Set(['a.news']), to, to + 3600);
    expect(p).toHaveLength(0);
  });
});
