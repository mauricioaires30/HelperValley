import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { ItemIcon, NpcHead, Tooltip } from '@/ui';
import { SHOPS, weekday, type ShopInfo } from './catalog';
import { shiftDay, shopStock, type ShopDay, type ShopsData, type StockEntry } from './stock';
import './shops.css';

const DAYS_AHEAD = 14;
/** Data/Shops currency: 0 gold, 1 star tokens, 2 Qi coins, 4 Qi gems. */
const CURRENCY_ICON: Record<number, string | undefined> = { 1: '(O)PrizeTicket', 4: '(O)858' };

function Price({ entry, currency }: { entry: StockEntry; currency: number }) {
  const { t } = useTranslation();
  if (entry.trade) {
    return (
      <span className="shop-row__price">
        {entry.price > 0 && <span>{entry.price.toLocaleString()}g +</span>}
        <ItemIcon id={entry.trade.id} scale={1} />
        <span>×{entry.trade.amount}</span>
      </span>
    );
  }
  const icon = CURRENCY_ICON[currency];
  return (
    <span className="shop-row__price">
      {entry.price.toLocaleString()}
      {icon ? <ItemIcon id={icon} scale={1} /> : currency === 2 ? ` ${t('shops.qiCoins')}` : 'g'}
    </span>
  );
}

function ShopCard({ info, save, player, day, query }: { info: ShopInfo; save: SaveData; player: Player; day: ShopDay; query: string }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { items, uncertainFrom } = useMemo(() => shopStock(info.id, save, player, day), [info.id, save, player, day]);
  const shown = query ? items.filter((i) => name(getItem(i.id)?.n).toLowerCase().includes(query)) : items;
  if (query && !shown.length) return null;

  return (
    <details className="panel shop" open={!!query || info.rotates}>
      <summary className="shop__head">
        {info.npc ? <NpcHead npc={info.npc} /> : info.icon ? <ItemIcon id={info.icon} tooltip={false} /> : null}
        <strong>{t(`shops.name.${info.id}`)}</strong>
        <span className="shop__count">{t('shops.items', { count: items.length })}</span>
        {info.rotates && <span className="shop__tag">{t('shops.rotates')}</span>}
      </summary>
      {uncertainFrom !== null && <p className="shop__warn">{t('shops.uncertain')}</p>}
      <ul className="shop__items">
        {shown.map((entry, i) => {
          const item = getItem(entry.id);
          const late = uncertainFrom !== null && items.indexOf(entry) >= uncertainFrom;
          return (
            <li key={`${entry.id}-${i}`} className={['shop-row', entry.maybe || late ? 'shop-row--maybe' : ''].join(' ')}>
              <ItemIcon id={entry.id} tooltip={false} />
              <span className="shop-row__name">
                {item ? name(item.n) : entry.id}
                {entry.recipe && <em> · {t('shops.recipe')}</em>}
                {entry.stack > 1 && <em> ×{entry.stack}</em>}
              </span>
              <Price entry={entry} currency={shopCurrency(info.id)} />
              <span className="shop-row__stock">
                {entry.stock !== null && entry.stock < 100 ? t('shops.stock', { count: entry.stock }) : ''}
                {(entry.maybe || late) && (
                  <Tooltip text={t(entry.maybe ? 'shops.maybe' : 'shops.uncertainItem')}>
                    <span className="shop-row__maybe">?</span>
                  </Tooltip>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

const shopCurrency = (id: string) => (gameData().shops as ShopsData).shops[id]?.currency ?? 0;

function Shops({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const today: ShopDay = useMemo(() => ({ ...save.date, daysPlayed: player.stats.daysPlayed ?? 0 }), [save.date, player.stats.daysPlayed]);
  const day = useMemo(() => shiftDay(today, offset), [today, offset]);
  const open = SHOPS.filter((s) => !s.open || s.open(day, save));
  const closed = SHOPS.filter((s) => s.open && !s.open(day, save) && !s.id.startsWith('Festival_'));
  const query = search.trim().toLowerCase();

  return (
    <div className="shops">
      <div className="panel shops__bar">
        <div className="shops__days" role="tablist" aria-label={t('shops.day')}>
          {Array.from({ length: DAYS_AHEAD }, (_, i) => {
            const d = shiftDay(today, i);
            return (
              <button key={i} type="button" role="tab" aria-selected={i === offset} className={i === offset ? 'button button--primary' : 'button'} onClick={() => setOffset(i)}>
                {i === 0 ? t('shops.today') : t(`shops.weekday.${weekday(d)}`)} {d.day}
              </button>
            );
          })}
        </div>
        <input className="shops__search" type="search" placeholder={t('shops.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="cc-summary__hint">
          {t('shops.dayLabel', { day: day.day, season: t(`common.seasons.${day.season}`), year: day.year })} · {t('shops.how')}
        </p>
        {closed.length > 0 && <p className="cc-summary__hint">{t('shops.closed', { names: closed.map((s) => t(`shops.name.${s.id}`)).join(', ') })}</p>}
      </div>
      {open.map((info) => (
        <ShopCard key={info.id} info={info} save={save} player={player} day={day} query={query} />
      ))}
    </div>
  );
}

export function ShopsPage() {
  return <RequireSave>{(save, player) => <Shops save={save} player={player} />}</RequireSave>;
}
