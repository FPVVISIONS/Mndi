import { useMutation, useQueryClient } from '@tanstack/react-query';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { fadeUp, staggerChildren, stagger } from '../../design/motion';
import { api } from '../../lib/api';
import { invalidateLibrary, useStatus } from '../../queries/hooks';

function Counter({ value, label }: { value: number; label: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [mv, value]);
  return (
    <motion.div variants={fadeUp} className="rounded-lg border border-line bg-surface-1 p-5">
      <motion.div className="font-display text-display-s tabular-nums">{text}</motion.div>
      <div className="mt-1 text-small text-fg-dim">{label}</div>
    </motion.div>
  );
}

export function IndexStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useStatus();
  const done = useMutation({
    mutationFn: api.completeOnboarding,
    onSuccess: () => { invalidateLibrary(qc); navigate('/', { replace: true }); },
  });
  const idx = data?.index;

  return (
    <motion.div variants={staggerChildren(stagger.list)} initial="hidden" animate="show" className="space-y-6">
      <motion.h2 variants={fadeUp} className="font-display text-title-l">{t('onboarding.indexTitle')}</motion.h2>
      <motion.p variants={fadeUp} className="text-fg-dim">{idx && idx.items === 0 ? t('onboarding.waiting') : t('onboarding.indexBody')}</motion.p>
      <div className="grid grid-cols-3 gap-3">
        <Counter value={idx?.items ?? 0} label={t('onboarding.files')} />
        <Counter value={idx?.titles ?? 0} label={t('onboarding.titles')} />
        <Counter value={idx?.channels ?? 0} label={t('onboarding.channels')} />
      </div>
      {data && !data.tmdb && (
        <motion.div variants={fadeUp} className="flex gap-3 rounded-lg border border-line bg-surface-1 p-4 text-small text-fg-dim">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-accent" />
          {t('onboarding.noTmdb')}
        </motion.div>
      )}
      <motion.div variants={fadeUp}>
        <Button variant="primary" size="lg" onClick={() => done.mutate()} disabled={done.isPending}>{t('onboarding.open')}</Button>
      </motion.div>
    </motion.div>
  );
}
