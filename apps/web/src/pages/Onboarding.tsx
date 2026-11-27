import { m } from 'framer-motion';
import { Check } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fadeUp, staggerChildren, stagger, t as tokens } from '../design/motion';
import { Wordmark } from '../layout/Wordmark';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { ConnectStep } from './onboarding/ConnectStep';
import { IndexStep } from './onboarding/IndexStep';

type Step = 'connect' | 'index';
const STEPS: Step[] = ['connect', 'index'];

export default function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('connect');
  // Once connected, Marquee finds the chats that hold media by itself: nobody picks groups by hand.
  const toIndex = useCallback(() => {
    setStep((s) => (s === 'connect' ? 'index' : s));
    void api.discover().catch(() => undefined);
  }, []);
  const current = STEPS.indexOf(step);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-e border-line bg-surface-1 p-14 lg:flex">
        <Wordmark />
        <m.div variants={staggerChildren(stagger.hero, 0.2)} initial="hidden" animate="show">
          <m.h1 variants={fadeUp} className="font-display text-display-m text-balance">
            {t('onboarding.tagline')}
          </m.h1>
          <m.p variants={fadeUp} className="mt-5 max-w-sm text-lead text-fg-dim">
            {t('onboarding.taglineBody')}
          </m.p>
        </m.div>
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
          <m.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tokens.base}
          >
            {step === 'connect' && <ConnectStep onDone={toIndex} />}
            {step === 'index' && <IndexStep />}
          </m.div>
        </div>
      </main>
    </div>
  );
}
