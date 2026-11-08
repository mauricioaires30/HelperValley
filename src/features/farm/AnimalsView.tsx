import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { FarmAnimalState, SaveData } from '@/save/model';
import { Hearts, ItemIcon, Sprite } from '@/ui';
import { HayCard } from './FarmOverview';


/**
 * Pets, horses and farm animals: hearts, mood and today's chores
 * (fill the pet bowl, pet the animals that no auto-petter covers).
 */
type AnimalSort = 'type' | 'name' | 'hearts' | 'pet';

function animalOrder(sort: AnimalSort, a: FarmAnimalState, b: FarmAnimalState): number {
  const byName = a.name.localeCompare(b.name);
  if (sort === 'name') return byName;
  if (sort === 'hearts') return b.friendship - a.friendship || byName;
  // Animals still to pet today first.
  if (sort === 'pet') return Number(a.autoPet) - Number(b.autoPet) || a.type.localeCompare(b.type) || byName;
  return a.type.localeCompare(b.type) || byName;
}

export function AnimalsView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<AnimalSort>('type');
  const [reversed, setReversed] = useState(false);
  const name = useGameName();
  const { animals, pets } = gameData().farm;
  const { farm, isRaining } = save;

  const toPet = farm.animals.filter((a) => !a.autoPet).length;
  const dryBowls = farm.bowls.filter((w) => !w).length;

  return (
    <div className="prod">
      <HayCard save={save} />
      <div className="prod-summary">
        {/* Rain fills the bowl on its own. */}
        {farm.pets.length > 0 && <span className={dryBowls && !isRaining ? 'box farm-warn' : 'box'}>{dryBowls && !isRaining ? t('animals.fillBowl') : t('animals.bowlOk')}</span>}
        <span className={toPet ? 'box farm-warn' : 'box'}>{toPet ? t('animals.toPet', { count: toPet }) : t('animals.allAutoPet')}</span>
      </div>

      {(farm.pets.length > 0 || farm.horses.length > 0) && (
        <section>
          <h3>{t('animals.companions')}</h3>
          <div className="prod-grid">
            {farm.pets.map((p) => {
              const sheet = pets[p.type]?.breeds[p.breed];
              return (
                <div key={p.name} className="prod-card inset">
                  {sheet && <Sprite sheet={sheet} x={0} y={0} w={32} h={32} scale={2} />}
                  <span className="prod-card__name">{p.name}</span>
                  <span className="prod-card__when">{name(pets[p.type]?.n)}</span>
                  <Hearts value={Math.floor(p.friendship / 200)} max={5} scale={1} />
                  <span className="prod-card__when">{t('animals.petDaily')}</span>
                </div>
              );
            })}
            {farm.horses.map((h) => (
              <div key={h} className="prod-card inset">
                <Sprite sheet="Animals/horse" x={0} y={0} w={32} h={32} scale={2} />
                <span className="prod-card__name">{h}</span>
                <span className="prod-card__when">{t('animals.horse')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <header className="animals__head">
          <h3>{t('animals.farmAnimals', { count: farm.animals.length })}</h3>
          <label className="cc__filter">
            {t('rel.sort')}
            <select className="box" value={sort} onChange={(e) => setSort(e.target.value as AnimalSort)}>
              {(['type', 'name', 'hearts', 'pet'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`animals.sort.${k}`)}
                </option>
              ))}
            </select>
            <button className="button" aria-pressed={reversed} onClick={() => setReversed(!reversed)} title={t('rel.reverse')}>
              {reversed ? '▲' : '▼'}
            </button>
          </label>
        </header>
        <div className="animal-grid">
          {[...farm.animals]
            .sort((a, b) => (reversed ? -1 : 1) * animalOrder(sort, a, b))
            .map((a) => {
              const sprite = animals[a.type]?.sprite;
              const mood = a.happiness >= 200 ? 'happy' : a.happiness >= 150 ? 'fine' : 'sad';
              return (
                <div key={a.type + a.name} className="animal-card inset">
                  <span className="animal-card__pic">{sprite && <Sprite sheet={sprite[0]} x={0} y={0} w={sprite[1]} h={sprite[2]} scale={sprite[1] > 16 ? 1 : 2} />}</span>
                  <span className="animal-card__name">
                    <strong>{a.name}</strong>
                    <small>{name(animals[a.type]?.n) || a.type}</small>
                  </span>
                  <Hearts value={Math.floor(a.friendship / 200)} max={5} scale={1} />
                  <span className={mood === 'sad' ? 'animal-card__mood farm-warn' : 'animal-card__mood'}>{t(`animals.mood.${mood}`)}</span>
                  <span className="animal-card__check">
                    <span className={a.ateAnimalCracker ? 'check check--on' : 'check'} aria-hidden="true" />
                    {t('animals.cracker')}
                  </span>
                  <span className={a.autoPet ? 'animal-card__check' : 'animal-card__check farm-warn'}>
                    <span className={a.autoPet ? 'check check--on' : 'check'} aria-hidden="true" />
                    {a.autoPet ? t('animals.petted') : t('animals.needsPet')}
                  </span>
                </div>
              );
            })}
        </div>
      </section>

      <AnimalRequests save={save} />
    </div>
  );
}

/** Animal products (eggs, milk, wool, truffles...) by object category. */
const ANIMAL_CATEGORIES = new Set([-5, -6, -18]);

/** Help-wanted quests and special orders that ask for animal products. */
function AnimalRequests({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  const seen = new Set<string>();
  const quests = save.players
    .flatMap((p) => p.quests)
    .filter((q) => q.item && ANIMAL_CATEGORIES.has(getItem(q.item)?.c ?? 0) && !seen.has(q.id) && seen.add(q.id));
  const productNames = [...new Set(Object.values(gameData().items).filter((i) => ANIMAL_CATEGORIES.has(i.c ?? 0)).map((i) => name(i.n).toLowerCase()))];
  const orders = save.specialOrders.filter((o) => o.objectives.some((ob) => productNames.some((n) => n && ob.description.toLowerCase().includes(n))));
  return (
    <section>
      <h3>{t('animals.requests')}</h3>
      {quests.length === 0 && orders.length === 0 && <p className="cc-summary__hint">{t('animals.noRequests')}</p>}
      <ul className="map-list dashed-list">
        {quests.map((q) => (
          <li key={q.id}>
            <ItemIcon id={q.item!} />
            <span>
              <strong>{q.title}</strong> · {q.npc ?? ''} {q.count ? `×${q.count}` : ''} {q.daysLeft > 0 ? t('animals.daysLeft', { count: q.daysLeft }) : ''}
            </span>
          </li>
        ))}
        {orders.map((o) => (
          <li key={o.key}>
            <span>
              <strong>{o.requester}</strong>: {o.objectives.map((ob) => `${ob.description} (${ob.current}/${ob.max})`).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
