// Screenshot helper for visual checks. Usage:
//   node scripts/shot.mjs <name> <path> [--lang he] [--w 1440] [--h 900] [--wait 1800] [--full] [--profile 1]
//        [--click "text=Play"] [--scroll 600] [--base http://127.0.0.1:5173]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const [name, path = '/'] = args;
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const lang = opt('lang', 'en');
const w = Number(opt('w', 1440));
const h = Number(opt('h', 900));
const base = opt('base', 'http://127.0.0.1:5173');
const phone = w < 600;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({
  viewport: { width: w, height: h },
  deviceScaleFactor: opt('dpr', phone ? 2 : 1),
  hasTouch: phone,
  isMobile: phone,
  locale: lang,
});
await ctx.addInitScript(
  ([l, profile]) => {
    localStorage.setItem(
      'marquee.prefs',
      JSON.stringify({
        state: {
          language: l,
          audio: 'original',
          subtitles: 'auto',
          quality: 'best',
          autoplayNext: true,
          heroPreview: false,
          skipIntro: false,
          recentSearches: ['salt line', 'night'],
        },
        version: 1,
      }),
    );
    if (profile)
      localStorage.setItem(
        'marquee.profile',
        JSON.stringify({ state: { profileId: Number(profile) }, version: 1 }),
      );
  },
  [lang, opt('profile', '1')],
);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const direct = args.includes('--direct');
await page.goto(base + (direct ? path : '/'), { waitUntil: 'load' });
await page.waitForTimeout(600);
if (direct) {
  const tile = page.getByRole('button', { name: 'Mira' });
  if (await tile.count()) await tile.first().click();
  await page.waitForTimeout(1400);
}
if (!direct && path !== '/profiles') {
  // Pass the "who's watching" gate, then route client-side so in-memory state survives.
  const tile = page.getByRole('button', { name: 'Mira' });
  if (await tile.count()) await tile.first().click();
  await page.waitForTimeout(700);
  if (path !== '/') {
    await page.evaluate((p) => {
      history.pushState({}, '', p);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  }
}
const click = opt('click');
if (click) {
  await page.locator(click).first().click();
}
const scroll = opt('scroll');
if (scroll) await page.evaluate((y) => window.scrollTo(0, Number(y)), scroll);
await page.waitForTimeout(Number(opt('wait', 1800)));
await page.screenshot({ path: `.shots/${name}.png`, fullPage: args.includes('--full') });
if (errors.length) console.log('console errors:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
console.log(`.shots/${name}.png`);
