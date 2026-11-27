import type { PlaybackInfo } from '@marquee/shared';
import { useEffect, type RefObject } from 'react';

/**
 * Attaches the right source to the <video>: a plain URL, a remuxed stream from a start offset,
 * or an HLS playlist through hls.js (loaded only when a live channel needs it).
 */
export function useVideoSource(
  videoRef: RefObject<HTMLVideoElement>,
  info: PlaybackInfo,
  offset: number,
  attempt: number,
  onFatal: () => void,
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    const converted = info.mode === 'remux' || info.mode === 'transcode';
    const url = converted ? `${info.url}&start=${Math.floor(offset)}` : info.url;

    const run = async () => {
      if (info.mode === 'live-hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) return onFatal();
        const instance = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
        hls = instance;
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) instance.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) instance.recoverMediaError();
          else onFatal();
        });
        instance.loadSource(url);
        instance.attachMedia(video);
      } else {
        video.src = url;
      }
      video.play().catch(() => undefined);
    };
    void run();

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
    // `offset` is floored so sub-second jitter never reloads the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.url, info.mode, Math.floor(offset), attempt]);
}
