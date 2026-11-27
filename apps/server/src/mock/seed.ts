import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { replaceEpg } from '../live/channels.js';
import { ingestVideo } from '../library/titles.js';
import type { MetadataService } from '../metadata/service.js';
import { MOCK_CATALOG } from './catalog.js';
import { SAMPLE_SECONDS } from './media.js';
import { statSync } from 'node:fs';

const { settings, sources, profiles, progress, myList, likes, channels, files, titles, episodes } =
  schema;

export const MOCK_CHATS = [
  {
    id: '-1001000000001',
    title: 'Movie Vault',
    kind: 'movies' as const,
    members: 12408,
    type: 'channel' as const,
  },
  {
    id: '-1001000000002',
    title: 'Series Archive',
    kind: 'series' as const,
    members: 8730,
    type: 'channel' as const,
  },
  {
    id: '-1001000000003',
    title: 'Open Air Streams',
    kind: 'live' as const,
    members: 2210,
    type: 'group' as const,
  },
  {
    id: '-1001000000004',
    title: 'Weekend Watch Club',
    kind: null,
    members: 342,
    type: 'group' as const,
  },
  {
    id: '-1001000000005',
    title: 'Documentary Shelf',
    kind: null,
    members: 5120,
    type: 'channel' as const,
  },
  {
    id: '-1001000000006',
    title: 'Retro Cinema',
    kind: null,
    members: 1980,
    type: 'channel' as const,
  },
];

const CHANNELS = [
  ['Harbor News 24', 'News', 'harbor.news'],
  ['Coast Sport', 'Sport', 'coast.sport'],
  ['Studio One', 'Entertainment', 'studio.one'],
  ['Kiddo TV', 'Kids', 'kiddo.tv'],
  ['Atlas Documentary', 'Documentary', 'atlas.doc'],
  ['Nightline Music', 'Music', 'nightline.music'],
  ['Open Air Weather', 'News', 'openair.weather'],
  ['Cine Classics', 'Movies', 'cine.classics'],
  ['Metro Traffic', 'News', 'metro.traffic'],
  ['Paper Moon Kids', 'Kids', 'papermoon.kids'],
  ['Late Night Jazz', 'Music', 'latenight.jazz'],
  ['Premier Football', 'Sport', 'premier.football'],
] as const;

const SHOWS = [
  'Morning Edition',
  'The Long Table',
  'Field Notes',
  'Replay',
  'Night Desk',
  'Open Studio',
  'The Archive Hour',
  'Weekend Live',
];

const PROFILES = [
  { name: 'Mira', color: '#E8913A', avatar: 'clapperboard' },
  { name: 'Dev', color: '#4FA3A5', avatar: 'rocket' },
  { name: 'Kids', color: '#C8E06B', avatar: 'cat' },
];

const TAGS = [
  'WEB-DL.DDP5.1.H.264',
  'BluRay.x265.10bit.Hebrew.English.HebSubs',
  'WEBRip.x264.Dual.Audio',
  'HDTV.x264.Spanish',
];

function releaseName(
  t: (typeof MOCK_CATALOG)[number],
  quality: string,
  variant: number,
  s?: number,
  e?: number,
): string {
  const base = t.title.en.replace(/ /g, '.');
  const tag = quality === '2160p' ? 'WEB-DL.DDP5.1.HEVC' : (TAGS[variant % TAGS.length] ?? TAGS[0]);
  return s !== undefined
    ? `${base}.S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}.${quality}.${tag}-MRQ.webm`
    : `${base}.${t.year}.${quality}.${tag}-MRQ.webm`;
}

