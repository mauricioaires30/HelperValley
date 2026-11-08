import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { ChildState, Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { Hearts, ItemIcon, Popover, Portrait, Sprite } from '@/ui';
import { ownedObjectIds, TASTES, tasteGroups } from './gifts';
import { describeEvent } from './eventConditions';
import { buildRelationships, POINTS_PER_HEART, type Relationship } from './relationships';
import './relationships.css';

type Sort = 'groups' | 'hearts' | 'birthday' | 'name';

/** Where each villager lives, to group the cards (the spouse goes in Family). */
const HOME: Record<string, string> = {
  Pierre: 'town',
  Caroline: 'town',
  Abigail: 'town',
  Lewis: 'town',
  Gus: 'town',
  Emily: 'town',
  Haley: 'town',
  Jodi: 'town',
  Kent: 'town',
  Sam: 'town',
  Vincent: 'town',
  Alex: 'town',
  George: 'town',
  Evelyn: 'town',
  Harvey: 'town',
  Pam: 'town',
  Penny: 'town',
  Clint: 'town',
  Robin: 'mountain',
  Demetrius: 'mountain',
  Maru: 'mountain',
  Sebastian: 'mountain',
  Linus: 'mountain',
  Marnie: 'forest',
  Jas: 'forest',
  Shane: 'forest',
  Leah: 'forest',
  Willy: 'beach',
  Elliott: 'beach',
  Sandy: 'desert',
  Leo: 'island',
};
const GROUPS = ['family', 'town', 'mountain', 'forest', 'beach', 'desert', 'island', 'other'] as const;
const groupOf = (rel: Relationship) => (rel.status === 'Married' || rel.status === 'Roommate' ? 'family' : (HOME[rel.npc] ?? 'other'));

/** Child sprite: babies use Baby(_dark), toddlers Toddler(_girl)(_dark) — first frame. */
function ChildSprite({ child }: { child: ChildState }) {
  const sheet = child.age >= 3 ? `Characters/Toddler${child.male ? '' : '_girl'}${child.dark ? '_dark' : ''}` : `Characters/Baby${child.dark ? '_dark' : ''}`;
  return child.age >= 3 ? <Sprite sheet={sheet} x={0} y={0} w={16} h={32} scale={2} /> : <Sprite sheet={sheet} x={0} y={0} w={22} h={16} scale={2} />;
}

/** Your children: age, hearts and whether you've talked today. */
function Children({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const children = save.children.filter((c) => !c.parent || c.parent === player.id || save.players.length === 1);
  if (children.length === 0) return null;
  return (
    <section className="rel-children">
      <h2>{t('rel.children.title')}</h2>
      <div className="rel-grid">
        {children.map((c) => {
          const f = player.friendships[c.name];
          return (
            <article key={c.name} className="rel box">
              <span className="rel-child__pic">
                <ChildSprite child={c} />
              </span>
              <div className="rel__body">
                <header className="rel__header">
                  <h3>{c.name}</h3>
                  <span className="rel__status">{t(`rel.children.age.${Math.min(3, c.age)}`)}</span>
                </header>
                <Hearts value={Math.floor((f?.points ?? 0) / POINTS_PER_HEART)} max={10} />
                <ul className="rel__facts">
                  <li>{t('rel.children.days', { count: c.daysOld })}</li>
                  <li className={f?.talkedToday ? 'rel__muted' : undefined}>{f?.talkedToday ? t('rel.children.talked') : t('rel.children.talk')}</li>
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

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
        <Hearts value={rel.hearts} max={rel.shownHearts} reachable={rel.maxHearts} possible={rel.shownHearts} />
        <ul className="rel__facts">
          {toNext > 0 && <li>{t('rel.toNext', { points: toNext })}</li>}
          {rel.hearts >= rel.maxHearts && rel.maxHearts === 8 && <li>{t('rel.bouquet')}</li>}
          <li className={giftsLeft === 0 ? 'rel__muted' : undefined}>{rel.giftsToday > 0 ? t('rel.giftedToday') : t('rel.giftsLeft', { count: giftsLeft })}</li>
          {rel.birthdayIn !== null && rel.birthdayIn <= 7 && (
            <li className="rel__birthday">{rel.birthdayIn === 0 ? t('rel.birthdayToday') : t('rel.birthdayIn', { count: rel.birthdayIn })}</li>
          )}
        </ul>
        <div className="rel__tastes">
          <TasteButtons npc={rel.npc} owned={owned} />
          {rel.events.length > 0 && (
            <Popover className="taste" label={t('rel.eventsLeft', { count: rel.events.filter((e) => !e.seen && !e.impossible).length })}>
              <strong>{t('rel.eventsTitle')}</strong>
              <ul className="rel__event-list">
                {rel.events.map((e) =>
                  // Seen or impossible events stay as a placeholder line, like a crossed-out entry.
                  e.seen || e.impossible ? (
                    <li key={e.id} className="rel__muted rel__event-done">
                      {t('rel.eventHearts', { count: e.hearts })} {e.seen ? t('rel.eventSeen') : t('rel.eventImpossible')}
                    </li>
                  ) : (
                    <li key={e.id} className={rel.hearts >= e.hearts ? 'rel__event--ready' : undefined}>
                      <strong>{t('rel.eventHearts', { count: e.hearts })}</strong> {describeEvent(e, t, name).join(' · ')}
                    </li>
                  ),
                )}
              </ul>
            </Popover>
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
  const [sort, setSort] = useState<Sort>('groups');
  const relationships = useMemo(() => buildRelationships(save, player), [save, player]);
  const owned = useMemo(() => ownedObjectIds(save), [save]);

  const [reversed, setReversed] = useState(false);
  const sorted = [...relationships].sort((a, b) => {
    let cmp: number;
    if (sort === 'birthday') cmp = (a.birthdayIn ?? 999) - (b.birthdayIn ?? 999);
    else if (sort === 'name') cmp = name(gameData().npcs[a.npc].n).localeCompare(name(gameData().npcs[b.npc].n));
    else cmp = b.points - a.points; // hearts, also the order inside each group
    return reversed ? -cmp : cmp;
  });

  return (
    <div>
      <header className="cc__header">
        <h2>{t('rel.title', { name: player.name })}</h2>
        <label className="cc__filter">
          {t('rel.sort')}
          <select className="box" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="groups">{t('rel.sortGroups')}</option>
            <option value="hearts">{t('rel.sortHearts')}</option>
            <option value="birthday">{t('rel.sortBirthday')}</option>
            <option value="name">{t('rel.sortName')}</option>
          </select>
          {sort !== 'groups' && (
            <>
              <button className="button" aria-pressed={reversed} onClick={() => setReversed(!reversed)} title={t('rel.reverse')}>
                {reversed ? '▲' : '▼'}
              </button>
              <button className="button" onClick={() => setSort('groups')} title={t('rel.clearSort')} aria-label={t('rel.clearSort')}>
                ✕
              </button>
            </>
          )}
        </label>
      </header>
      <Children save={save} player={player} />
      {sort === 'groups' ? (
        GROUPS.map((group) => {
          const list = sorted.filter((rel) => groupOf(rel) === group);
          if (!list.length) return null;
          return (
            <section key={group} className="rel-section">
              <h2 className="quest-section">
                {t(`rel.group.${group}`)} ({list.length})
              </h2>
              <div className="rel-grid">
                {list.map((rel) => (
                  <RelationshipCard key={rel.npc} rel={rel} owned={owned} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <div className="rel-grid">
          {sorted.map((rel) => (
            <RelationshipCard key={rel.npc} rel={rel} owned={owned} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RelationshipsPage() {
  return <RequireSave>{(save, player) => <Relationships save={save} player={player} />}</RequireSave>;
}
