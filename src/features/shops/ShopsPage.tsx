import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { ItemIcon, NpcHead, Tooltip } from '@/ui';
import { SHOPS, type ShopInfo } from './catalog';
import { shopStock, type ShopDay, type ShopsData, type StockEntry } from './stock';
import './shops.css';

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

const ShopIcon = ({ info, scale = 2 }: { info: ShopInfo; scale?: number }) =>
  info.npc ? <NpcHead npc={info.npc} scale={scale} /> : info.icon ? <ItemIcon id={info.icon} scale={scale} tooltip={false} /> : null;

/** The selected shop: everything it sells on the chosen day. */
function ShopView({ info, save, player, day, query }: { info: ShopInfo; save: SaveData; player: Player; day: ShopDay; query: string }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { items, uncertainFrom } = useMemo(() => shopStock(info.id, save, player, day), [info.id, save, player, day]);
  const shown = query ? items.filter((i) => name(getItem(i.id)?.n).toLowerCase().includes(query)) : items;

  return (
    <section className="panel shop">
      <header className="shop__head">
        <ShopIcon info={info} scale={3} />
        <div>
          <h2>{t(`shops.name.${info.id}`)}</h2>
          <span className="shop__count">{t('shops.items', { count: items.length })}</span>
          {info.rotates && <span className="shop__tag">{t('shops.rotates')}</span>}
        </div>
      </header>
      {uncertainFrom !== null && <p className="shop__warn">{t('shops.uncertain')}</p>}
      {shown.length === 0 && <p className="cc-summary__hint">{t('shops.nothing')}</p>}
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
    </section>
  );
}

const shopCurrency = (id: string) => (gameData().shops as ShopsData).shops[id]?.currency ?? 0;

function Shops({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { shop: selectedId } = useParams<{ shop?: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  // Always the save's current day.
  const day: ShopDay = useMemo(() => ({ ...save.date, daysPlayed: player.stats.daysPlayed ?? 0 }), [save.date, player.stats.daysPlayed]);
  const isOpen = (s: ShopInfo) => !s.open || s.open(day, save);
  // Only the shops that are open (or around) today get a tab.
  const listed = SHOPS.filter(isOpen);
  const closed = SHOPS.filter((s) => !isOpen(s) && !s.id.startsWith('Festival_'));
  const query = search.trim().toLowerCase();
  // While searching, count matches per shop so the list says where to buy it.
  const matches = useMemo(() => {
    if (!query) return null;
    return Object.fromEntries(
      listed.map((s) => [s.id, shopStock(s.id, save, player, day).items.filter((i) => name(getItem(i.id)?.n).toLowerCase().includes(query)).length]),
    );
  }, [query, listed, save, player, day, name]);
  const visible = matches ? listed.filter((s) => matches[s.id] > 0) : listed;
  const selected = visible.find((s) => s.id === selectedId) ?? visible[0] ?? listed.find((s) => s.id === selectedId) ?? listed[0];

  return (
    <div className="shops">
      <nav className="shops__tabs" role="tablist" aria-label={t('nav.shops')}>
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === selected?.id}
            className={s.id === selected?.id ? 'button button--primary shops__tab' : 'button shops__tab'}
            onClick={() => navigate(`/shops/${s.id}`)}
          >
            <ShopIcon info={s} scale={1} />
            {t(`shops.name.${s.id}`)}
            {matches && <em>({matches[s.id]})</em>}
          </button>
        ))}
      </nav>
      <div className="shops__bar">
        <input className="shops__search" type="search" placeholder={t('shops.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="cc-summary__hint">
          {t('shops.dayLabel', { day: day.day, season: t(`common.seasons.${day.season}`), year: day.year })} · {t('shops.how')}
        </p>
        {closed.length > 0 && <p className="cc-summary__hint">{t('shops.closed', { names: closed.map((s) => t(`shops.name.${s.id}`)).join(', ') })}</p>}
      </div>
      {visible.length === 0 && <p className="cc-summary__hint">{t('shops.nothing')}</p>}
      {selected && visible.length > 0 && <ShopView info={selected} save={save} player={player} day={day} query={query} />}
    </div>
  );
}

export function ShopsPage() {
  return <RequireSave>{(save, player) => <Shops save={save} player={player} />}</RequireSave>;
}
