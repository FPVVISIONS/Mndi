// Rewrites the built stylesheets so old WebViews (Android TV boxes often ship Chrome 90 or older)
// can use them. Tailwind 4 writes everything inside @layer blocks and uses color-mix(); engines
// that predate those features drop the rules and the app shows as unstyled HTML.
//   1. @layer is flattened into plain rules with the same cascade order.
//   2. Lightning CSS then lowers newer syntax (nesting, color-mix, logical properties, ...).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cascadeLayers from '@csstools/postcss-cascade-layers';
import { transform } from 'lightningcss';
import postcss from 'postcss';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/assets');
const files = readdirSync(dist).filter((f) => f.endsWith('.css'));

for (const f of files) {
  const path = join(dist, f);
  const source = readFileSync(path, 'utf8');
  if (!/@layer|color-mix|@property/.test(source)) continue;
  const flat = await postcss([cascadeLayers()]).process(source, { from: path });
  const out = transform({
    filename: f,
    code: Buffer.from(flat.css),
    minify: true,
    targets: { chrome: 70 << 16, android: 70 << 16, safari: 12 << 16 },
  });
  writeFileSync(path, out.code);
  const left = (out.code.toString().match(/@layer|color-mix\(/g) ?? []).length;
  console.log(
    `legacy css: ${f} ${source.length} -> ${out.code.length} bytes, ${left} modern leftovers`,
  );
}
