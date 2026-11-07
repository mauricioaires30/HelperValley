import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { supportsDirectoryAccess } from '@/save/sources';
import type { SaveSummary } from '@/save/model';
import { ItemIcon, SeasonIcon } from '@/ui';
import { LiveSetupGuide } from './LiveSetupGuide';
import './saves.css';

const SAVES_PATH = '%AppData%\\StardewValley\\Saves';

function CopyPath() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(SAVES_PATH).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  return (
    <p className="saves__path">
      {t('saves.where')} <code className="inset">{SAVES_PATH}</code>
      <button className="button" onClick={copy}>
        {copied ? t('saves.copied') : t('saves.copy')}
      </button>
    </p>
  );
}

/** Folder picker for browsers without the File System Access API. */
export function FolderInput({ label, primary }: { label: string; primary?: boolean }) {
  const useFiles = useSaveStore((s) => s.useFiles);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={primary ? 'button button--primary' : 'button'} onClick={() => input.current?.click()}>
        <ItemIcon id="(BC)130" scale={1} tooltip={false} />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        {...{ webkitdirectory: '' }}
        onChange={(e) => e.target.files && void useFiles(e.target.files)}
      />
    </>
  );
}

/** Shown until a saves folder is connected. */
export function ConnectPanel() {
  const { t } = useTranslation();
  const pendingHandle = useSaveStore((s) => s.pendingHandle);
  const reconnect = useSaveStore((s) => s.reconnect);

  if (pendingHandle) {
    return (
      <div className="saves__connect">
        <p>{t('saves.reconnectHint')}</p>
        <button className="button button--primary" onClick={() => void reconnect()}>
          <ItemIcon id="(BC)130" scale={1} tooltip={false} />
          {t('saves.reconnect')}
        </button>
      </div>
    );
  }

  return (
    <div className="saves__connect">
      <p>{t('saves.intro')}</p>
      <CopyPath />
      {supportsDirectoryAccess() ? (
        <LiveSetupGuide />
      ) : (
        <>
          <FolderInput label={t('saves.fallback')} primary />
          <p className="saves__hint">{t('saves.fallbackHint')}</p>
        </>
      )}
    </div>
  );
}

function SaveCard({ summary, selected, disabled, onSelect }: { summary: SaveSummary; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const hours = Math.floor(summary.millisecondsPlayed / 3_600_000);
  return (
    <button className={selected ? 'save-card box save-card--selected' : 'save-card box'} onClick={onSelect} aria-pressed={selected} disabled={disabled}>
      <span className="save-card__title">{summary.farmName}</span>
      <span className="save-card__player">{summary.playerName}</span>
      <span className="save-card__date">
        <SeasonIcon season={summary.season} />
        {t('saves.day', { day: summary.day, season: t(`common.seasons.${summary.season}`), year: summary.year })}
      </span>
      <span className="save-card__meta">
        <span>{summary.money.toLocaleString()}g</span>
        <span>{t('saves.playtime', { hours })}</span>
        <span>{t('saves.version', { version: summary.gameVersion })}</span>
      </span>
    </button>
  );
}

export function SaveList() {
  const { t } = useTranslation();
  const summaries = useSaveStore((s) => s.summaries);
  const folder = useSaveStore((s) => s.folder);
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const selectSave = useSaveStore((s) => s.selectSave);
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  const pendingHandle = useSaveStore((s) => s.pendingHandle);
  const reconnect = useSaveStore((s) => s.reconnect);
  const cachedFolders = useSaveStore((s) => s.cachedFolders);
  const mode = source?.live ? 'live' : source ? 'snapshot' : 'cached';

  return (
    <section>
      <div className="saves__header">
        <h2>{t('saves.list')}</h2>
        <span className={mode === 'live' ? 'saves__mode saves__mode--live' : 'saves__mode'}>{t(mode === 'cached' ? 'saves.cachedMode' : `saves.${mode}`)}</span>
        {pendingHandle && !source ? (
          <button className="button button--primary" onClick={() => void reconnect()}>
            {t('saves.cachedLive')}
          </button>
        ) : supportsDirectoryAccess() ? (
          <button className="button" onClick={() => void connectDirectory()}>
            {t('saves.change')}
          </button>
        ) : (
          <FolderInput label={t('saves.change')} />
        )}
      </div>
      {summaries.length === 0 && status !== 'listing' && <p>{t('saves.none')}</p>}
      {!source?.live && !pendingHandle && supportsDirectoryAccess() && (
        <details className="saves__guide">
          <summary className="button">{t('saves.guide.title')}</summary>
          <LiveSetupGuide />
        </details>
      )}
      <div className="saves__grid">
        {summaries.map((s) => (
          <SaveCard
            key={s.folder}
            summary={s}
            selected={s.folder === folder}
            // Without folder access, only saves already cached in the browser can open.
            disabled={!source && !pendingHandle && !cachedFolders[s.folder]}
            onSelect={() => void selectSave(s.folder)}
          />
        ))}
      </div>
    </section>
  );
}
