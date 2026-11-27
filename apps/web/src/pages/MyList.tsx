import { Plus } from 'lucide-react';
import { LayoutGroup, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TitleCardView } from '../components/media/TitleCardView';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { spring } from '../design/motion';
import { useMyList } from '../queries/hooks';

export default function MyList() {
  const { t } = useTranslation();
  const { data, isPending } = useMyList();
  return (
    <div className="page-x pt-[calc(var(--nav-h)+1.5rem)]">
      <h1 className="mb-8 font-display text-title-l">{t('myList.title')}</h1>
      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      ) : data && data.items.length ? (
        <LayoutGroup>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4 pb-28 [--card-w:100%]">
            {data.items.map((c) => (
              <motion.li key={c.id} layout transition={spring.soft}>
                <TitleCardView card={c} />
              </motion.li>
            ))}
          </ul>
        </LayoutGroup>
      ) : (
        <EmptyState
          icon={<Plus size={26} />}
          title={t('myList.emptyTitle')}
          body={t('myList.emptyBody')}
        />
      )}
    </div>
  );
}
