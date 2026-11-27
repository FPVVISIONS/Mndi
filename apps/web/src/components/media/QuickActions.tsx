import type { TitleCard } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Check, Play, Plus, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { spring, press } from '../../design/motion';
import { cn } from '../../lib/cn';
import { useToggleLike, useToggleList } from '../../queries/hooks';
import { useToasts } from '../../stores/toasts';

export function watchPath(card: Pick<TitleCard, 'id' | 'progress'>): string {
  return card.progress ? `/watch/${card.progress.fileId}` : `/watch/title/${card.id}`;
}

function Round({ label, onClick, children, solid }: { label: string; onClick: () => void; children: React.ReactNode; solid?: boolean }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={press}
      transition={spring.snappy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'grid size-9 place-items-center rounded-full border transition-colors duration-150',
        solid ? 'border-transparent bg-fg text-bg hover:bg-white' : 'border-white/40 bg-black/40 text-fg hover:border-fg',
      )}
    >
      {children}
    </motion.button>
  );
}

/** Play, My List and Like as round buttons. The My List icon morphs between plus and check. */
export function QuickActions({ card, className }: { card: TitleCard; className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toggleList = useToggleList();
  const toggleLike = useToggleLike();
  const push = useToasts((s) => s.push);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Round solid label={t('card.play', { title: card.title })} onClick={() => navigate(watchPath(card))}>
        <Play size={16} className="fill-current" />
      </Round>
      <Round
        label={card.inList ? t('common.removeFromList') : t('common.addToList')}
        onClick={() => {
          toggleList.mutate({ id: card.id, on: !card.inList });
          push(card.inList ? t('toast.removed') : t('toast.added'));
        }}
      >
        <motion.span key={String(card.inList)} initial={{ scale: 0.4, rotate: -60, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.snappy} className="grid">
          {card.inList ? <Check size={17} /> : <Plus size={17} />}
        </motion.span>
      </Round>
      <Round label={card.liked ? t('common.liked') : t('common.like')} onClick={() => toggleLike.mutate({ id: card.id, on: !card.liked })}>
        <motion.span key={String(card.liked)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={spring.snappy} className="grid">
          <ThumbsUp size={15} className={card.liked ? 'fill-fg' : ''} />
        </motion.span>
      </Round>
    </div>
  );
}
