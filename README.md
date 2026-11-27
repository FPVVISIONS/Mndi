# Marquee

A streaming app for your own Telegram groups and channels. Marquee reads the chats you choose and
turns what is in them into a Netflix-style library of **Movies**, **Series** and **Live TV**, with
posters, descriptions, episode lists, a custom player and per-person profiles.

It is generic: nothing is hardcoded. You point it at chats you own or have the right to access, and
you tag each one as Movies, Series or Live TV.

## What you get

- **Telegram sign-in** by phone number or QR code, with two-step password support. The session is
  stored encrypted (AES-256-GCM) and never committed.
- **Indexer** that scans chat history, keeps listening for new messages, parses file names and
  captions (title, year, season, episode, quality, languages), matches each item to TMDB, and groups
  episodes into Series, Seasons, Episodes. A wrong match can be fixed from the title page.
- **Choose between files.** Telegram groups often hold several releases of one title. Every movie and
  episode has a version picker (quality, source, codec, audio and subtitle languages, size, and the
  chat it came from). The choice is remembered per profile.
- **Streaming** from Telegram with proper `Range` support, chunked downloads with read-ahead and a
  size-capped cache. With ffmpeg installed, MKV and other containers are remuxed on the fly, video is
  transcoded only when the browser cannot decode it, and extra audio tracks and embedded subtitles
  work.
- **Live TV** from M3U/M3U8 playlists and HLS or direct links posted in a Live TV chat, with logos,
  groups, favourites, a "now playing" line from an XMLTV guide when the playlist provides one, and a
  channel switcher inside the player.
- **Language switching** across ten languages (English, Hebrew, Arabic, Spanish, French, German,
  Russian, Portuguese, Turkish, Italian). It changes the interface, titles, overviews, genres and
  episode names, and swaps posters, backdrops and title logos to the artwork in that language, with
  fallbacks. RTL languages flip the layout. Metadata is cached per language, and switching needs no
  page reload.
- **Profiles** like Netflix: a "Who's watching?" screen, manage mode, colour and icon, and a separate
  My List, watch history, version choices and favourite channels for each one.
- A custom **player**: scrubber with thumbnail preview, buffer and chapter marks, audio and subtitle
  menu, speed, picture in picture, fullscreen, skip intro and recap, next-episode countdown, resume.
- An installable **PWA**.

## Quick start

Requires Node 20 or newer (22 recommended). ffmpeg is optional but strongly recommended.

```bash
git clone <this repo> && cd <this repo>
npm install
cp .env.example .env     # then fill in the values below
npm run dev              # server on :8787, web app on http://localhost:5173
```

### Try it without Telegram

```bash
npm run dev:mock         # or: MARQUEE_MOCK=1 npm run dev
```

Demo mode generates a fictional library (with artwork in all ten languages), sample video files
(needs ffmpeg) and a fake Telegram login. To walk through onboarding in demo mode, start with
`MARQUEE_MOCK_ONBOARD=1`; any phone number works, the code is `12345`, and the two-step password is
`demo` (use a number ending in 9 to see that step).

### Production

```bash
npm run build            # builds the web app
npm start                # serves the app and API from one port (default 8787)
```

## Keys you need

| What | Where | Env var |
| --- | --- | --- |
| Telegram API ID and hash | https://my.telegram.org/apps, "API development tools" | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` |
| TMDB API key | https://www.themoviedb.org/settings/api (v3 key or v4 token) | `TMDB_API_KEY` |

You can also paste the Telegram keys into the first onboarding screen instead of using `.env`; they
are then stored encrypted. Without a TMDB key the app still works but shows file names without posters
or descriptions.

Other settings are in `.env.example`: `PORT`, `HOST`, `DATA_DIR`, `SESSION_SECRET`, `STREAM_CACHE_MB`.
The server listens on `127.0.0.1` by default; put it behind a reverse proxy with authentication before
exposing it, because anyone who can reach it can stream your library.

## How it is put together

```
apps/server     Fastify, GramJS, SQLite (better-sqlite3 + Drizzle), ffmpeg helpers
apps/web        React, TypeScript, Vite, Tailwind 4, Framer Motion, TanStack Query, Zustand
packages/shared API types and the language table, used by both sides
scripts/        shot.mjs, a Playwright screenshot helper for visual checks
```

- **Design system**: tokens live in `apps/web/src/styles/tokens.css` (colour, type, spacing, radii,
  elevation) and `apps/web/src/design/motion.ts` (durations, easings, springs, stagger). Components use
  only those. One accent colour, a near-black neutral palette, one icon set (Lucide), no emoji.
- **Language logic**: `apps/server/src/metadata/artwork.ts` picks images (chosen language, then
  English, then language-neutral, then a typeset title for logos) and `localize.ts` fills untranslated
  text from English. Both are unit tested.
- **Streaming**: `apps/server/src/stream/range.ts` implements `Range` and `HEAD`;
  `sources.ts` downloads aligned chunks with read-ahead; `chunkCache.ts` keeps a small memory LRU in
  front of a size-capped disk cache.
- **Resilience**: FLOOD_WAIT is waited out, transient network errors retry with backoff, and a dead
  session sends you back to sign-in. The UI shows friendly status, never raw errors.

## Player shortcuts

`Space` or `K` play and pause, `←` `→` seek 10 s (`J` `L` too), `↑` `↓` volume, `M` mute, `F`
fullscreen, `C` subtitles on or off, `P` picture in picture, `N` next episode, `0`-`9` jump to a
percentage, `Esc` leave. In live TV, `↑` `↓` or `PageUp` `PageDown` change channel and `G` opens the
channel list.

## Quality checks

```bash
npm test          # parser, M3U and guide parsing, artwork and language fallback, Range endpoint, versions
npm run typecheck
npm run lint
```

## Notes and limits

- Telegram login and live streaming need your real credentials, so those paths could only be
  exercised against the demo backend and unit tests here. The GramJS calls follow its documented API.
- Image-based subtitles (PGS) are not extracted; text subtitles are.
- "Trending" ranks your own library by TMDB popularity.
- Content is yours to supply. Use Marquee only for material you own or have the right to access.
