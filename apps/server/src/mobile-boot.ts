// Runs first inside the Android app, before any other module loads: sets up the startup log,
// crash capture and environment, so even a failure while loading dependencies is reported.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , dataDir = process.cwd(), webDir = '', port = '38787'] = process.argv;
mkdirSync(dataDir, { recursive: true });

const logFile = join(dataDir, 'startup.log');
const errorFile = join(dirname(dataDir), 'node-error.txt');
writeFileSync(logFile, '');

export function step(message: string): void {
  try {
    appendFileSync(logFile, `${new Date().toISOString().slice(11, 23)} ${message}\n`);
  } catch {
    // Logging must never stop the server.
  }
}

export function fail(err: unknown): never {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
  step(`failed: ${text.split('\n')[0]}`);
  writeFileSync(errorFile, `The server failed to start:\n${text}`);
  process.exit(1);
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

step(
  `node ${process.version} ${process.platform}/${process.arch}, ` +
    `wasm ${typeof (globalThis as { WebAssembly?: unknown }).WebAssembly}`,
);

process.env.DATA_DIR = dataDir;
process.env.MARQUEE_WEB_DIST = webDir;
process.env.PORT = port;
process.env.HOST = '127.0.0.1';
// Android has no /tmp; give Node a writable temp directory inside the app.
process.env.TMPDIR = join(dataDir, 'tmp');
mkdirSync(process.env.TMPDIR, { recursive: true });
// Native Node modules cannot load on Android; SQLite runs as WebAssembly or plain JavaScript.
process.env.MARQUEE_SQLITE = 'wasm';
step('loading server code');
