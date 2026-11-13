import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { ItemIcon, NpcHead, Tooltip } from '@/ui';
import { jojaMartGone, SHOP_AREAS, shopArea, SHOPS, type ShopInfo } from './catalog';
import '@/features/farm/farm.css';
import { groupStock } from './groups';
import { Constructions, ShopAnimals, ToolUpgrades } from './Constructions';
import { shopStock, type ShopDay, type ShopsData, type StockEntry } from './stock';
import './shops.css';
import { PresenceDots } from '@/features/share/Presence';

/** Data/Shops currency: 0 gold, 1 star tokens, 2 Qi coins, 4 Qi gems. */
const CURRENCY_ICON: Record<number, string | undefined> = {
  1: '(O)PrizeTicket',
  4: '(O)858',
};

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

/** Things a shop sells outside Data/Shops: buildings, animals, tool upgrades. */
const EXTRA_SECTIONS: Record<string, ReactNode> = {
  Carpenter: <Constructions builder="Robin" />,
  Wizard: <Constructions builder="Wizard" />,
  AnimalShop: <ShopAnimals />,
  Blacksmith: <ToolUpgrades />,
};

const ShopIcon = ({ info, scale = 2 }: { info: ShopInfo; scale?: number }) =>
  info.npc ? <NpcHead npc={info.npc} scale={scale} /> : info.icon ? <ItemIcon id={info.icon} scale={scale} tooltip={false} /> : null;

/** The selected shop: everything it sells on the chosen day. */
function ShopView({ info, open, save, player, day, query }: { info: ShopInfo; open: boolean; save: SaveData; player: Player; day: ShopDay; query: string }) {
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
          {!open && <span className="shop__tag shop__tag--closed">{t('shops.closedToday')}</span>}
        </div>
      </header>
      {uncertainFrom !== null && <p className="shop__warn">{t('shops.uncertain')}</p>}
      {shown.length === 0 && !EXTRA_SECTIONS[info.id] && <p className="cc-summary__hint">{t('shops.nothing')}</p>}
      {!open && <p className="cc-summary__hint">{t('shops.closedNote')}</p>}
      {groupStock(shown).map(([group, entries]) => (
        <section key={group} className="shop__group">
          <h3 className="shop__group-title">
            {t(`shops.group.${group}`)} ({entries.length})
          </h3>
          <ul className="shop__items dashed-list">
            {entries.map((entry, i) => {
              const item = getItem(entry.id);
              const late = uncertainFrom !== null && items.indexOf(entry) >= uncertainFrom;
              return (
                <li key={`${entry.id}-${i}`} className={['shop-row', entry.maybe || late ? 'shop-row--maybe' : ''].join(' ')}>
                  <ItemIcon id={entry.id} tooltip={false} />
                  <span className="shop-row__name">
                    <span>
                      {item ? name(item.n) : entry.id}
                      {entry.recipe && <em> · {t('shops.recipe')}</em>}
                      {entry.stack > 1 && <em> ×{entry.stack}</em>}
                      {(entry.maybe || late) && (
                        <Tooltip text={t(entry.maybe ? 'shops.maybe' : 'shops.uncertainItem')}>
                          <span className="shop-row__maybe">?</span>
                        </Tooltip>
                      )}
                    </span>
                    {entry.stock !== null && entry.stock < 100 && <small className="shop-row__stock">{t('shops.stock', { count: entry.stock })}</small>}
                  </span>
                  <Price entry={entry} currency={shopCurrency(info.id)} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!query && EXTRA_SECTIONS[info.id]}
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
  const listed = SHOPS.filter((s) => (s.id.startsWith('Festival_') ? isOpen(s) : !(s.id === 'Joja' && jojaMartGone(save))));
  const query = search.trim().toLowerCase();
  // While searching, count matches per shop so the list says where to buy it.
  const matches = useMemo(() => {
    if (!query) return null;
    return Object.fromEntries(listed.map((s) => [s.id, shopStock(s.id, save, player, day).items.filter((i) => name(getItem(i.id)?.n).toLowerCase().includes(query)).length]));
  }, [query, listed, save, player, day, name]);
  const visible = matches ? listed.filter((s) => matches[s.id] > 0) : listed;
  const selected = visible.find((s) => s.id === selectedId) ?? visible[0] ?? listed.find((s) => s.id === selectedId) ?? listed[0];

  return (
    <div className="shops">
      <nav className="tab-groups" role="tablist" aria-label={t('nav.shops')}>
        {SHOP_AREAS.map((area) => {
          const inArea = visible.filter((s) => shopArea(s.id) === area);
          if (!inArea.length) return null;
          return (
            <div key={area} className="tab-group">
              <span className="tab-group__label">{t(`shops.area.${area}`)}</span>
              <div className="shops__tabs">
                {inArea.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={s.id === selected?.id}
                    className={[s.id === selected?.id ? 'button button--primary' : 'button', 'shops__tab', isOpen(s) ? '' : 'shops__tab--closed'].join(' ')}
                    title={isOpen(s) ? undefined : t('shops.closedToday')}
                    onClick={() => navigate(`/shops/${s.id}`)}
                  >
                    <ShopIcon info={s} scale={1} />
                    {t(`shops.name.${s.id}`)}
                    {matches && <em>({matches[s.id]})</em>}
                    <PresenceDots to={`/shops/${s.id}`} exact />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="shops__bar">
        <input className="shops__search" type="search" placeholder={t('shops.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="cc-summary__hint">
          {t('shops.dayLabel', {
            day: day.day,
            season: t(`common.seasons.${day.season}`),
            year: day.year,
          })}
        </p>
      </div>
      {visible.length === 0 && <p className="cc-summary__hint">{t('shops.nothing')}</p>}
      {selected && visible.length > 0 && <ShopView info={selected} open={isOpen(selected)} save={save} player={player} day={day} query={query} />}
    </div>
  );
}

export function ShopsPage() {
  return <RequireSave>{(save, player) => <Shops save={save} player={player} />}</RequireSave>;
}
