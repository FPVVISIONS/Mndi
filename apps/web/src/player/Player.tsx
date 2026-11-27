import type { PlaybackInfo } from '@marquee/shared';
import { AnimatePresence, m } from 'framer-motion';
import {
  ArrowLeft,
  Captions,
  Layers,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  ExternalLink,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Gauge,
  Volume2,
  VolumeX,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { VersionHost } from '../pages/title/VersionHost';
import { Button, IconButton } from '../components/ui/Button';
import { MenuItem, Popover } from '../components/ui/Popover';
import { Spinner } from '../components/ui/Spinner';
import { spring } from '../design/motion';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';
import { native, openInExternalPlayer } from '../lib/native';
import { usePrefs } from '../stores/prefs';
import { ChannelSwitcher } from './ChannelSwitcher';
import { Hud, type HudEvent } from './Hud';
import { Scrubber } from './Scrubber';
import { TrackMenu } from './TrackMenu';
import { pickSubtitle } from './tracks';
import { useVideoSource } from './useVideoSource';
import { activeCue, parseVtt, type Cue } from './vtt';

interface Props {
  info: PlaybackInfo;
  startAt: number;
  audioIndex: number;
  converting: boolean;
  onAudio: (i: number, at: number) => void;
  onTranscode: (at: number) => void;
  onSwitchChannel: (id: number) => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const IDLE_MS = 3000;

export function Player({
  info,
  startAt,
  audioIndex,
  converting,
  onAudio,
  onTranscode,
  onSwitchChannel,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefs = usePrefs();
  const live = info.channelId !== null;
  // Inside the Android app, files the WebView cannot decode can go to VLC or another player.
  const external = Boolean(native()) && info.fileId !== null;
  const converted = info.mode === 'remux' || info.mode === 'transcode';
  // Some files carry no duration in Telegram's data; then the video element's own length is used,
  // which is what makes the seek bar work for them.
  const [mediaDuration, setMediaDuration] = useState(0);
  const duration = info.duration || mediaDuration;

  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const offsetRef = useRef(converted ? startAt : 0);
  const [offset, setOffsetState] = useState(offsetRef.current);
  const [time, setTime] = useState(startAt);
  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [buffered, setBuffered] = useState<[number, number][]>([]);
  const [volume, setVolume] = useState(
    () => Number(localStorage.getItem('marquee.volume') ?? 1) || 1,
  );
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(true);
  const [barHover, setBarHover] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [hud, setHud] = useState<HudEvent>(null);
  const [switcher, setSwitcher] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [cues, setCues] = useState<Cue[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const idle = useRef<number>();
  const resumed = useRef(false);
  const hudId = useRef(0);
  const clickTimer = useRef<number>();
  const skipped = useRef(new Set<number>());

  const audioLang = info.audioTracks[audioIndex]?.lang ?? null;
  const [subtitle, setSubtitle] = useState<number | null>(() =>
    pickSubtitle(info.subtitleTracks, audioLang, prefs.subtitles, prefs.language),
  );

  const setOffset = (v: number) => {
    offsetRef.current = v;
    setOffsetState(v);
  };
  const flash = useCallback((e: Omit<NonNullable<HudEvent>, 'id'>) => {
    setHud({ ...e, id: ++hudId.current } as HudEvent);
    window.clearTimeout(clickTimer.current && undefined);
    window.setTimeout(() => setHud((h) => (h && h.id === hudId.current ? null : h)), 700);
  }, []);

  useVideoSource(video, info, offset, attempt, () => setFailed(true));

  // ---- <video> events -------------------------------------------------------------------
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const abs = () => offsetRef.current + v.currentTime;
    const on: [string, () => void][] = [
      ['play', () => setPaused(false)],
      ['pause', () => setPaused(true)],
      ['waiting', () => setWaiting(true)],
      [
        'playing',
        () => {
          setWaiting(false);
          setFailed(false);
        },
      ],
      ['canplay', () => setWaiting(false)],
      [
        'durationchange',
        () => {
          if (Number.isFinite(v.duration) && v.duration > 0)
            setMediaDuration(offsetRef.current + v.duration);
        },
      ],
      ['timeupdate', () => setTime(abs())],
      [
        'progress',
        () => {
          const out: [number, number][] = [];
          for (let i = 0; i < v.buffered.length; i++)
            out.push([
              offsetRef.current + v.buffered.start(i),
              offsetRef.current + v.buffered.end(i),
            ]);
          setBuffered(out);
        },
      ],
      [
        'volumechange',
        () => {
          setMuted(v.muted);
          if (!v.muted) setVolume(v.volume);
        },
      ],
      ['ratechange', () => setRate(v.playbackRate)],
      [
        'loadedmetadata',
        () => {
          if (!resumed.current && !converted && !live && startAt > 5) v.currentTime = startAt;
          resumed.current = true;
        },
      ],
      [
        'error',
        () => {
          if (info.mode === 'direct' && !converting) onTranscode(latest.current.time);
          else setFailed(true);
        },
      ],
      [
        'ended',
        () => {
          if (info.next && prefs.autoplayNext)
            navigate(`/watch/${info.next.fileId}`, { replace: true });
        },
      ],
    ];
    for (const [n, f] of on) v.addEventListener(n, f);
    v.volume = volume;
    return () => {
      for (const [n, f] of on) v.removeEventListener(n, f);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.url, converting]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---- progress reporting --------------------------------------------------------------
  const latest = useRef({ time, duration });
  latest.current = { time, duration };
  useEffect(() => {
    if (live || info.fileId === null) return;
    const fileId = info.fileId;
    const save = () => {
      const { time: p, duration: d } = latest.current;
      if (p > 5 && d > 0) void api.saveProgress(fileId, p, d).catch(() => undefined);
    };
    const id = window.setInterval(save, 10_000);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', save);
      save();
    };
  }, [live, info.fileId]);

  // ---- subtitles ----------------------------------------------------------------------
  useEffect(() => {
    setCues([]);
    if (subtitle === null || info.fileId === null) return;
    let cancelled = false;
    fetch(`/api/stream/${info.fileId}/subs/${subtitle}.vtt`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => !cancelled && setCues(parseVtt(text)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [subtitle, info.fileId]);
  const cue = useMemo(() => activeCue(cues, time), [cues, time]);

  // ---- controls --------------------------------------------------------------------------
  const wake = useCallback(() => {
    setActive(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setActive(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(idle.current);
  }, [wake]);
  const visible = active || paused || barHover || scrubbing || switcher || failed;

  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const pipOk = typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);
  const tapScreen = () => {
    if (active && !paused) {
      window.clearTimeout(idle.current);
      setActive(false);
    } else wake();
  };

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const seek = useCallback(
    (target: number, silent = false) => {
      const v = video.current;
      if (!v || live) return;
      const t0 = Math.max(0, Math.min(duration > 0 ? duration - 0.5 : target, target));
      if (!converted) v.currentTime = t0;
      else {
        const rel = t0 - offsetRef.current;
        const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
        if (rel >= 0 && rel <= end - 0.5) v.currentTime = rel;
        else {
          setOffset(t0);
          setWaiting(true);
        }
      }
      setTime(t0);
      void silent;
    },
    [live, duration, converted],
  );

  const skip = useCallback(
    (delta: number) => {
      seek(latest.current.time + delta);
      flash({ kind: 'seek', value: delta });
    },
    [seek, flash],
  );

  const setVol = useCallback(
    (v: number) => {
      const el = video.current;
      if (!el) return;
      const next = Math.max(0, Math.min(1, v));
      el.muted = false;
      el.volume = next;
      localStorage.setItem('marquee.volume', String(next));
      flash({ kind: 'volume', value: next });
    },
    [flash],
  );

  const toggleMute = useCallback(() => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    flash({ kind: 'volume', value: el.volume, muted: el.muted });
  }, [flash]);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  }, []);

  const setSpeed = (r: number) => {
    if (video.current) video.current.playbackRate = r;
    flash({ kind: 'speed', value: r });
  };

  const pip = () => {
    const v = video.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else void v.requestPictureInPicture?.().catch(() => undefined);
  };

  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    if (window.history.length > 1) navigate(-1);
    else navigate(info.titleId ? `/title/${info.titleId}` : '/', { replace: true });
  }, [navigate, info.titleId]);

  const switchChannel = useCallback(
    (step: 1 | -1) => {
      void api.channels().then(({ channels }) => {
        const i = channels.findIndex((c) => c.id === info.channelId);
        const next = channels[(i + step + channels.length) % channels.length];
        if (next) onSwitchChannel(next.id);
      });
    },
    [info.channelId, onSwitchChannel],
  );

  // ---- keyboard --------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey)
        return;
      wake();
      const k = e.key.toLowerCase();
      const rtl = document.documentElement.dir === 'rtl';
      const handled = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (k === ' ' || k === 'k') return handled(toggle);
      if (k === 'f') return handled(toggleFs);
      if (k === 'm') return handled(toggleMute);
      if (k === 'c')
        return handled(() =>
          setSubtitle((s) => (s !== null ? null : (info.subtitleTracks[0]?.index ?? null))),
        );
      if (k === 'p') return handled(pip);
      if (k === 'n' && info.next)
        return handled(() => navigate(`/watch/${info.next!.fileId}`, { replace: true }));
      if (k === 'arrowup')
        return handled(() =>
          live && !switcher ? switchChannel(-1) : setVol((video.current?.volume ?? 1) + 0.05),
        );
      if (k === 'arrowdown')
        return handled(() =>
          live && !switcher ? switchChannel(1) : setVol((video.current?.volume ?? 1) - 0.05),
        );
      if (k === 'pageup') return handled(() => switchChannel(-1));
      if (k === 'pagedown') return handled(() => switchChannel(1));
      if (k === 'g' && live) return handled(() => setSwitcher((s) => !s));
      if (live) return;
      if (k === 'arrowleft' || k === 'j')
        return handled(() => skip(k === 'j' ? -10 : rtl ? 10 : -10));
      if (k === 'arrowright' || k === 'l')
        return handled(() => skip(k === 'l' ? 10 : rtl ? -10 : 10));
      if (/^[0-9]$/.test(k) && duration > 0)
        return handled(() => seek((Number(k) / 10) * duration));
      if (k === 'escape' && !document.fullscreenElement) return handled(leave);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- intro skip and next episode ---------------------------------------------------------
  const chapter = info.chapters.find((c) => time >= c.start && time < c.end - 0.5);
  const skippable =
    chapter && (chapter.kind === 'intro' || chapter.kind === 'recap') ? chapter : undefined;
  useEffect(() => {
    if (skippable && prefs.skipIntro && !skipped.current.has(skippable.start)) {
      skipped.current.add(skippable.start);
      seek(skippable.end);
    }
  }, [skippable, prefs.skipIntro, seek]);

  const credits = info.chapters.find((c) => c.kind === 'credits');
  const nearEnd = Boolean(
    info.next && duration > 0 && (credits ? time >= credits.start : duration - time < 25),
  );
  useEffect(() => {
    if (!nearEnd || !prefs.autoplayNext || paused) {
      setCountdown(null);
      return;
    }
    setCountdown(10);
    const id = window.setInterval(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => window.clearInterval(id);
  }, [nearEnd, prefs.autoplayNext, paused]);
  useEffect(() => {
    if (countdown === 0 && info.next) navigate(`/watch/${info.next.fileId}`, { replace: true });
  }, [countdown, info.next, navigate]);

  const volumePct = muted ? 0 : volume * 100;
  const rtl = document.documentElement.dir === 'rtl';

  return (
    <div
      ref={root}
      className={cn(
        'fixed inset-0 z-[var(--z-player)] overflow-hidden bg-black text-fg select-none',
        !visible && 'cursor-none',
      )}
      style={{ touchAction: 'manipulation' }}
      onPointerMove={(e) => e.pointerType === 'mouse' && wake()}
      onPointerDown={(e) => e.pointerType === 'mouse' && wake()}
    >
      <video
        ref={video}
        playsInline
        loop={live && info.mode === 'live-direct'}
        className="size-full object-contain"
        // Mouse: click pauses. Touch: a tap shows or hides the controls instead, so touching the
        // screen never stops the video by accident; double-tap the sides to skip 10 seconds.
        onClick={() => {
          window.clearTimeout(clickTimer.current);
          clickTimer.current = window.setTimeout(coarse ? tapScreen : toggle, 220);
        }}
        onDoubleClick={(e) => {
          window.clearTimeout(clickTimer.current);
          if (!coarse) return toggleFs();
          const x = e.clientX / window.innerWidth;
          if (x < 0.35) skip(-10);
          else if (x > 0.65) skip(10);
          else toggleFs();
        }}
      />

      {cue && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 z-10 flex justify-center px-[10%] transition-[bottom] duration-300',
            visible ? 'bottom-36' : 'bottom-12',
          )}
        >
          <p
            className="max-w-3xl rounded-md bg-black/60 px-4 py-1.5 text-center text-title-s leading-snug whitespace-pre-line [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]"
            dir="auto"
          >
            {cue.text}
          </p>
        </div>
      )}

      <Hud event={hud} />

      {coarse && !live && !failed && !waiting && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[15] grid place-items-center transition-opacity duration-300',
            visible ? 'opacity-100' : 'opacity-0',
          )}
        >
          <button
            type="button"
            aria-label={paused ? t('player.play') : t('player.pause')}
            onClick={toggle}
            className={cn(
              'glass glass-strong grid size-[4.5rem] place-items-center rounded-full',
              visible && 'pointer-events-auto',
            )}
          >
            {paused ? (
              <Play size={32} className="translate-x-0.5 fill-fg" />
            ) : (
              <Pause size={32} className="fill-fg" />
            )}
          </button>
        </div>
      )}

      <AnimatePresence>
        {(waiting || converting) && !failed && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
            role="status"
            aria-label={t('player.buffering')}
          >
            <div className="flex flex-col items-center gap-3">
              <Spinner size={44} />
              {converting && (
                <span className="text-small text-fg-dim">{t('player.converting')}</span>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {failed && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center"
          >
            <div className="max-w-sm">
              <TriangleAlert size={36} className="mx-auto mb-4 text-accent" />
              <h2 className="font-display text-title-m">{t('player.errorTitle')}</h2>
              <p className="mt-2 text-fg-dim">
                {external ? t('player.externalBody') : t('player.errorBody')}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {external && (
                  <Button
                    variant="primary"
                    icon={<ExternalLink size={17} />}
                    onClick={() => openInExternalPlayer(info.fileId!, info.title)}
                  >
                    {t('player.openExternal')}
                  </Button>
                )}
                <Button
                  variant={external ? 'secondary' : 'primary'}
                  onClick={() => {
                    setFailed(false);
                    setWaiting(true);
                    setAttempt((a) => a + 1);
                  }}
                >
                  {t('common.retry')}
                </Button>
                <Button variant="secondary" onClick={leave}>
                  {t('player.goBack')}
                </Button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/75 to-transparent px-4 pt-4 pb-14 transition-opacity duration-300 sm:px-8',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <IconButton label={t('player.goBack')} onClick={leave} className="size-11">
          <ArrowLeft size={24} className="flip-rtl" />
        </IconButton>
        <div className="min-w-0">
          <div className="truncate font-display text-title-s">{info.title}</div>
          {info.subtitle && <div className="truncate text-small text-fg-dim">{info.subtitle}</div>}
        </div>
      </div>

      {/* Skip intro / next episode */}
      <div
        className={cn(
          'absolute end-4 z-20 flex flex-col items-end gap-3 transition-[bottom] duration-300 sm:end-8',
          visible ? 'bottom-36' : 'bottom-10',
        )}
      >
        <AnimatePresence>
          {skippable && (
            <m.div
              key="skip"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={spring.soft}
            >
              <Button
                variant="secondary"
                size="lg"
                className="border border-white/40 bg-black/60 backdrop-blur"
                onClick={() => seek(skippable.end)}
              >
                {skippable.kind === 'recap' ? t('player.skipRecap') : t('player.skipIntro')}
              </Button>
            </m.div>
          )}
          {nearEnd && info.next && (
            <m.div
              key="next"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={spring.soft}
              className="w-72 rounded-lg border border-line-strong bg-surface-1/95 p-4 shadow-[var(--shadow-pop)] backdrop-blur"
            >
              <div className="eyebrow">{t('player.nextEpisode')}</div>
              <div className="mt-1 truncate font-semibold">
                {info.next.label} · {info.next.title}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Play size={14} className="fill-current" />}
                  onClick={() => navigate(`/watch/${info.next!.fileId}`, { replace: true })}
                >
                  {t('player.playNow')}
                </Button>
                {countdown !== null && (
                  <span className="text-small tabular-nums text-fg-dim">
                    {t('player.nextIn', { count: countdown })}
                  </span>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pt-20 pb-4 transition-opacity duration-300 sm:px-8',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onPointerEnter={() => setBarHover(true)}
        onPointerLeave={() => setBarHover(false)}
        onPointerDownCapture={wake}
      >
        {live ? (
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
            <span className="text-small font-bold tracking-wider text-fg uppercase">
              {t('player.live')}
            </span>
          </div>
        ) : (
          <Scrubber
            time={time}
            duration={duration}
            buffered={buffered}
            chapters={info.chapters}
            fileId={info.fileId}
            thumbs={info.thumbs}
            onSeek={seek}
            onScrub={setScrubbing}
          />
        )}
        <div className="mt-1 flex items-center gap-1 sm:gap-2">
          <IconButton
            label={paused ? t('player.play') : t('player.pause')}
            onClick={toggle}
            className="size-11"
          >
            {paused ? (
              <Play size={26} className="fill-fg" />
            ) : (
              <Pause size={26} className="fill-fg" />
            )}
          </IconButton>
          {!live && (
            <>
              <IconButton
                label={t('player.back10')}
                onClick={() => skip(-10)}
                className="hidden sm:grid"
              >
                <RotateCcw size={22} className="flip-rtl" />
              </IconButton>
              <IconButton
                label={t('player.forward10')}
                onClick={() => skip(10)}
                className="hidden sm:grid"
              >
                <RotateCw size={22} className="flip-rtl" />
              </IconButton>
            </>
          )}
          <div className="group/vol flex items-center">
            <IconButton label={muted ? t('player.unmute') : t('player.mute')} onClick={toggleMute}>
              {muted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              aria-label={t('player.volume')}
              onChange={(e) => setVol(Number(e.target.value))}
              className="vol hidden h-1 w-0 cursor-pointer appearance-none rounded-full opacity-0 transition-all duration-200 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100 group-hover/vol:w-20 group-hover/vol:opacity-100 sm:block"
              style={{
                background: `linear-gradient(to ${rtl ? 'left' : 'right'}, var(--color-fg) ${volumePct}%, rgb(255 255 255 / 0.3) ${volumePct}%)`,
              }}
            />
          </div>
          {!live && (
            <span className="ms-2 text-small tabular-nums text-fg-dim">
              {formatDuration(time)} / {formatDuration(duration)}
            </span>
          )}
          <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
            {info.next && (
              <IconButton
                label={t('player.nextEpisode')}
                onClick={() => navigate(`/watch/${info.next!.fileId}`, { replace: true })}
              >
                <SkipForward size={22} className="flip-rtl" />
              </IconButton>
            )}
            {live && (
              <IconButton
                label={t('player.channels')}
                onClick={() => setSwitcher((s) => !s)}
                active={switcher}
              >
                <ListVideo size={22} />
              </IconButton>
            )}
            {info.versions.length > 1 && (
              <IconButton label={t('player.version')} onClick={() => setVersionsOpen(true)}>
                <Layers size={22} />
              </IconButton>
            )}
            {(info.audioTracks.length > 1 || info.subtitleTracks.length > 0) && (
              <Popover
                side="top"
                panelClassName="p-2"
                trigger={({ toggle: tg, open }) => (
                  <IconButton
                    label={t('player.captions')}
                    onClick={tg}
                    active={open || subtitle !== null}
                  >
                    <Captions size={22} />
                  </IconButton>
                )}
              >
                {() => (
                  <TrackMenu
                    audio={info.audioTracks}
                    subtitles={info.subtitleTracks}
                    audioIndex={audioIndex}
                    subtitleIndex={subtitle}
                    onAudio={(i) => onAudio(i, latest.current.time)}
                    onSubtitle={setSubtitle}
                  />
                )}
              </Popover>
            )}
            {!live && (
              <Popover
                side="top"
                trigger={({ toggle: tg }) => (
                  <IconButton label={t('player.speed')} onClick={tg} active={rate !== 1}>
                    <Gauge size={22} />
                  </IconButton>
                )}
              >
                {(close) =>
                  SPEEDS.map((s) => (
                    <MenuItem
                      key={s}
                      active={s === rate}
                      onClick={() => {
                        setSpeed(s);
                        close();
                      }}
                    >
                      {s === 1 ? t('player.normal') : `${s}×`}
                    </MenuItem>
                  ))
                }
              </Popover>
            )}
            {external && (
              <IconButton
                label={t('player.openExternal')}
                onClick={() => {
                  video.current?.pause();
                  openInExternalPlayer(info.fileId!, info.title);
                }}
              >
                <ExternalLink size={22} />
              </IconButton>
            )}
            {pipOk && (
              <IconButton label={t('player.pip')} onClick={pip} className="hidden sm:grid">
                <PictureInPicture2 size={22} />
              </IconButton>
            )}
            <IconButton
              label={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
              onClick={toggleFs}
            >
              {fullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </IconButton>
          </div>
        </div>
      </div>

      {live && (
        <ChannelSwitcher
          open={switcher}
          currentId={info.channelId}
          onClose={() => setSwitcher(false)}
          onPick={(id) => {
            setSwitcher(false);
            onSwitchChannel(id);
          }}
        />
      )}

      <VersionHost
        target={
          versionsOpen && info.titleId
            ? {
                scope: info.episodeId ? 'episode' : 'title',
                refId: (info.episodeId ?? info.titleId)!,
                title: info.title,
                subtitle: info.subtitle,
              }
            : null
        }
        onClose={() => setVersionsOpen(false)}
        onPlayed={(fileId) =>
          navigate(`/watch/${fileId}?t=${Math.floor(latest.current.time)}`, { replace: true })
        }
      />
    </div>
  );
}
