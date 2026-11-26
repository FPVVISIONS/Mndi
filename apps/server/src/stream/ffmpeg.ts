import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import type { AudioTrack, Chapter, PlayMode, SubtitleTrack } from '@marquee/shared';

const execFileAsync = promisify(execFile);

export interface ProbeInfo {
  duration: number;
  container: string;
  video: { codec: string; width: number; height: number } | null;
  audio: AudioTrack[];
  subtitles: (SubtitleTrack & { codec: string })[];
  chapters: Chapter[];
}

let available: boolean | null = null;

export async function ffmpegAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    await execFileAsync('ffmpeg', ['-version']);
    await execFileAsync('ffprobe', ['-version']);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

const LANG_NAMES: Record<string, string> = {
  eng: 'English', heb: 'Hebrew', ara: 'Arabic', spa: 'Spanish', fra: 'French', fre: 'French',
  deu: 'German', ger: 'German', rus: 'Russian', por: 'Portuguese', tur: 'Turkish', ita: 'Italian',
  jpn: 'Japanese', kor: 'Korean', zho: 'Chinese', hin: 'Hindi',
};
const TWO_LETTER: Record<string, string> = {
  eng: 'en', heb: 'he', ara: 'ar', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de',
  rus: 'ru', por: 'pt', tur: 'tr', ita: 'it', jpn: 'ja', kor: 'ko', zho: 'zh', hin: 'hi',
};

const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

function chapterKind(title: string): Chapter['kind'] {
  if (/\b(intro|opening|op)\b/i.test(title)) return 'intro';
  if (/\b(recap|previously)\b/i.test(title)) return 'recap';
  if (/\b(credits?|ending|ed)\b/i.test(title)) return 'credits';
  return 'other';
}

interface RawStream {
  index: number;
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  channels?: number;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
}

export function interpretProbe(json: {
  format?: { duration?: string; format_name?: string };
  streams?: RawStream[];
  chapters?: { start_time: string; end_time: string; tags?: { title?: string } }[];
}): ProbeInfo {
  const streams = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const label = (s: RawStream, fallback: string) => {
    const lang = s.tags?.language;
    const name = (lang && LANG_NAMES[lang]) || (lang && lang !== 'und' ? lang : '');
    return s.tags?.title || name || fallback;
  };
  const audio = streams
    .filter((s) => s.codec_type === 'audio')
    .map<AudioTrack>((s, i) => ({
      index: i,
      lang: TWO_LETTER[s.tags?.language ?? ''] ?? null,
      label: label(s, `Track ${i + 1}`),
      codec: s.codec_name,
      channels: s.channels ?? null,
    }));
  const subtitles = streams
    .filter((s) => s.codec_type === 'subtitle' && TEXT_SUBS.has(s.codec_name))
    .map((s, i) => ({
      index: i,
      lang: TWO_LETTER[s.tags?.language ?? ''] ?? null,
      label: label(s, `Subtitles ${i + 1}`),
      forced: Boolean(s.disposition?.forced),
      codec: s.codec_name,
    }));
  const chapters = (json.chapters ?? []).map<Chapter>((c) => {
    const title = c.tags?.title ?? '';
    return { start: Number(c.start_time), end: Number(c.end_time), title, kind: chapterKind(title) };
  });
  return {
    duration: Number(json.format?.duration) || 0,
    container: json.format?.format_name ?? '',
    video: v ? { codec: v.codec_name, width: v.width ?? 0, height: v.height ?? 0 } : null,
    audio,
    subtitles,
    chapters,
  };
}

export async function probe(input: string): Promise<ProbeInfo | null> {
  if (!(await ffmpegAvailable())) return null;
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', input],
      { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
    );
    return interpretProbe(JSON.parse(stdout));
  } catch {
    return null;
  }
}

const DIRECT_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const DIRECT_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const COPY_VIDEO = new Set(['h264', 'vp9', 'av1']);

export interface ModeInput {
  ext: string;
  mime: string;
  videoCodec: string | null;
  audioCodec: string | null;
  audioIndex: number;
  /** The browser reports it can decode HEVC. */
  hevc: boolean;
}

/** Decide how to deliver a file to the browser: untouched, remuxed, or with video transcoded. */
export function decideMode(i: ModeInput): Extract<PlayMode, 'direct' | 'remux' | 'transcode'> {
  const v = i.videoCodec;
  const a = i.audioCodec;
  const browserContainer = ['mp4', 'm4v', 'mov', 'webm'].includes(i.ext);
  if (v && !DIRECT_VIDEO.has(v) && !(v === 'hevc' && i.hevc)) return 'transcode';
  const videoOk = !v || DIRECT_VIDEO.has(v) || (v === 'hevc' && i.hevc);
  const audioOk = !a || DIRECT_AUDIO.has(a);
  if (browserContainer && videoOk && audioOk && i.audioIndex === 0) return 'direct';
  if (!v) return browserContainer && audioOk && i.audioIndex === 0 ? 'direct' : 'remux';
  return 'remux';
}

export function canCopyVideo(codec: string | null, hevc: boolean): boolean {
  return Boolean(codec && (COPY_VIDEO.has(codec) || (codec === 'hevc' && hevc)));
}

export interface RemuxOptions {
  input: string;
  start: number;
  audioIndex: number;
  copyVideo: boolean;
  copyAudio: boolean;
}

/** Spawn ffmpeg writing a fragmented MP4 to stdout, which the browser can play as it arrives. */
export function spawnRemux(o: RemuxOptions): ChildProcess {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (o.start > 0) args.push('-ss', String(o.start));
  args.push('-i', o.input, '-map', '0:v:0?', '-map', `0:a:${o.audioIndex}?`, '-sn', '-dn');
  if (o.copyVideo) args.push('-c:v', 'copy');
  else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-vf', "scale='min(1920,iw)':-2");
  if (o.copyAudio) args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
  args.push('-avoid_negative_ts', 'make_zero', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  return spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
}

export function spawnLiveRemux(input: string): ChildProcess {
  return spawn(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, '-map', '0:v:0?', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
}

export async function extractThumb(input: string, at: number, out: string): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', input, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', out],
      { timeout: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function extractSubtitle(input: string, index: number, out: string): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', `0:s:${index}`, '-f', 'webvtt', out],
      { timeout: 10 * 60_000 },
    );
    return true;
  } catch {
    return false;
  }
}
