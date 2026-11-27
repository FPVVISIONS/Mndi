export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Run at most `max` tasks at once. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

/** Share one in-flight promise per key. */
export function createDeduper<T>() {
  const inflight = new Map<string, Promise<T>>();
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = run().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}

export interface BackoffOptions {
  retries: number;
  baseMs: number;
  maxMs: number;
  /** Return the wait in ms to override the computed backoff (e.g. a FLOOD_WAIT), or null to give up. */
  shouldRetry: (err: unknown, attempt: number) => number | null | undefined;
  onWait?: (ms: number, err: unknown) => void;
}

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const override = opts.shouldRetry(err, attempt);
      if (override === null || attempt >= opts.retries) throw err;
      const wait =
        override ?? Math.min(opts.maxMs, opts.baseMs * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      opts.onWait?.(wait, err);
      await sleep(wait);
    }
  }
}
