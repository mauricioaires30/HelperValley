import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { Hearts, ItemIcon, Popover, Portrait } from '@/ui';
import { ownedObjectIds, TASTES, tasteGroups } from './gifts';
import { describeEvent } from './eventConditions';
import { buildRelationships, POINTS_PER_HEART, type Relationship } from './relationships';
import './relationships.css';

type Sort = 'hearts' | 'birthday' | 'name';

function RelationshipCard({ rel, owned }: { rel: Relationship; owned: string[] }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { npcs } = gameData();
  const toNext = rel.hearts < rel.maxHearts ? POINTS_PER_HEART - (rel.points % POINTS_PER_HEART) : 0;
  const giftsLeft = Math.max(0, 2 - rel.giftsThisWeek);

  return (
    <article className="rel box">
      <Portrait npc={rel.npc} />
      <div className="rel__body">
        <header className="rel__header">
          <h3>{name(npcs[rel.npc].n)}</h3>
          {rel.status !== 'Friendly' && <span className="rel__status">{t(`rel.status.${rel.status}`, { defaultValue: rel.status })}</span>}
        </header>
        <Hearts value={rel.hearts} max={Math.max(10, rel.maxHearts)} />
        <ul className="rel__facts">
          {toNext > 0 && <li>{t('rel.toNext', { points: toNext })}</li>}
          {rel.hearts >= rel.maxHearts && rel.maxHearts === 8 && <li>{t('rel.bouquet')}</li>}
          <li className={giftsLeft === 0 ? 'rel__muted' : undefined}>
            {rel.giftsToday > 0 ? t('rel.giftedToday') : t('rel.giftsLeft', { count: giftsLeft })}
          </li>
          {rel.birthdayIn !== null && rel.birthdayIn <= 7 && (
            <li className="rel__birthday">{rel.birthdayIn === 0 ? t('rel.birthdayToday') : t('rel.birthdayIn', { count: rel.birthdayIn })}</li>
          )}
          {rel.nextEvent && (
            <li className={rel.nextEvent.unlocked ? 'rel__event rel__event--ready' : 'rel__event'}>
              {rel.nextEvent.unlocked ? t('rel.eventReady', { hearts: rel.nextEvent.hearts }) : t('rel.eventAt', { hearts: rel.nextEvent.hearts })}
              <span className="rel__how">
                {t('rel.how')} {describeEvent(rel.nextEvent, t, name).join(' · ')}
              </span>
            </li>
          )}
        </ul>
        <div className="rel__tastes">
          <TasteButtons npc={rel.npc} owned={owned} />
          {/* Seen events are gone for good, so only the ones still ahead are listed. */}
          {rel.events.some((e) => !e.seen) ? (
            <Popover className="taste" label={t('rel.eventsLeft', { count: rel.events.filter((e) => !e.seen).length })}>
              <strong>{t('rel.eventsTitle')}</strong>
              <ul className="rel__event-list">
                {rel.events
                  .filter((e) => !e.seen)
                  .map((e) => (
                    <li key={e.id} className={rel.hearts >= e.hearts ? 'rel__event--ready' : undefined}>
                      <strong>{t('rel.eventHearts', { count: e.hearts })}</strong> {describeEvent(e, t, name).join(' · ')}
                    </li>
                  ))}
              </ul>
            </Popover>
          ) : (
            rel.events.length > 0 && <span className="cc-summary__hint">{t('rel.allEventsSeen')}</span>
          )}
        </div>
      </div>
    </article>
  );
}

/** One button per taste; hovering shows every item and group in it, owned ones glowing. */
function TasteButtons({ npc, owned }: { npc: string; owned: string[] }) {
  const { t } = useTranslation();
  const groups = useMemo(() => tasteGroups(npc), [npc]);
  const ownedSet = useMemo(() => new Set(owned), [owned]);
  return (
    <>
      {TASTES.map((taste) => {
        const { items, groups: categories } = groups[taste];
        if (!items.length && !categories.length) return null;
        return (
          <Popover key={taste} className={`taste taste--${taste}`} label={`${t(`rel.taste.${taste}`)} ${items.length + categories.length}`}>
            <strong>{t(`rel.tasteTitle.${taste}`)}</strong>
            {categories.length > 0 && (
              <span className="taste__groups">
                {categories.map((g) => (
                  <span key={g} className="taste__group inset">
                    {t(`rel.group.${g}`, { defaultValue: g })}
                  </span>
                ))}
              </span>
            )}
            {items.length > 0 && (
              <span className="slot-grid">
                {items.map((id) => (
                  <span key={id} className={ownedSet.has(id) ? 'slot-state slot-state--ready' : 'slot-state'}>
                    <ItemIcon id={id} slot faded={!ownedSet.has(id)} />
                  </span>
                ))}
              </span>
            )}
            {items.some((id) => ownedSet.has(id)) && <span className="cc-summary__hint">{t('rel.tasteOwned')}</span>}
          </Popover>
        );
      })}
    </>
  );
}

function Relationships({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const [sort, setSort] = useState<Sort>('hearts');
  const relationships = useMemo(() => buildRelationships(save, player), [save, player]);
  const owned = useMemo(() => ownedObjectIds(save), [save]);

  const [reversed, setReversed] = useState(false);
  const sorted = [...relationships].sort((a, b) => {
    let cmp: number;
    if (sort === 'birthday') cmp = (a.birthdayIn ?? 999) - (b.birthdayIn ?? 999);
    else if (sort === 'name') cmp = name(gameData().npcs[a.npc].n).localeCompare(name(gameData().npcs[b.npc].n));
    else cmp = b.points - a.points;
    return reversed ? -cmp : cmp;
  });

  return (
    <div>
      <header className="cc__header">
        <h2>{t('rel.title', { name: player.name })}</h2>
        <label className="cc__filter">
          {t('rel.sort')}
          <select className="box" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="hearts">{t('rel.sortHearts')}</option>
            <option value="birthday">{t('rel.sortBirthday')}</option>
            <option value="name">{t('rel.sortName')}</option>
          </select>
          <button className="button" aria-pressed={reversed} onClick={() => setReversed(!reversed)} title={t('rel.reverse')}>
            {reversed ? '▲' : '▼'}
          </button>
        </label>
      </header>
      <p className="cc-summary__hint">{t('rel.hint')}</p>
      <div className="rel-grid">
        {sorted.map((rel) => (
          <RelationshipCard key={rel.npc} rel={rel} owned={owned} />
        ))}
      </div>
    </div>
  );
}

export function RelationshipsPage() {
  return <RequireSave>{(save, player) => <Relationships save={save} player={player} />}</RequireSave>;
}
