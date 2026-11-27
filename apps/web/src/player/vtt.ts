export interface Cue {
  start: number;
  end: number;
  text: string;
}

function seconds(stamp: string): number {
  const parts = stamp.trim().replace(',', '.').split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [h = 0, m = 0, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

/** Parse WebVTT into cues. Tags are stripped; styling is done by the player. */
export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = (lines[timing] ?? '').split('-->');
    if (!a || !b) continue;
    const body = lines
      .slice(timing + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (body)
      cues.push({ start: seconds(a), end: seconds(b.trim().split(/\s/)[0] ?? b), text: body });
  }
  return cues;
}

export function activeCue(cues: Cue[], t: number): Cue | null {
  // Cues are few and sorted in practice; a linear scan from a binary-ish start is plenty.
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (t < c.start) hi = mid - 1;
    else if (t > c.end) lo = mid + 1;
    else return c;
  }
  return null;
}
