import { useTranslation } from 'react-i18next';

export function Spinner({ size = 28 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <span
      role="progressbar"
      aria-label={t('common.loading')}
      className="inline-block rounded-full border-2 border-white/20 border-t-fg"
      style={{ width: size, height: size, animation: 'spin 0.8s linear infinite' }}
    />
  );
}
