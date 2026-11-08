import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave } from '@/store/saveStore';
import type { Player, SaveData } from '@/save/model';
import { ItemIcon, NpcHead } from '@/ui';
import { SHOPS } from '@/features/shops/catalog';
import { shopStock } from '@/features/shops/stock';
import './search.css';

interface Result {
  key: string;
  group: 'items' | 'people' | 'shops';
  icon: ReactNode;
  title: string;
  /** Extra lines: where it's sold today, recipes, bundles. */
  details?: string[];
  to: string;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Today's stock of every open shop, item id → shop ids. */
function soldToday(save: SaveData, player: Player): Map<string, string[]> {
  const day = { ...save.date, daysPlayed: player.stats.daysPlayed ?? 0 };
  const out = new Map<string, string[]>();
  for (const shop of SHOPS) {
    if (shop.open && !shop.open(day, save)) continue;
    for (const entry of shopStock(shop.id, save, player, day).items) out.set(entry.id, [...(out.get(entry.id) ?? []), shop.id]);
  }
  return out;
}

/** Item → recipes that use it, and → Community Center bundles that ask for it. */
function usesIndex(save: SaveData | null) {
  const recipes = new Map<string, string[]>();
  for (const kind of ['cooking', 'crafting'] as const) {
    for (const [recipe, list] of Object.entries(gameData().gameCollections.ingredients[kind])) {
      const output = gameData().achievementGoals[kind === 'cooking' ? 'cookingOutputs' : 'craftingOutputs'][recipe];
      for (const [id] of list) recipes.set(id, [...(recipes.get(id) ?? []), output ?? recipe]);
    }
  }
  const bundles = new Map<string, Array<[string, string]>>();
  for (const raw of Object.values(save?.communityCenter.bundleData ?? {})) {
    // "Name/reward/id count quality .../color/required/sprite/displayName"
    const fields = raw.split('/');
    const ids = fields[2]?.split(' ') ?? [];
    for (let i = 0; i + 2 < ids.length; i += 3) {
      const id = ids[i].startsWith('(') ? ids[i] : `(O)${ids[i]}`;
      const english = fields[0];
      const names = gameData().bundles.names[english] ?? [english, fields[6] || english];
      bundles.set(id, [...(bundles.get(id) ?? []), names]);
    }
  }
  return { recipes, bundles };
}

/** Sidebar search over items, villagers and shops; Enter opens the first result, arrows move. */
export function Search() {
  const { t } = useTranslation();
  const name = useGameName();
  const navigate = useNavigate();
  const { save, player } = useCurrentSave();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Built lazily the first time someone searches, then kept for the day.
  const sold = useMemo(() => (save && player && query.length > 1 ? soldToday(save, player) : null), [save, player, query.length > 1]);
  const uses = useMemo(() => usesIndex(save), [save]);

  const results = useMemo<Result[]>(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    const { items, npcs } = gameData();
    const out: Result[] = [];
    for (const [id, item] of Object.entries(items)) {
      if (!normalize(name(item.n)).includes(q)) continue;
      const shops = sold?.get(id) ?? [];
      const recipes = uses.recipes.get(id) ?? [];
      const bundles = uses.bundles.get(id) ?? [];
      const details = [
        shops.length ? t('search.soldAt', { shops: [...new Set(shops)].map((s) => t(`shops.name.${s}`)).join(', ') }) : '',
        recipes.length ? t('search.usedIn', { count: recipes.length, list: [...new Set(recipes)].slice(0, 3).map((r) => (r.startsWith('(') ? name(gameData().items[r]?.n) : r)).join(', ') }) : '',
        bundles.length ? t('search.bundles', { list: [...new Set(bundles.map((b) => name(gameData().bundles.format).replace('{0}', name(b))))].join(', ') }) : '',
      ].filter(Boolean);
      out.push({
        key: id,
        group: 'items',
        icon: <ItemIcon id={id} scale={1} tooltip={false} />,
        title: name(item.n),
        details,
        to: shops.length ? `/shops/${shops[0]}` : '/collections/shipped',
      });
      if (out.length >= 8) break;
    }
    for (const [id, npc] of Object.entries(npcs)) {
      if (npc.social === 3 || !normalize(name(npc.n)).includes(q)) continue;
      out.push({ key: `npc-${id}`, group: 'people', icon: <NpcHead npc={id} scale={1} />, title: name(npc.n), to: '/relationships' });
    }
    for (const shop of SHOPS) {
      const title = t(`shops.name.${shop.id}`);
      if (normalize(title).includes(q))
        out.push({ key: `shop-${shop.id}`, group: 'shops', icon: <ItemIcon id={shop.icon ?? '(O)472'} scale={1} tooltip={false} />, title, to: `/shops/${shop.id}` });
    }
    return out.slice(0, 16);
  }, [query, sold, uses, name, t]);

  const go = (r: Result) => {
    navigate(r.to);
    setQuery('');
    input.current?.blur();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setQuery('');
    else if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && results[active]) go(results[active]);
    else return;
    e.preventDefault();
  };

  return (
    <div className="search">
      <input
        ref={input}
        className="search__input box"
        type="search"
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
        aria-label={t('search.placeholder')}
      />
      {query.trim().length > 1 &&
        createPortal(
          <div className="search__panel box" role="listbox" style={panelPosition(input.current)}>
            {results.length === 0 && <p className="cc-summary__hint">{t('search.none')}</p>}
            {(['items', 'people', 'shops'] as const).map((group) => {
              const list = results.filter((r) => r.group === group);
              if (!list.length) return null;
              return (
                <section key={group}>
                  <h4>{t(`search.group.${group}`)}</h4>
                  {list.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      role="option"
                      aria-selected={results.indexOf(r) === active}
                      className={results.indexOf(r) === active ? 'search__result search__result--active' : 'search__result'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(r)}
                    >
                      <span className="search__icon">{r.icon}</span>
                      <span className="search__text">
                        <strong>{r.title}</strong>
                        {r.details?.map((d) => (
                          <small key={d}>{d}</small>
                        ))}
                      </span>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** The sidebar scrolls and clips, so the panel lives in the page layer, right under the box. */
function panelPosition(el: HTMLElement | null) {
  const r = el?.getBoundingClientRect();
  return r ? { top: r.bottom + 4, left: r.left } : undefined;
}
