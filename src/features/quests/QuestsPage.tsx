import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, QuestState, SaveData, SpecialOrderState } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { FishWhere, useLocationName } from '@/features/fish/FishInfo';
import { usePinStore } from '@/store/pinStore';
import { ItemIcon, NpcHead, Progress } from '@/ui';
import './quests.css';

/** Toggle to mark a quest (or fish) on the map. */
export function PinButton({ kind, id, label }: { kind: 'quests' | 'fish'; id: string; label?: string }) {
  const { t } = useTranslation();
  const pinned = usePinStore((s) => s[kind].includes(id));
  const toggle = usePinStore((s) => s.toggle);
  return (
    <button className={pinned ? 'button button--primary' : 'button'} aria-pressed={pinned} onClick={() => toggle(kind, id)}>
      {pinned ? t('quests.pinned') : label ?? t('quests.pin')}
    </button>
  );
}

/** One-line "how to do it" for a quest, by quest type. */
function HowTo({ quest }: { quest: QuestState }) {
  const { t } = useTranslation();
  const name = useGameName();
  const place = useLocationName();
  const npc = quest.npc ? name(gameData().npcs[quest.npc]?.n) || quest.npc : '';
  const item = quest.item ? name(getItem(quest.item)?.n) : '';
  switch (quest.type) {
    case 'ItemDeliveryQuest':
      return <span>{t('quests.how.delivery', { item, npc })}</span>;
    case 'FishingQuest':
      return (
        <span className="quest__how-fish">
          {t('quests.how.fishing', { count: quest.count ?? 1, item })}
          {quest.item && <FishWhere id={quest.item} />}
        </span>
      );
    case 'SlayMonsterQuest':
      return <span>{t('quests.how.slay', { count: quest.count ?? 1, monster: quest.monster ?? '' })}</span>;
    case 'ResourceCollectionQuest':
      return <span>{t('quests.how.resource', { count: quest.count ?? 1, item, npc })}</span>;
    case 'LostItemQuest':
      return <span>{t('quests.how.lost', { item, place: quest.location ? place(quest.location) : '', x: quest.tile?.[0], y: quest.tile?.[1], npc })}</span>;
    case 'SocializeQuest':
      return <span>{t('quests.how.socialize')}</span>;
    case 'GoSomewhereQuest':
      return <span>{t('quests.how.go', { place: quest.location ? place(quest.location) : '' })}</span>;
    default:
      return <span>{quest.objective}</span>;
  }
}

function QuestCard({ quest }: { quest: QuestState }) {
  const { t } = useTranslation();
  const mappable = !!(quest.npc || quest.location || quest.type === 'FishingQuest');
  return (
    <article className="quest box">
      <header className="quest__header">
        {quest.npc && <NpcHead npc={quest.npc} />}
        {quest.item && <ItemIcon id={quest.item} />}
        <h3>{quest.title}</h3>
        {quest.daysLeft > 0 && <span className="quest__days">{t('quests.daysLeft', { count: quest.daysLeft })}</span>}
      </header>
      <p className="quest__objective">{quest.objective}</p>
      <p className="quest__how">
        <strong>{t('quests.howTitle')}</strong> <HowTo quest={quest} />
      </p>
      {quest.description && <p className="cc-summary__hint">{quest.description}</p>}
      <footer className="quest__footer">
        {quest.reward > 0 && <span>{t('quests.reward', { reward: quest.reward.toLocaleString() })}</span>}
        {mappable && (
          <>
            <PinButton kind="quests" id={quest.id} />
            {quest.type === 'FishingQuest' && quest.item && <PinButton kind="fish" id={quest.item} label={t('quests.pinFish')} />}
            <Link to="/map" className="button">
              {t('quests.openMap')}
            </Link>
          </>
        )}
      </footer>
    </article>
  );
}

function OrderCard({ order, save }: { order: SpecialOrderState; save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  const daysLeft = order.dueDate - (save.players[0]?.stats.daysPlayed ?? 0);
  return (
    <article className="quest box">
      <header className="quest__header">
        {gameData().npcs[order.requester] && <NpcHead npc={order.requester} />}
        <h3>{t(order.type === 'Qi' ? 'quests.qiOrder' : 'quests.townOrder', { name: name(gameData().npcs[order.requester]?.n) || order.requester })}</h3>
        {daysLeft > 0 && <span className="quest__days">{t('quests.daysLeft', { count: daysLeft })}</span>}
      </header>
      {order.objectives.map((o, i) => (
        <div key={i} className="quest__objective">
          <span>{o.description}</span>
          {o.max > 1 && <Progress value={o.current} max={o.max} />}
        </div>
      ))}
    </article>
  );
}

function Quests({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const quests = player.quests.filter((q) => !q.completed);
  return (
    <div>
      <h2>{t('quests.title', { name: player.name })}</h2>
      {quests.length === 0 && <p>{t('quests.none')}</p>}
      <div className="quest-grid">
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} />
        ))}
      </div>
      {save.specialOrders.length > 0 && (
        <>
          <h2 className="quest-section">{t('quests.ordersTitle')}</h2>
          <div className="quest-grid">
            {save.specialOrders.map((o) => (
              <OrderCard key={o.key} order={o} save={save} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function QuestsPage() {
  return <RequireSave>{(save, player) => <Quests save={save} player={player} />}</RequireSave>;
}
