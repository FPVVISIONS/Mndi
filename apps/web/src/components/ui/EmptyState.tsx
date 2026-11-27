import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { fadeUp } from '../../design/motion';

interface Props {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div className="mb-6 grid size-16 place-items-center rounded-full border border-line bg-surface-1 text-fg-dim">{icon}</div>
      <h2 className="font-display text-title-m">{title}</h2>
      <p className="mt-2 text-fg-dim">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}
