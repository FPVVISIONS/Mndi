import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createServices } from './services.js';

type Step = (message: string) => void;

/** Start Marquee. Reads configuration from the environment at call time. */
export async function startServer(step: Step = () => undefined): Promise<void> {
  const config = loadConfig();
  step('creating services');
  const svc = await createServices(config);
  step('building routes');
  const app = await buildApp(svc);
  step(`listening on ${config.host}:${config.port}`);
  await app.listen({ port: config.port, host: config.host });
  step('ready');
  const mode = config.mock
    ? 'demo data'
    : svc.meta.enabled
      ? 'Telegram + TMDB'
      : 'Telegram, no TMDB key';
  console.log(`Marquee server on http://${config.host}:${config.port} (${mode})`);

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => void app.close().finally(() => process.exit(0)));
  }
}
