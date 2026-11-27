import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const SAMPLE_SECONDS = 90;

const PALETTES = [
  ['0x10212b', '0x1d4a5a', '0x0b0b0c', '0xe9a85b'],
  ['0x1f1210', '0x7a2e1b', '0x0b0b0c', '0xffb15c'],
  ['0x0e1412', '0x214c3d', '0x0b0b0c', '0xc8f26b'],
];

const VTT = `WEBVTT

00:00:02.000 --> 00:00:06.000
Keep your eyes on the horizon.

00:00:08.000 --> 00:00:12.000
The tide table says we have an hour.

00:00:20.000 --> 00:00:25.000
Nobody has been out this far in years.

00:00:40.000 --> 00:00:45.000
Then we go back the long way round.
`;

const CHAPTERS = `;FFMETADATA1
[CHAPTER]
TIMEBASE=1/1000
START=0
END=4000
title=Cold open
[CHAPTER]
TIMEBASE=1/1000
START=4000
END=14000
title=Intro
[CHAPTER]
TIMEBASE=1/1000
START=14000
END=76000
title=Part one
[CHAPTER]
TIMEBASE=1/1000
START=76000
END=90000
title=Credits
`;

/** Generate three short abstract clips once. They stand in for library files in demo mode. */
export async function ensureSampleMedia(dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const vtt = join(dir, 'sample.vtt');
  const meta = join(dir, 'chapters.txt');
  writeFileSync(vtt, VTT);
  writeFileSync(meta, CHAPTERS);
  const out: string[] = [];
  for (const [i, c] of PALETTES.entries()) {
    const file = join(dir, `sample${i + 1}.webm`);
    out.push(file);
    if (existsSync(file)) continue;
    await run(
      'ffmpeg',
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `gradients=s=854x480:c0=${c[0]}:c1=${c[1]}:c2=${c[2]}:c3=${c[3]}:nb_colors=4:speed=0.012:rate=24:duration=${SAMPLE_SECONDS},gblur=sigma=6,vignette=PI/4`,
        '-f', 'lavfi', '-i', `sine=frequency=${110 + i * 20}:duration=${SAMPLE_SECONDS}`,
        '-f', 'lavfi', '-i', `sine=frequency=${165 + i * 20}:duration=${SAMPLE_SECONDS}`,
        '-i', vtt, '-i', meta,
        '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:s', '-map_metadata', '4',
        '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '450k', '-g', '48', '-pix_fmt', 'yuv420p',
        '-c:a', 'libopus', '-b:a', '48k', '-c:s', 'webvtt',
        '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=heb',
        '-metadata:s:s:0', 'language=eng',
        '-t', String(SAMPLE_SECONDS), file,
      ],
      { timeout: 180_000 },
    );
  }
  return out;
}
