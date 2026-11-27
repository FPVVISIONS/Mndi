// Entry point inside the Android app. The native side starts Node with:
//   node main.mjs <dataDir> <webDir> <port>
// Everything runs on the phone: Telegram, the index, streaming and the web UI.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , dataDir = process.cwd(), webDir = '', port = '38787'] = process.argv;
mkdirSync(dataDir, { recursive: true });

// A step-by-step startup log and the failure reason, both shown by the app's diagnostics screen.
const logFile = join(dataDir, 'startup.log');
const errorFile = join(dirname(dataDir), 'node-error.txt');
writeFileSync(logFile, '');
const step = (message: string) => {
  try {
    appendFileSync(logFile, `${new Date().toISOString().slice(11, 23)} ${message}\n`);
  } catch {
    // Logging must never stop the server.
  }
};
const fail = (err: unknown) => {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
  step(`failed: ${text.split('\n')[0]}`);
  writeFileSync(errorFile, `The server failed to start:\n${text}`);
  process.exit(1);
};
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

step(
  `node ${process.version} ${process.platform}/${process.arch}, wasm ${typeof (globalThis as { WebAssembly?: unknown }).WebAssembly}`,
);

process.env.DATA_DIR = dataDir;
process.env.MARQUEE_WEB_DIST = webDir;
process.env.PORT = port;
process.env.HOST = '127.0.0.1';
// Android has no /tmp; give Node a writable temp directory inside the app.
process.env.TMPDIR = join(dataDir, 'tmp');
mkdirSync(process.env.TMPDIR, { recursive: true });
// Native Node modules cannot load on Android; SQLite runs as WebAssembly instead.
process.env.MARQUEE_SQLITE = 'wasm';
(globalThis as { __marqueeStep?: (m: string) => void }).__marqueeStep = step;

try {
  step('loading server');
  await import('./index.js');
  step('server module loaded');
} catch (err) {
  fail(err);
}
