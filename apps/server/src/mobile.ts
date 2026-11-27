import { mkdirSync } from 'node:fs';

// Entry point inside the Android app. The native side starts Node with:
//   node main.mjs <dataDir> <webDir> <port>
// Everything runs on the phone: Telegram, the index, streaming and the web UI.
const [, , dataDir, webDir, port] = process.argv;

process.env.DATA_DIR = dataDir ?? process.cwd();
process.env.MARQUEE_WEB_DIST = webDir ?? '';
process.env.PORT = port ?? '38787';
// Android has no /tmp; give Node a writable temp directory inside the app.
process.env.TMPDIR = `${process.env.DATA_DIR}/tmp`;
mkdirSync(process.env.TMPDIR, { recursive: true });
process.env.HOST = '127.0.0.1';
// Native Node modules cannot load on Android; SQLite runs as WebAssembly instead.
process.env.MARQUEE_SQLITE = 'wasm';

await import('./index.js');
