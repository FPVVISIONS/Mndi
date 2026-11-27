/**
 * A small in-memory log of what went wrong or slow, shown in Settings so a problem on a phone can
 * be read off the screen instead of guessed at. Holds no personal data: only request paths (no
 * query strings), timings and error summaries.
 */
const entries: { at: number; kind: string; text: string }[] = [];
const startedAt = Date.now();

export function record(kind: string, text: string): void {
  entries.push({ at: Date.now(), kind, text: text.slice(0, 200) });
  if (entries.length > 80) entries.shift();
}

export function report(): {
  uptimeSeconds: number;
  rssMb: number;
  entries: { agoSeconds: number; kind: string; text: string }[];
} {
  const now = Date.now();
  return {
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    entries: entries
      .slice()
      .reverse()
      .map((e) => ({ agoSeconds: Math.round((now - e.at) / 1000), kind: e.kind, text: e.text })),
  };
}
