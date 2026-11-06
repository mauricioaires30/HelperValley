import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { useLocationLabel } from '@/features/community-center/SlotTooltip';
import { ItemIcon, Progress, Tooltip } from '@/ui';
import { buildMuseum, type MuseumEntry } from './museum';
import './museum.css';

/** Treasure Trove and A Complete Collection. */
const MILESTONES = [40];

function Sources({ id }: { id: string }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { sources, places } = gameData().museum;
  const source = sources[id];
  const place = (key: string) => (places[key] ? name(places[key]) : t(`museum.place.${key}`));
  if (!source) return null;
  return (
    <>
      {source.geodes.length > 0 && (
        <span className="museum-tip__row">
          {t('museum.from')}
          {source.geodes.map((g) => (
            <ItemIcon key={g} id={g} scale={1} tooltip={false} />
          ))}
          {source.geodes.map((g) => name(getItem(g)?.n)).join(', ')}
        </span>
      )}
      {source.dig.length > 0 && (
        <span className="museum-tip__row">
          {t('museum.dig', { places: source.dig.map(place).join(', ') })}
        </span>
      )}
    </>
  );
}

function MuseumSlot({ entry }: { entry: MuseumEntry }) {
  const { t } = useTranslation();
  const name = useGameName();
  const label = useLocationLabel();
  const item = getItem(entry.id);
  const description = gameData().museum.descriptions[entry.id];
  const state = entry.status === 'donated' ? ' slot-state--done' : entry.status === 'owned' ? ' slot-state--ready' : '';
  return (
    <span className={`slot-state${state}`}>
      <Tooltip
        text={
          <span className="museum-tip">
            <strong>{name(item?.n)}</strong>
            <em>{t(`museum.status.${entry.status}`)}</em>
            {entry.owned.map((l) => (
              <span key={l.kind + l.where}>
                {label(l)}: {l.count}
              </span>
            ))}
            {entry.status !== 'donated' && <Sources id={entry.id} />}
            {description && <span className="museum-tip__desc">{name(description)}</span>}
          </span>
        }
      >
        <ItemIcon id={entry.id} slot faded={entry.status === 'missing'} tooltip={false} />
      </Tooltip>
      {entry.status === 'owned' && <span className="slot-badge">{t('museum.donate')}</span>}
    </span>
  );
}

function Museum({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const entries = useMemo(() => buildMuseum(save, gameData().museum), [save]);
  const donated = entries.filter((e) => e.status === 'donated').length;
  const ready = entries.filter((e) => e.status === 'owned');
  const visible = (kind: MuseumEntry['kind']) => entries.filter((e) => e.kind === kind && (!onlyMissing || e.status !== 'donated'));

  return (
    <div className="museum">
      <header className="cc__header">
        <h2>{t('museum.title')}</h2>
        <label className="cc__filter">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {t('cc.onlyMissing')}
        </label>
      </header>

      <div className="museum__progress">
        <Progress value={donated} max={entries.length} label={t('museum.title')} />
        <p className="cc-summary__hint">
          {MILESTONES.map((m) => (donated >= m ? t('museum.milestoneDone', { count: m }) : t('museum.milestone', { count: m, left: m - donated }))).join(' · ')}
        </p>
      </div>

      {ready.length > 0 && (
        <section className="inset cc-summary">
          <h3>{t('museum.readyTitle', { count: ready.length })}</h3>
          <div className="slot-grid">
            {ready.map((e) => (
              <MuseumSlot key={e.id} entry={e} />
            ))}
          </div>
        </section>
      )}

      {(['artifact', 'mineral'] as const).map((kind) => {
        const list = visible(kind);
        const total = entries.filter((e) => e.kind === kind);
        return (
          <section key={kind} className="museum__section">
            <h3>
              {t(`museum.${kind}s`)}
              <span className="cc-room__count">
                {total.filter((e) => e.status === 'donated').length}/{total.length}
              </span>
            </h3>
            <div className="slot-grid">
              {list.map((e) => (
                <MuseumSlot key={e.id} entry={e} />
              ))}
            </div>
          </section>
        );
      })}

      <p className="cc-summary__hint">{t('museum.legend')}</p>
    </div>
  );
}

export function MuseumPage() {
  return <RequireSave>{(save) => <Museum save={save} />}</RequireSave>;
}
