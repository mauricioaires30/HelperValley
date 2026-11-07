import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { usePinStore } from '@/store/pinStore';
import { ItemIcon } from '@/ui';

/** Search box to mark fish on the map, plus the list of marked fish with a remove button. */
export function FishPicker() {
  const { t } = useTranslation();
  const name = useGameName();
  const pinned = usePinStore((s) => s.fish);
  const toggle = usePinStore((s) => s.toggle);
  const [query, setQuery] = useState('');

  const fish = useMemo(() => Object.keys(gameData().fish).filter((id) => getItem(id)), []);
  const matches = query.length > 1 ? fish.filter((id) => name(getItem(id)?.n).toLowerCase().includes(query.toLowerCase()) && !pinned.includes(id)).slice(0, 6) : [];

  return (
    <div className="fish-picker">
      <input className="fish-picker__input" placeholder={t('map.fishSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
      {matches.map((id) => (
        <button key={id} className="fish-picker__row" onClick={() => (toggle('fish', id), setQuery(''))}>
          <ItemIcon id={id} tooltip={false} /> {name(getItem(id)?.n)}
        </button>
      ))}
      {pinned.length > 0 && (
        <ul className="fish-picker__list">
          {pinned.map((id) => (
            <li key={id}>
              <ItemIcon id={id} tooltip={false} />
              <span>{name(getItem(id)?.n)}</span>
              <button className="fish-picker__remove" onClick={() => toggle('fish', id)} aria-label={t('farm.remove')}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
