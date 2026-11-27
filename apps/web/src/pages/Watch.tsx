import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { Player } from '../player/Player';
import { pickAudio } from '../player/tracks';
import { useTitle } from '../queries/hooks';
import { usePrefs } from '../stores/prefs';

function canHevc(): boolean {
  try {
    return (
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"')
    );
  } catch {
    return false;
  }
}

function Backdrop({ children }: { children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[var(--z-player)] grid place-items-center bg-black p-6 text-center">
      {children ?? <Spinner size={44} />}
    </div>
  );
}

function Failure() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Backdrop>
      <div>
        <h2 className="font-display text-title-m">{t('player.errorTitle')}</h2>
        <p className="mt-2 max-w-sm text-fg-dim">{t('player.errorBody')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="primary" onClick={() => location.reload()}>
            {t('common.retry')}
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    </Backdrop>
  );
}

/** Plays a library file. Audio track and conversion fallbacks re-request playback and resume in place. */
export function WatchFile() {
  const id = Number(useParams().fileId);
  const [params] = useSearchParams();
  const prefs = usePrefs();
  const hevc = useMemo(canHevc, []);
  const [audio, setAudio] = useState(0);
  const [transcode, setTranscode] = useState(false);
  const [decided, setDecided] = useState(false);
  const resumeAt = useRef<number | null>(Number(params.get('t')) || null);

  const q = useQuery({
    queryKey: ['playback', id, audio, transcode],
    queryFn: () => api.playback(id, { audio, transcode, hevc }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!q.data || decided) return;
    setDecided(true);
    const wanted = pickAudio(q.data.audioTracks, prefs.audio, prefs.language);
    if (wanted !== audio) setAudio(wanted);
  }, [q.data, decided, audio, prefs.audio, prefs.language]);

  if (q.isError) return <Failure />;
  if (!q.data || !decided || q.isFetching) return <Backdrop />;
  const info = q.data;
  const startAt = resumeAt.current ?? info.resume;

  return (
    <Player
      key={`${id}-${audio}-${transcode}`}
      info={info}
      startAt={startAt}
      audioIndex={audio}
      converting={transcode}
      onAudio={(i, at) => {
        resumeAt.current = at;
        setAudio(i);
      }}
      onTranscode={(at) => {
        resumeAt.current = at;
        setTranscode(true);
      }}
      onSwitchChannel={() => undefined}
    />
  );
}

/** Starts the right file for a title: its resume point, or the first episode. */
export function WatchTitle() {
  const id = Number(useParams().titleId);
  const { data, isError } = useTitle(id);
  if (isError || (data && !data.playFileId)) return <Failure />;
  if (data?.playFileId) return <Navigate to={`/watch/${data.playFileId}`} replace />;
  return <Backdrop />;
}

export function WatchLive() {
  const id = Number(useParams().channelId);
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['live-playback', id],
    queryFn: () => api.livePlayback(id),
    staleTime: 0,
    gcTime: 0,
  });
  if (q.isError) return <Failure />;
  if (!q.data) return <Backdrop />;
  return (
    <Player
      key={id}
      info={q.data}
      startAt={0}
      audioIndex={0}
      converting={false}
      onAudio={() => undefined}
      onTranscode={() => undefined}
      onSwitchChannel={(next) => navigate(`/watch/live/${next}`, { replace: true })}
    />
  );
}
