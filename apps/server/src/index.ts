import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createServices } from './services.js';

const config = loadConfig();
const svc = await createServices(config);
const app = await buildApp(svc);

try {
  await app.listen({ port: config.port, host: config.host });
  const mode = config.mock
    ? 'demo data'
    : svc.meta.enabled
      ? 'Telegram + TMDB'
      : 'Telegram, no TMDB key';
  console.log(`Marquee server on http://${config.host}:${config.port} (${mode})`);
} catch (err) {
  console.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void app.close().finally(() => process.exit(0)));
}
