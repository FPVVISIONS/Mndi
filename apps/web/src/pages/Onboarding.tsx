import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatPicker, tagsFromChats, type Tags } from '../components/ChatPicker';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { fadeUp, staggerChildren, stagger, t as tokens } from '../design/motion';
import { Wordmark } from '../layout/Wordmark';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useStatus } from '../queries/hooks';
import { ConnectStep } from './onboarding/ConnectStep';
import { IndexStep } from './onboarding/IndexStep';

type Step = 'connect' | 'choose' | 'index';
const STEPS: Step[] = ['connect', 'choose', 'index'];

function ChooseStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['chats'], queryFn: api.chats, staleTime: 0 });
  const [tags, setTags] = useState<Tags>({});
  useEffect(() => {
    if (data) setTags(tagsFromChats(data.chats));
  }, [data]);
  const chosen = Object.values(tags).filter((v) => v !== 'skip').length;

  const save = useMutation({
    mutationFn: () =>
      api.saveSources(
        (data?.chats ?? []).flatMap((c) =>
          tags[c.id] && tags[c.id] !== 'skip'
            ? [{ chatId: c.id, title: c.title, kind: tags[c.id] as 'movies' | 'series' | 'live' }]
            : [],
        ),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['status'] });
      onDone();
    },
  });

  return (
    <div>
      <h2 className="font-display text-title-l">{t('onboarding.chooseTitle')}</h2>
      <p className="mt-2 mb-6 text-fg-dim">{t('onboarding.chooseBody')}</p>
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[4.5rem]" />
          ))}
        </div>
      ) : (
        <ChatPicker chats={data?.chats ?? []} tags={tags} onChange={setTags} />
      )}
      <div className="sticky bottom-0 -mx-1 mt-6 flex items-center justify-between gap-4 bg-gradient-to-t from-bg via-bg to-transparent px-1 pt-6 pb-4">
        <span className="text-small text-fg-dim">
          {chosen === 0 ? t('onboarding.chooseNone') : ''}
        </span>
        <Button
          variant="primary"
          size="lg"
          disabled={chosen === 0 || save.isPending}
          onClick={() => save.mutate()}
        >
          {t('onboarding.start')}
        </Button>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
  const { data: status } = useStatus();
  const [step, setStep] = useState<Step>('connect');
  const toChoose = useCallback(() => setStep((s) => (s === 'connect' ? 'choose' : s)), []);
  const current = STEPS.indexOf(step);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-e border-line bg-surface-1 p-14 lg:flex">
        <Wordmark />
        <motion.div variants={staggerChildren(stagger.hero, 0.2)} initial="hidden" animate="show">
          <motion.h1 variants={fadeUp} className="font-display text-display-m text-balance">
            {t('onboarding.tagline')}
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 max-w-sm text-lead text-fg-dim">
            {t('onboarding.taglineBody')}
          </motion.p>
        </motion.div>
        <ol className="space-y-3" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={cn(
                'flex items-center gap-3 text-body transition-colors',
                i === current ? 'text-fg' : i < current ? 'text-fg-dim' : 'text-fg-faint',
              )}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full border text-caption font-bold transition-colors',
                  i < current
                    ? 'border-accent bg-accent text-on-accent'
                    : i === current
                      ? 'border-fg'
                      : 'border-line-strong',
                )}
              >
                {i < current ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {t(`onboarding.steps.${s}`)}
            </li>
          ))}
        </ol>
      </aside>
      <main className="px-6 py-10 sm:px-12 lg:px-16 lg:py-16">
        <div className="mb-10 lg:hidden">
          <Wordmark />
        </div>
        <div className="mx-auto max-w-xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={tokens.base}
            >
              {step === 'connect' && <ConnectStep onDone={toChoose} />}
              {step === 'choose' &&
                (status?.telegram.state === 'ready' ? (
                  <ChooseStep onDone={() => setStep('index')} />
                ) : (
                  <Skeleton className="h-64" />
                ))}
              {step === 'index' && <IndexStep />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