export async function seedMock(
  db: Db,
  meta: MetadataService,
  samples: string[],
  onboarded: boolean,
): Promise<void> {
  if (db.select().from(titles).get()) return;
  const now = Math.floor(Date.now() / 1000);
  const sizes = samples.map((p) => statSync(p).size);
  const set = (key: string, value: string) =>
    db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();

  set('onboarded', onboarded ? '1' : '0');
  for (const c of MOCK_CHATS.filter((c) => c.kind)) {
    db.insert(sources)
      .values({ chatId: c.id, title: c.title, kind: c.kind!, lastMessageId: 1, scannedAt: now })
      .onConflictDoNothing()
      .run();
  }
  for (const p of PROFILES)
    db.insert(profiles)
      .values({ ...p, createdAt: now })
      .run();

  let messageId = 100;
  for (const t of MOCK_CATALOG) {
    const addedAt = now - t.ageDays * 86400 - 3600;
    const specs: { name: string; q: string; s?: number; e?: number }[] = [];
    if (t.kind === 'movie')
      t.qualities.forEach((q, i) => specs.push({ name: releaseName(t, q, i), q }));
    else
      t.seasons.forEach((count, si) => {
        for (let e = 1; e <= count; e++) {
          // The newest season gets only the first few episodes, so "New episodes" has something to show.
          const last = si === t.seasons.length - 1;
          if (last && t.ageDays <= 5 && e > Math.min(count, 4)) continue;
          specs.push({
            name: releaseName(t, t.qualities[0]!, 0, si + 1, e),
            q: t.qualities[0]!,
            s: si + 1,
            e,
          });
          if (t.qualities.length > 1 && e <= 2)
            specs.push({
              name: releaseName(t, t.qualities[1]!, 1, si + 1, e),
              q: t.qualities[1]!,
              s: si + 1,
              e,
            });
        }
      });
    for (const [n, spec] of specs.entries()) {
      const idx = t.id % samples.length;
      const bump = spec.q === '2160p' ? 3.4 : spec.q === '1080p' ? 1.6 : 0.7;
      const res = ingestVideo(
        db,
        t.kind === 'movie' ? 'movies' : 'series',
        {
          chatId: t.kind === 'movie' ? MOCK_CHATS[0]!.id : MOCK_CHATS[1]!.id,
          messageId: messageId++,
          name: spec.name,
          caption: null,
          mime: 'video/webm',
          size: Math.round((sizes[idx] ?? 1_000_000) * 120 * bump * (1 + (n % 3) * 0.12)),
          duration: SAMPLE_SECONDS,
          width: spec.q === '2160p' ? 3840 : spec.q === '1080p' ? 1920 : 1280,
          height: spec.q === '2160p' ? 2160 : spec.q === '1080p' ? 1080 : 720,
          date: addedAt,
          localPath: samples[idx],
        },
        addedAt + (spec.e ?? 0) * 60,
      );
      if (res?.createdTitle) meta.setMatch(res.titleId, t.id, false);
    }
  }
  // Episodes released recently get recent timestamps so the "New episodes" row is honest.
  db.update(episodes)
    .set({ addedAt: now - 2 * 86400 })
    .where(eq(episodes.season, 3))
    .run();

  // Pre-warm English so the first screen never flashes empty; other languages load on demand.
  await Promise.all(MOCK_CATALOG.map((t) => meta.ensure(t.kind, t.id, 'en')));

  const fileFor = (slug: string, season?: number, episode?: number) => {
    const t = MOCK_CATALOG.find((x) => x.slug === slug)!;
    const title = db.select().from(titles).where(eq(titles.tmdbId, t.id)).get()!;
    const all = db.select().from(files).where(eq(files.titleId, title.id)).all();
    const f = season
      ? all.find((x) => {
          const ep = db
            .select()
            .from(episodes)
            .where(eq(episodes.id, x.episodeId ?? -1))
            .get();
          return ep?.season === season && ep.episode === episode;
        })
      : all[0];
    return { title, file: f! };
  };

  const prog = (slug: string, pos: number, s?: number, e?: number, done = false) => {
    const { title, file } = fileFor(slug, s, e);
    db.insert(progress)
      .values({
        profileId: 1,
        fileId: file.id,
        titleId: title.id,
        position: pos,
        duration: SAMPLE_SECONDS,
        completed: done,
        updatedAt: now - Math.floor(Math.random() * 3000) - 60,
      })
      .onConflictDoNothing()
      .run();
  };
  prog('neon-quarter', 38);
  prog('salt-line', 44, 2, 3);
  for (let e = 1; e <= 8; e++) prog('salt-line', 88, 1, e, true);
  for (let e = 1; e <= 2; e++) prog('salt-line', 88, 2, e, true);
  prog('lowtide', 17, 1, 5);
  for (let e = 1; e <= 4; e++) prog('lowtide', 88, 1, e, true);

  for (const slug of ['long-harbour', 'sky-archive', 'cold-meridian', 'paper-moons']) {
    const { title } = fileFor(
      slug,
      slug === 'sky-archive' || slug === 'cold-meridian' ? 1 : undefined,
      1,
    );
    db.insert(myList)
      .values({ profileId: 1, titleId: title.id, addedAt: now - 1000 })
      .onConflictDoNothing()
      .run();
  }
  db.insert(likes)
    .values({ profileId: 1, titleId: fileFor('salt-line', 1, 1).title.id })
    .onConflictDoNothing()
    .run();

  CHANNELS.forEach(([name, grp, tvg], i) => {
    db.insert(channels)
      .values({
        sourceId: MOCK_CHATS[2]!.id,
        key: `mock-${tvg}`,
        name,
        grp,
        tvgId: tvg,
        logo: `/api/mock/logo/${tvg}.svg`,
        url: `mock:sample/${(i % 3) + 1}`,
        addedAt: now,
      })
      .onConflictDoNothing()
      .run();
  });
  refreshMockEpg(db);
}

export function refreshMockEpg(db: Db): void {
  const now = Math.floor(Date.now() / 1000);
  const slot = 3600;
  const start = Math.floor(now / slot) * slot - 2 * slot;
  const rows = CHANNELS.flatMap(([, , tvg], ci) =>
    Array.from({ length: 12 }, (_, i) => ({
      channel: tvg,
      start: start + i * slot,
      stop: start + (i + 1) * slot,
      title: SHOWS[(ci * 3 + i) % SHOWS.length]!,
    })),
  );
  replaceEpg(db, rows);
}
