import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { supportsDirectoryAccess } from '@/save/sources';
import { LiveSetupGuide } from './LiveSetupGuide';
import type { SaveSummary } from '@/save/model';
import { ItemIcon, SeasonIcon } from '@/ui';
import './saves.css';


/** Shown until a saves folder is connected: the steps to connect it, or the click to restore it. */
export function ConnectPanel() {
  const { t } = useTranslation();
  const pendingHandle = useSaveStore((s) => s.pendingHandle);
  const reconnect = useSaveStore((s) => s.reconnect);
  const disconnect = useSaveStore((s) => s.disconnect);

  if (pendingHandle) {
    return (
      <div className="saves__connect">
        <p>{t('saves.reconnectHint')}</p>
        <div className="saves__connect-actions">
          <button className="button button--primary" onClick={() => void reconnect()}>
            <ItemIcon id="(BC)130" scale={1} tooltip={false} />
            {t('saves.reconnect')}
          </button>
          <button className="button" onClick={() => void disconnect()} title={t('saves.removeHint')}>
            {t('saves.remove')}
          </button>
        </div>
      </div>
    );
  }
  return supportsDirectoryAccess() ? <LiveSetupGuide /> : <p className="box">{t('saves.needsBrowser')}</p>;
}

function SaveCard({ summary, selected, onSelect }: { summary: SaveSummary; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const hours = Math.floor(summary.millisecondsPlayed / 3_600_000);
  return (
    <button className={selected ? 'save-card box save-card--selected' : 'save-card box'} onClick={onSelect} aria-pressed={selected}>
      <span className="save-card__title">{summary.farmName}</span>
      <span className="save-card__player">{summary.playerName}</span>
      <span className="save-card__date">
        <SeasonIcon season={summary.season} />
        {t('saves.day', { day: summary.day, season: t(`common.seasons.${summary.season}`), year: summary.year })}
      </span>
      <span className="save-card__meta">
        <span>{summary.money.toLocaleString()}g</span>
        <span>{t('saves.playtime', { hours })}</span>
      </span>
    </button>
  );
}

export function SaveList() {
  const { t } = useTranslation();
  const summaries = useSaveStore((s) => s.summaries);
  const folder = useSaveStore((s) => s.folder);
  const status = useSaveStore((s) => s.status);
  const selectSave = useSaveStore((s) => s.selectSave);
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  const disconnect = useSaveStore((s) => s.disconnect);
  const app = useSaveStore((s) => s.app);

  return (
    <section>
      {!app && status !== 'listing' && <p className="box">{t('saves.notApp')}</p>}
      <div className="saves__header">
        <h2>{t('saves.list')}</h2>
        <button className="button" onClick={() => void connectDirectory()}>
          {t('saves.change')}
        </button>
        <button className="button" onClick={() => void disconnect()} title={t('saves.removeHint')}>
          {t('saves.remove')}
        </button>
      </div>
      {summaries.length === 0 && status !== 'listing' && <p>{t('saves.none')}</p>}
      <div className="saves__grid">
        {summaries.map((s) => (
          <SaveCard
            key={s.folder}
            summary={s}
            selected={s.folder === folder}
            onSelect={() => void selectSave(s.folder)}
          />
        ))}
      </div>
    </section>
  );
}
