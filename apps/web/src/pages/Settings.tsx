import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PillTabs } from '../components/ui/Segmented';
import { AboutTab } from './settings/AboutTab';
import { GeneralTab } from './settings/GeneralTab';
import { LibraryTab } from './settings/LibraryTab';
import { PlaybackTab } from './settings/PlaybackTab';
import { ProfilesTab } from './settings/ProfilesTab';
import { StorageTab } from './settings/StorageTab';

const TABS = ['general', 'playback', 'library', 'profiles', 'storage', 'about'] as const;
type Tab = (typeof TABS)[number];

export default function Settings() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'general';

  return (
    <div className="page-x mx-auto max-w-4xl pt-[calc(var(--nav-h)+1.5rem)]">
      <h1 className="mb-6 font-display text-title-l">{t('settings.title')}</h1>
      <PillTabs
        label={t('settings.title')}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={TABS.map((id) => ({ value: id, label: t(`settings.${id}`) }))}
        className="mb-8"
      />
      {tab === 'general' && <GeneralTab />}
      {tab === 'playback' && <PlaybackTab />}
      {tab === 'library' && <LibraryTab />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'storage' && <StorageTab />}
      {tab === 'about' && <AboutTab />}
    </div>
  );
}
