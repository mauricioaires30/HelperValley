import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { totalCount } from '@/save/inventory';
import { RequireSave } from '@/features/saves/RequireSave';
import { ItemIcon, Progress } from '@/ui';
import { buildRooms, jojaProgress, type Bundle, type BundleSlot, type Room } from './bundles';
import { SlotTooltip } from './SlotTooltip';
import './cc.css';

/** Accent per bundle color index, sampled from the game's Junimo note colors. */
const BUNDLE_COLORS = ['#5ab43c', '#9a5bc6', '#e8892b', '#e6c234', '#d9473b', '#3b8fd9', '#38b4a6'];

function Slot({ slot }: { slot: BundleSlot }) {
  const { t } = useTranslation();
  if (slot.id === 'money') {
    return (
      <span className={slot.done ? 'cc-money cc-money--done box' : 'cc-money box'}>
        {slot.count.toLocaleString()}g
      </span>
    );
  }
  const have = totalCount(slot.owned);
  return (
    <span className={`slot-state${slot.done ? ' slot-state--done' : have >= slot.count ? ' slot-state--ready' : ''}`}>
      <SlotTooltip slot={slot}>
        <ItemIcon id={slot.id} slot quality={slot.quality} count={slot.count} faded={!slot.done && have === 0} tooltip={false} />
      </SlotTooltip>
      {!slot.done && have >= slot.count && <span className="slot-badge">{t('cc.have')}</span>}
    </span>
  );
}

function BundleCard({ bundle }: { bundle: Bundle }) {
  const { t } = useTranslation();
  const name = useGameName();
  const format = gameData().bundles.format;
  return (
    <article className={bundle.complete ? 'cc-bundle box cc-bundle--complete' : 'cc-bundle box'} style={{ '--bundle-color': BUNDLE_COLORS[bundle.color] } as never}>
      <header className="cc-bundle__header">
        <h4>{name(format).replace('{0}', name(bundle.name))}</h4>
        {bundle.reward && (
          <span className="cc-bundle__reward" title={t('cc.reward')}>
            → <ItemIcon id={bundle.reward.id} scale={1} />
            {bundle.reward.count > 1 && `×${bundle.reward.count}`}
          </span>
        )}
      </header>
      <Progress value={bundle.doneCount} max={bundle.required} />
      {bundle.required < bundle.slots.length && <p className="cc-bundle__pick">{t('cc.pick', { count: bundle.required, total: bundle.slots.length })}</p>}
      <div className="slot-grid">
        {bundle.slots.map((slot, i) => (
          <Slot key={i} slot={slot} />
        ))}
      </div>
    </article>
  );
}

function RoomPanel({ room, onlyMissing }: { room: Room; onlyMissing: boolean }) {
  const name = useGameName();
  const { t } = useTranslation();
  const bundles = onlyMissing ? room.bundles.filter((b) => !b.complete) : room.bundles;
  const done = room.bundles.filter((b) => b.complete).length;
  if (onlyMissing && bundles.length === 0) return null;
  return (
    <section className="cc-room">
      <h3>
        {name(room.name)}
        <span className="cc-room__count">
          {room.complete ? t('cc.roomDone') : `${done}/${room.bundles.length}`}
        </span>
      </h3>
      <div className="cc-room__bundles">
        {bundles.map((b) => (
          <BundleCard key={b.index} bundle={b} />
        ))}
      </div>
    </section>
  );
}

/** Every missing slot, deduplicated, split by "already have it" vs "still need it". */
function MissingSummary({ rooms }: { rooms: Room[] }) {
  const { t } = useTranslation();
  const missing = rooms
    .flatMap((r) => r.bundles.filter((b) => !b.complete).flatMap((b) => b.slots.filter((s) => !s.done && s.id !== 'money')))
    .filter((s, i, all) => all.findIndex((o) => o.id === s.id && o.quality === s.quality) === i);
  if (missing.length === 0) return null;
  const ready = missing.filter((s) => totalCount(s.owned) >= s.count);
  const needed = missing.filter((s) => totalCount(s.owned) < s.count);
  return (
    <section className="cc-summary inset">
      {ready.length > 0 && (
        <>
          <h3>{t('cc.readyTitle', { count: ready.length })}</h3>
          <p className="cc-summary__hint">{t('cc.readyHint')}</p>
          <div className="slot-grid">
            {ready.map((s) => (
              <Slot key={s.id + s.quality} slot={s} />
            ))}
          </div>
        </>
      )}
      {needed.length > 0 && (
        <>
          <h3>{t('cc.neededTitle', { count: needed.length })}</h3>
          <div className="slot-grid">
            {needed.map((s) => (
              <Slot key={s.id + s.quality} slot={s} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function JojaView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const projects = jojaProgress(save);
  return (
    <section>
      <h2>{t('cc.jojaTitle')}</h2>
      <Progress value={projects.filter((p) => p.done).length} max={projects.length} />
      <ul className="cc-joja">
        {projects.map((p) => (
          <li key={p.flag} className={p.done ? 'box cc-joja--done' : 'box'}>
            <strong>{t(`cc.joja.${p.unlock}`)}</strong>
            <span>{p.cost.toLocaleString()}g</span>
            <span>{p.done ? t('cc.purchased') : t('cc.notPurchased')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommunityCenter({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const rooms = useMemo(() => buildRooms(save, gameData().bundles), [save]);

  if (save.communityCenter.isJoja) return <JojaView save={save} />;

  const bundles = rooms.flatMap((r) => r.bundles);
  const coreRooms = rooms.filter((r) => r.id !== 'AbandonedJojaMart');
  return (
    <div className="cc">
      <header className="cc__header">
        <h2>{t('cc.title')}</h2>
        <label className="cc__filter">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {t('cc.onlyMissing')}
        </label>
      </header>
      <div className="cc__totals">
        <span>{t('cc.rooms')}</span>
        <Progress value={coreRooms.filter((r) => r.complete).length} max={coreRooms.length} />
        <span>{t('cc.bundles')}</span>
        <Progress value={bundles.filter((b) => b.complete).length} max={bundles.length} />
      </div>
      <MissingSummary rooms={rooms} />
      {rooms.map((room) => (
        <RoomPanel key={room.id} room={room} onlyMissing={onlyMissing} />
      ))}
    </div>
  );
}

export function CommunityCenterPage() {
  return <RequireSave>{(save) => <CommunityCenter save={save} />}</RequireSave>;
}
