import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Channel } from '@marquee/shared';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';

const { channels, favChannels, epg } = schema;

export function listChannels(
  db: Db,
  profileId: number,
  now = Math.floor(Date.now() / 1000),
): Channel[] {
  const rows = db.select().from(channels).orderBy(channels.grp, channels.name).all();
  const favs = new Set(
    db
      .select()
      .from(favChannels)
      .where(eq(favChannels.profileId, profileId))
      .all()
      .map((f) => f.channelId),
  );
  const current = db
    .select()
    .from(epg)
    .where(and(lte(epg.start, now), gte(epg.stop, now)))
    .all();
  const byKey = new Map(current.map((p) => [p.channelKey, p]));
  const upcoming = db
    .select()
    .from(epg)
    .where(and(gte(epg.start, now), lte(epg.start, now + 6 * 3600)))
    .orderBy(epg.start)
    .all();
  const nextByKey = new Map<string, string>();
  for (const p of upcoming) if (!nextByKey.has(p.channelKey)) nextByKey.set(p.channelKey, p.title);

  return rows.map((c) => {
    const p = c.tvgId ? byKey.get(c.tvgId) : undefined;
    return {
      id: c.id,
      name: c.name,
      logo: c.logo,
      group: c.grp,
      favourite: favs.has(c.id),
      nowPlaying: p
        ? {
            title: p.title,
            start: p.start,
            end: p.stop,
            next: c.tvgId ? nextByKey.get(c.tvgId) : undefined,
          }
        : null,
    };
  });
}

export function setFavourite(db: Db, profileId: number, channelId: number, on: boolean): void {
  if (on) db.insert(favChannels).values({ profileId, channelId }).onConflictDoNothing().run();
  else
    db.delete(favChannels)
      .where(and(eq(favChannels.profileId, profileId), eq(favChannels.channelId, channelId)))
      .run();
}

export function replaceEpg(
  db: Db,
  rows: { channel: string; start: number; stop: number; title: string }[],
): void {
  db.transaction((tx) => {
    tx.run(sql`DELETE FROM epg WHERE stop < ${Math.floor(Date.now() / 1000) - 3600}`);
    for (const r of rows) {
      tx.insert(epg)
        .values({ channelKey: r.channel, start: r.start, stop: r.stop, title: r.title })
        .onConflictDoNothing()
        .run();
    }
  });
}
