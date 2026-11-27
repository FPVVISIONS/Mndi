// Bundles the server into one file for nodejs-mobile (Node 18 on Android) and copies the web app
// next to it. Output: apps/android/app/src/main/assets/nodejs-project/
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, 'apps/android/app/src/main/assets/nodejs-project');
const web = resolve(root, 'apps/web/dist');

if (!existsSync(resolve(web, 'index.html'))) {
  console.error('Build the web app first: npm run build:android -w @marquee/web');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [resolve(here, '../src/mobile.ts')],
  outfile: resolve(out, 'main.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  // CommonJS is what nodejs-mobile runs most reliably; ESM loading failed on some phones.
  format: 'cjs',
  // Paths derived from import.meta.url are only defaults; the app passes real ones in.
  define: { 'import.meta.url': JSON.stringify('file:///marquee/apps/server/src/bundle.js') },
  // Readable code, so an error on a phone points at a real line and function.
  minify: false,
  keepNames: true,
  legalComments: 'none',
  // Native modules are optional at runtime and absent on Android.
  external: ['better-sqlite3', 'drizzle-orm/better-sqlite3', 'sharp'],
  logLevel: 'warning',
});

// The Node.js inside the app has no ICU: a regex literal with \p{...} is a syntax error there and
// stops the whole server from loading. Refuse to ship one.
const code = readFileSync(resolve(out, 'main.js'), 'utf8');
const bad = code.split('\n').findIndex((line) => /(?<!\\)\\[pP]\{/.test(line));
if (bad >= 0) {
  console.error(
    `Unicode property escape on line ${bad + 1} of the bundle; Android's Node cannot parse it:`,
  );
  console.error(code.split('\n')[bad].trim().slice(0, 200));
  process.exit(1);
}

cpSync(web, resolve(out, 'web'), { recursive: true });
writeFileSync(
  resolve(out, 'package.json'),
  JSON.stringify({ name: 'marquee-mobile', private: true }, null, 2),
);

// Optional keys baked into the app so people never have to type them: the app's own Telegram API
// keys (sign-in then needs only a phone number) and a TMDB key (posters and descriptions work from
// the first launch). They come from the environment or a gitignored file and are written only into
// the build output, never into the repository.
const keysFile = resolve(root, 'apps/android/build-keys.properties');
const props = existsSync(keysFile)
  ? Object.fromEntries(
      readFileSync(keysFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};
const apiId = process.env.MARQUEE_TG_API_ID || props.api_id || '';
const apiHash = process.env.MARQUEE_TG_API_HASH || props.api_hash || '';
const tmdbKey = process.env.MARQUEE_TMDB_KEY || props.tmdb_key || '';
const keys = {};
if (apiId || apiHash) {
  if (!/^\d{3,12}$/.test(apiId) || !/^[a-f0-9]{32}$/i.test(apiHash)) {
    console.error('Telegram keys look wrong: api_id is digits, api_hash is 32 hex characters.');
    process.exit(1);
  }
  keys.apiId = Number(apiId);
  keys.apiHash = apiHash;
  console.log('Built-in Telegram keys included: sign-in needs only a phone number.');
}
if (tmdbKey) {
  if (!/^([a-f0-9]{32}|[\w-]{40,})$/i.test(tmdbKey)) {
    console.error('The TMDB key looks wrong: expected a 32-character v3 key or a v4 token.');
    process.exit(1);
  }
  keys.tmdbKey = tmdbKey;
  console.log('Built-in TMDB key included: nobody has to enter one.');
}
if (Object.keys(keys).length) writeFileSync(resolve(out, 'keys.json'), JSON.stringify(keys));
console.log(`Mobile bundle written to ${out}`);
