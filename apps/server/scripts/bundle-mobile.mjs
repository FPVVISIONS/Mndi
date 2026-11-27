// Bundles the server into one file for nodejs-mobile (Node 18 on Android) and copies the web app
// next to it. Output: apps/android/app/src/main/assets/nodejs-project/
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'apps/android/app/src/main/assets/nodejs-project');
const web = resolve(root, 'apps/web/dist');

if (!existsSync(resolve(web, 'index.html'))) {
  console.error('Build the web app first: npm run build:android -w @marquee/web');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [resolve(here, '../src/mobile.ts')],
  outfile: resolve(out, 'main.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  // Native modules are optional at runtime and absent on Android.
  external: ['better-sqlite3', 'drizzle-orm/better-sqlite3', 'sharp'],
  // CommonJS dependencies call require(); give the ESM bundle a real one.
  banner: { js: "import { createRequire as __mqRequire } from 'module'; const require = __mqRequire(import.meta.url);" },
  logLevel: 'warning',
});

cpSync(web, resolve(out, 'web'), { recursive: true });
writeFileSync(resolve(out, 'package.json'), JSON.stringify({ name: 'marquee-mobile', private: true, type: 'module' }, null, 2));
console.log(`Mobile bundle written to ${out}`);
