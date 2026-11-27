import { describe, expect, it } from 'vitest';
import { bestFile, toVersion } from '../src/library/queries.js';
import { decideMode } from '../src/stream/ffmpeg.js';

type Row = Parameters<typeof bestFile>[0][number];
const file = (id: number, quality: string, size: number, extra: Partial<Row> = {}): Row =>
  ({
    id,
    chatId: '1',
    messageId: id,
    name: `f${id}.mkv`,
    caption: null,
    mime: 'video/x-matroska',
    size,
    duration: null,
    width: null,
    height: null,
    container: 'mkv',
    quality,
    source: null,
    codec: null,
    audioLangs: '[]',
    subLangs: '[]',
    titleId: 1,
    episodeId: null,
    date: 0,
    probe: null,
    localPath: null,
    addedAt: 0,
    ...extra,
  }) as Row;

const list = [file(1, '720p', 1), file(2, '2160p', 9), file(3, '1080p', 4), file(4, '1080p', 6)];

describe('bestFile', () => {
  it('prefers the highest quality, then the larger file', () => {
    expect(bestFile(list)?.id).toBe(2);
    expect(bestFile(list.filter((f) => f.id !== 2))?.id).toBe(4);
  });
  it('respects the quality cap from settings', () => {
    expect(bestFile(list, { quality: '1080p' })?.id).toBe(4);
    expect(bestFile(list, { quality: '720p' })?.id).toBe(1);
  });
  it('falls back to what exists when nothing fits the cap', () => {
    expect(bestFile([file(5, '2160p', 9)], { quality: '720p' })?.id).toBe(5);
  });
  it('honours an explicit choice over everything else', () => {
    expect(bestFile(list, { chosen: 1, quality: 'best' })?.id).toBe(1);
  });
  it('ignores a stale choice that no longer exists', () => {
    expect(bestFile(list, { chosen: 99 })?.id).toBe(2);
  });
  it('returns undefined for an empty list', () => {
    expect(bestFile([])).toBeUndefined();
  });
});

describe('toVersion', () => {
  it('builds a readable label and flags native containers', () => {
    const v = toVersion(
      file(7, '1080p', 3, {
        source: 'BLURAY',
        codec: 'hevc',
        container: 'mp4',
        audioLangs: '["he","en"]',
      }),
      'Movie Vault',
      true,
    );
    expect(v).toMatchObject({
      label: '1080p · BluRay · HEVC',
      native: true,
      chosen: true,
      chat: 'Movie Vault',
      languages: ['he', 'en'],
    });
    expect(toVersion(file(8, '720p', 1), '', false).native).toBe(false);
  });
});

describe('decideMode', () => {
  const base = { mime: '', audioIndex: 0, hevc: false };
  it('plays browser-friendly files directly', () => {
    expect(decideMode({ ...base, ext: 'mp4', videoCodec: 'h264', audioCodec: 'aac' })).toBe(
      'direct',
    );
    expect(decideMode({ ...base, ext: 'webm', videoCodec: 'vp9', audioCodec: 'opus' })).toBe(
      'direct',
    );
  });
  it('remuxes MKV and non-default audio without touching the video', () => {
    expect(decideMode({ ...base, ext: 'mkv', videoCodec: 'h264', audioCodec: 'aac' })).toBe(
      'remux',
    );
    expect(
      decideMode({ ...base, ext: 'mp4', videoCodec: 'h264', audioCodec: 'aac', audioIndex: 1 }),
    ).toBe('remux');
  });
  it('remuxes when only the audio codec is unsupported', () => {
    expect(decideMode({ ...base, ext: 'mp4', videoCodec: 'h264', audioCodec: 'ac3' })).toBe(
      'remux',
    );
  });
  it('transcodes video the browser cannot decode, unless it reports HEVC support', () => {
    expect(decideMode({ ...base, ext: 'mkv', videoCodec: 'hevc', audioCodec: 'aac' })).toBe(
      'transcode',
    );
    expect(
      decideMode({ ...base, ext: 'mp4', videoCodec: 'hevc', audioCodec: 'aac', hevc: true }),
    ).toBe('direct');
    expect(decideMode({ ...base, ext: 'avi', videoCodec: 'mpeg4', audioCodec: 'mp3' })).toBe(
      'transcode',
    );
  });
});
