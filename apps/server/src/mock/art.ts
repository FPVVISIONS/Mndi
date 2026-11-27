import { languageInfo } from '@marquee/shared';
import { findMockBySlug, type MockTitle } from './catalog.js';

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Palette = MockTitle['palette'];

function motifShapes(t: MockTitle, w: number, h: number): string {
  const r = rng(t.slug);
  const { mid, accent, bg } = t.palette;
  const out: string[] = [];
  const horizon = h * (0.55 + r() * 0.1);
  switch (t.motif) {
    case 'sun': {
      const rad = Math.min(w, h) * (0.2 + r() * 0.08);
      out.push(
        `<circle cx="${w * (0.4 + r() * 0.2)}" cy="${horizon - rad * 0.4}" r="${rad}" fill="${accent}"/>`,
      );
      for (let i = 0; i < 6; i++) {
        const y = horizon + i * (h - horizon) * 0.17;
        out.push(
          `<rect x="0" y="${y}" width="${w}" height="${(h - horizon) * 0.1}" fill="${i % 2 ? bg : mid}" opacity="${0.95 - i * 0.08}"/>`,
        );
      }
      out.push(`<rect x="0" y="${horizon}" width="${w}" height="${h * 0.012}" fill="${bg}"/>`);
      break;
    }
    case 'rows': {
      const rows = 7;
      for (let i = 0; i < rows; i++) {
        const y = horizon * 0.5 + i * ((h - horizon * 0.5) / rows);
        const rad = 8 + i * (w / 55);
        const gap = rad * 3.2;
        for (let x = (i % 2) * gap * 0.5; x < w + gap; x += gap) {
          out.push(
            `<circle cx="${x}" cy="${y}" r="${rad}" fill="${i % 3 === 0 ? accent : mid}" opacity="${0.45 + i * 0.08}"/>`,
          );
        }
      }
      break;
    }
    case 'skyline': {
      let x = -10;
      while (x < w) {
        const bw = w * (0.05 + r() * 0.09);
        const bh = h * (0.18 + r() * 0.42);
        out.push(`<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" fill="${mid}"/>`);
        for (let wy = h - bh + 14; wy < h - 14; wy += 22) {
          for (let wx = x + 8; wx < x + bw - 10; wx += 16) {
            if (r() > 0.55)
              out.push(
                `<rect x="${wx}" y="${wy}" width="6" height="9" fill="${accent}" opacity="${0.5 + r() * 0.5}"/>`,
              );
          }
        }
        x += bw + w * 0.008;
      }
      break;
    }
    case 'doors': {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const inset = i * Math.min(w, h) * 0.075;
        out.push(
          `<rect x="${w * 0.2 + inset}" y="${h * 0.12 + inset * 1.2}" width="${w * 0.6 - inset * 2}" height="${h * 0.72 - inset * 2.4}" fill="${i % 2 ? bg : mid}" stroke="${accent}" stroke-width="${i === n - 1 ? 0 : 2}" opacity="${0.55 + i * 0.1}"/>`,
        );
      }
      out.push(
        `<rect x="${w * 0.46}" y="${h * 0.5}" width="${w * 0.08}" height="${h * 0.34}" fill="${accent}"/>`,
      );
      break;
    }
    case 'rings': {
      const cx = w * (0.5 + (r() - 0.5) * 0.2);
      const cy = h * 0.4;
      for (let i = 9; i >= 1; i--) {
        out.push(
          `<circle cx="${cx}" cy="${cy}" r="${i * Math.min(w, h) * 0.075}" fill="none" stroke="${i % 3 === 0 ? accent : mid}" stroke-width="${i % 3 === 0 ? 3 : 10}" opacity="${0.9 - i * 0.07}"/>`,
        );
      }
      out.push(`<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.03}" fill="${accent}"/>`);
      break;
    }
    case 'slabs': {
      for (let i = 0; i < 6; i++) {
        const x0 = r() * w;
        const sw = w * (0.18 + r() * 0.3);
        out.push(
          `<polygon points="${x0},${h} ${x0 + sw * 0.4},${h * (0.2 + r() * 0.4)} ${x0 + sw},${h}" fill="${i % 2 ? mid : bg}" opacity="${0.55 + r() * 0.4}"/>`,
        );
      }
      out.push(
        `<circle cx="${w * 0.7}" cy="${h * 0.28}" r="${Math.min(w, h) * 0.1}" fill="${accent}"/>`,
      );
      break;
    }
    case 'moons': {
      for (let i = 0; i < 4; i++) {
        const rad = Math.min(w, h) * (0.1 + r() * 0.13);
        out.push(
          `<circle cx="${w * (0.15 + r() * 0.7)}" cy="${h * (0.12 + r() * 0.5)}" r="${rad}" fill="${i === 0 ? accent : mid}"/>`,
        );
      }
      out.push(
        `<path d="M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.6} ${w * 0.55} ${h * 0.75} T ${w} ${h * 0.7} V ${h} H0Z" fill="${mid}"/>`,
      );
      out.push(
        `<path d="M0 ${h * 0.84} Q ${w * 0.4} ${h * 0.74} ${w} ${h * 0.86} V ${h} H0Z" fill="${bg}"/>`,
      );
      break;
    }
  }
  return out.join('');
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function textBlock(
  lines: string[],
  x: number,
  y: number,
  size: number,
  fill: string,
  rtl: boolean,
  anchor = 'middle',
) {
  const dir = rtl ? ' direction="rtl"' : '';
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * size * 1.05}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="'Instrument Serif', Georgia, 'Times New Roman', serif" font-weight="400"${dir}>${esc(l)}</text>`,
    )
    .join('');
}

export function renderArt(
  slug: string,
  kind: 'poster' | 'backdrop' | 'logo',
  lang: string,
): string | null {
  const t = findMockBySlug(slug);
  if (!t) return null;
  const info = languageInfo(lang);
  const title = t.title[info.code] ?? t.title.en;
  const p: Palette = t.palette;
  const head = (w: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;

  if (kind === 'backdrop') {
    const w = 1280;
    const h = 720;
    return `${head(w, h)}<rect width="${w}" height="${h}" fill="${p.bg}"/>${motifShapes(t, w, h)}</svg>`;
  }
  if (kind === 'logo') {
    const lines = wrap(title, 16);
    const longest = Math.max(...lines.map((l) => l.length));
    // Scale the type to the longest line so no title is ever clipped by the canvas.
    const size = Math.min(lines.length > 1 ? 120 : 150, Math.floor(860 / (longest * 0.54)));
    const h = 60 + lines.length * size * 1.05;
    // Logos hug the reading-direction edge so they line up with the text beside them.
    // SVG text-anchor is direction-aware: in RTL, "start" is the right edge.
    return `${head(900, h)}${textBlock(lines, info.rtl ? 900 : 0, size + 10, size, '#F2F0EC', info.rtl, 'start')}</svg>`;
  }
  const w = 500;
  const h = 750;
  const lines = wrap(title, 12);
  const size = lines.length > 2 ? 58 : 70;
  const base = h - 58 - (lines.length - 1) * size * 1.05;
  return `${head(w, h)}<rect width="${w}" height="${h}" fill="${p.bg}"/>${motifShapes(t, w, h * 0.78)}<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg}" stop-opacity="0"/><stop offset="0.55" stop-color="${p.bg}" stop-opacity="0.92"/><stop offset="1" stop-color="${p.bg}"/></linearGradient></defs><rect y="${h * 0.5}" width="${w}" height="${h * 0.5}" fill="url(#f)"/>${textBlock(lines, w / 2, base, size, '#F2F0EC', info.rtl)}<rect x="${w / 2 - 18}" y="${h - 34}" width="36" height="3" fill="${p.accent}"/></svg>`;
}

/** Dominant colour for a mock image path such as `mock/long-harbour/poster/he`. */
export function mockColor(path: string): string | null {
  const slug = path.split('/')[1];
  const t = slug ? findMockBySlug(slug) : undefined;
  return t ? t.palette.mid : null;
}
