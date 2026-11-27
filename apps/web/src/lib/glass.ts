import { useEffect, useRef } from 'react';

/*
 * Liquid glass, the parts CSS cannot do alone.
 *
 * 1. Light. One light direction is shared by every glass surface, so rims and sheens agree. It
 *    follows the pointer on desktop and the phone's tilt on mobile, eased so it glides.
 * 2. Refraction. Each glass element gets an SVG displacement filter shaped to its own size and
 *    corner radius: the backdrop is bent near the rim, like light through the edge of a lens.
 *    Chromium (Chrome, Edge, Android WebView) supports SVG filters in backdrop-filter; elsewhere
 *    the element keeps the plain blur from CSS.
 */

const root = () => document.documentElement;

// ---- light --------------------------------------------------------------------------------

let lightStarted = false;

export function startGlassLight(): void {
  if (lightStarted || typeof window === 'undefined') return;
  lightStarted = true;
  let tx = 0.3;
  let ty = 0.1;
  let x = tx;
  let y = ty;
  let frame = 0;

  const tick = () => {
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    const angle = 90 + (Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI;
    const s = root().style;
    s.setProperty('--glass-angle', `${angle.toFixed(1)}deg`);
    s.setProperty('--glass-x', `${(x * 100).toFixed(1)}%`);
    s.setProperty('--glass-y', `${(y * 100).toFixed(1)}%`);
    frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
  };
  const aim = (nx: number, ny: number) => {
    tx = Math.min(1, Math.max(0, nx));
    ty = Math.min(1, Math.max(0, ny));
    if (!frame) frame = requestAnimationFrame(tick);
  };

  window.addEventListener(
    'pointermove',
    (e) => aim(e.clientX / window.innerWidth, e.clientY / window.innerHeight),
    { passive: true },
  );
  // Tilt: gamma is left/right (-90..90), beta is front/back (-180..180, ~45 when held).
  window.addEventListener(
    'deviceorientation',
    (e) => {
      if (e.gamma === null || e.beta === null) return;
      aim(0.5 + e.gamma / 60, 0.5 + (e.beta - 45) / 60);
    },
    { passive: true },
  );
  tick();
}

// ---- refraction ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
let defs: SVGDefsElement | null = null;
let counter = 0;

function supported(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  if (root().dataset.reduceMotion === 'true' || root().dataset.lite === 'true') return false;
  // SVG filters inside backdrop-filter render only in Chromium-based engines.
  const ua = navigator.userAgent;
  return /Chrome\/|Chromium\//.test(ua) && !/Firefox\//.test(ua);
}

function ensureDefs(): SVGDefsElement {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

const mapCache = new Map<string, string>();

/**
 * A displacement map for a rounded rectangle: neutral grey inside, and within `bezel` pixels of
 * the edge, red/green encode a pull toward the centre that grows toward the rim.
 */
function displacementMap(w: number, h: number, radius: number, bezel: number): string {
  const key = `${w}x${h}r${radius}b${bezel}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  // Draw at reduced resolution for big surfaces; the filter scales it up smoothly.
  const k = Math.min(1, 320 / Math.max(w, h));
  const cw = Math.max(2, Math.round(w * k));
  const ch = Math.max(2, Math.round(h * k));
  const r = Math.min(radius, w / 2, h / 2) * k;
  const b = Math.max(1, bezel * k);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  const hx = cw / 2;
  const hy = ch / 2;
  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const ox = px + 0.5 - hx;
      const oy = py + 0.5 - hy;
      const qx = Math.abs(ox) - (hx - r);
      const qy = Math.abs(oy) - (hy - r);
      let nx: number;
      let ny: number;
      let dist: number; // distance inside the edge
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        nx = qx / len;
        ny = qy / len;
        dist = r - len;
      } else if (qx > qy) {
        nx = 1;
        ny = 0;
        dist = r - qx;
      } else {
        nx = 0;
        ny = 1;
        dist = r - qy;
      }
      let dx = 0;
      let dy = 0;
      if (dist < b) {
        const t = 1 - Math.max(0, dist) / b;
        const mag = t * t * (3 - 2 * t);
        // Sample from nearer the centre: the rim magnifies and bends what is under it.
        dx = -Math.sign(ox) * nx * mag;
        dy = -Math.sign(oy) * ny * mag;
      }
      const i = (py * cw + px) * 4;
      img.data[i] = Math.round(128 + dx * 127);
      img.data[i + 1] = Math.round(128 + dy * 127);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  if (mapCache.size > 40) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

interface Options {
  /** Displacement strength in pixels at the very rim. Defaults to a share of the height. */
  strength?: number;
  /** Width of the bending band along the edge, in pixels. */
  bezel?: number;
}

/**
 * Attach to any element that has the `glass` class to add real refraction. Returns a ref.
 * Works with motion components too (they forward refs).
 */
export function useLiquidGlass<T extends HTMLElement>(options: Options = {}) {
  const ref = useRef<T>(null);
  const { strength, bezel } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || !supported()) return;
    const id = `lg-${++counter}`;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const image = document.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'map');
    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'map');
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');
    filter.append(image, disp);
    ensureDefs().appendChild(filter);

    let last = '';
    const update = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (w < 8 || h < 8 || w * h > 900_000) {
        el.style.removeProperty('backdrop-filter');
        return;
      }
      const cs = getComputedStyle(el);
      const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
      const band = bezel ?? Math.max(6, Math.min(22, Math.min(w, h) * 0.32));
      const key = `${w}x${h}:${radius}:${band}`;
      if (key === last) return;
      last = key;
      for (const node of [filter, image]) {
        node.setAttribute('x', '0');
        node.setAttribute('y', '0');
        node.setAttribute('width', String(w));
        node.setAttribute('height', String(h));
      }
      const url = displacementMap(w, h, radius, band);
      image.setAttribute('href', url);
      image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
      disp.setAttribute('scale', String(strength ?? Math.min(48, Math.max(14, h * 0.45))));
      const blur = cs.getPropertyValue('--glass-blur').trim() || '14px';
      const value = `url(#${id}) blur(${blur}) saturate(190%) brightness(1.08)`;
      el.style.setProperty('backdrop-filter', value);
      el.style.setProperty('-webkit-backdrop-filter', value);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      filter.remove();
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
    };
  }, [strength, bezel]);

  return ref;
}
