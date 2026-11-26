import { and, eq } from 'drizzle-orm';
import type { PlaybackInfo } from '@marquee/shared';
import { schema } from '../db/client.js';
import { toVersion, episodeLabel, type Ctx } from '../library/queries.js';
import type { Services } from '../services.js';
import { bestFile } from '../library/queries.js';
import { decideMode, ffmpegAvailable, probe, type ProbeInfo } from './ffmpeg.js';

const { files, titles, episodes } = schema;

export interface PlaybackQuery {
  audio: number;
  hevc: boolean;
  transcode: boolean;
}

export async function probeFile(svc: Services, fileId: number): Promise<ProbeInfo | null> {
  const row = svc.db.select().from(files).where(eq(files.id, fileId)).get();
  if (!row) return null;
  if (row.probe) return JSON.parse(row.probe) as ProbeInfo;
  const info = await probe(row.localPath ?? `${svc.internalBase()}/api/stream/${fileId}`);
  if (info) svc.db.update(files).set({ probe: JSON.stringify(info) }).where(eq(files.id, fileId)).run();
  return info;
}

export function inputFor(svc: Services, fileId: number): string {
  const row = svc.db.select().from(files).where(eq(files.id, fileId)).get();
  return row?.localPath ?? `${svc.internalBase()}/api/stream/${fileId}`;
}

export async function buildPlayback(svc: Services, fileId: number, ctx: Ctx, q: PlaybackQuery): Promise<PlaybackInfo | null> {
  const file = svc.db.select().from(files).where(eq(files.id, fileId)).get();
  if (!file?.titleId) return null;
  const row = svc.db.select().from(titles).where(eq(titles.id, file.titleId)).get();
  if (!row) return null;

  const info = await probeFile(svc, fileId);
  const videoCodec = info?.video?.codec ?? file.codec ?? null;
  const audioCodec = info?.audio[q.audio]?.codec ?? null;
  const ff = await ffmpegAvailable();
  let mode = decideMode({ ext: file.container, mime: file.mime, videoCodec, audioCodec, audioIndex: q.audio, hevc: q.hevc });
  if (!ff) mode = 'direct';
  else if (q.transcode) mode = 'transcode';

  const card = svc.library.cards([row], ctx)[0]!;
  let subtitle: string | null = null;
  let next: PlaybackInfo['next'] = null;
  let versions = svc.library.filesFor(row.id);

  if (file.episodeId) {
    const ep = svc.db.select().from(episodes).where(eq(episodes.id, file.episodeId)).get();
    if (ep) {
      const season = row.tmdbId ? await svc.meta.season(row.tmdbId, ep.season, ctx.lang) : null;
      const name = season?.episodes.find((e) => e.episode_number === ep.episode)?.name;
      subtitle = [episodeLabel(ep.season, ep.episode), name].filter(Boolean).join(' · ');
      versions = versions.filter((v) => v.episodeId === ep.id);
      const all = svc.db.select().from(episodes).where(eq(episodes.titleId, row.id)).orderBy(episodes.season, episodes.episode).all();
      const following = all[all.findIndex((e) => e.id === ep.id) + 1];
      const nextFile = following ? bestFile(svc.db.select().from(files).where(and(eq(files.episodeId, following.id))).all()) : undefined;
      if (following && nextFile) {
        const nextName = row.tmdbId
          ? (await svc.meta.season(row.tmdbId, following.season, ctx.lang))?.episodes.find((e) => e.episode_number === following.episode)?.name
          : undefined;
        next = { fileId: nextFile.id, label: episodeLabel(following.season, following.episode), title: nextName ?? card.title };
      }
    }
  }

  const url = mode === 'direct' ? `/api/stream/${fileId}` : `/api/stream/${fileId}/remux?audio=${q.audio}&mode=${mode}&hevc=${q.hevc ? 1 : 0}`;

  return {
    fileId,
    channelId: null,
    titleId: row.id,
    title: card.title,
    subtitle,
    duration: info?.duration || file.duration || 0,
    mode,
    url,
    audioTracks: info?.audio ?? [],
    subtitleTracks: (info?.subtitles ?? []).map(({ codec: _codec, ...s }) => s),
    chapters: info?.chapters ?? [],
    resume: svc.library.resumeFor(ctx.profileId, fileId),
    next,
    versions: versions.map(toVersion),
    thumbs: ff,
    backdrop: card.backdrop,
  };
}
