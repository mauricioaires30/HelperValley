import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { Hearts, Sprite, Tooltip } from '@/ui';
import { HayCard } from './FarmOverview';

/** Farm animals reach 5 hearts at 1000 friendship. */
const animalHearts = (friendship: number) => Math.floor(friendship / 200);

/**
 * Pets, horses and farm animals: hearts, mood and today's chores
 * (fill the pet bowl, pet the animals that no auto-petter covers).
 */
export function AnimalsView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { animals, pets } = gameData().farm;
  const { farm, isRaining } = save;

  const byType = new Map<string, typeof farm.animals>();
  for (const a of farm.animals) byType.set(a.type, [...(byType.get(a.type) ?? []), a]);
  const toPet = farm.animals.filter((a) => !a.autoPet).length;
  const dryBowls = farm.bowls.filter((w) => !w).length;

  return (
    <div className="prod">
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
        <h3>{t('animals.farmAnimals', { count: farm.animals.length })}</h3>
        <div className="prod-grid">
          {[...byType].map(([type, list]) => {
            const sprite = animals[type]?.sprite;
            const avg = list.reduce((n, a) => n + animalHearts(a.friendship), 0) / list.length;
            const sad = list.filter((a) => a.happiness < 150).length;
            const manual = list.filter((a) => !a.autoPet).length;
            return (
              <Tooltip
                key={type}
                text={
                  <span className="slot-tooltip">
                    {list.map((a) => (
                      <span key={a.name}>
                        {a.name}: {animalHearts(a.friendship)}♥
                      </span>
                    ))}
                  </span>
                }
              >
                <div className="prod-card inset">
                  {sprite && <Sprite sheet={sprite[0]} x={0} y={0} w={sprite[1]} h={sprite[2]} scale={sprite[1] > 16 ? 1 : 2} />}
                  <span className="prod-card__name">
                    {name(animals[type]?.n) || type} ×{list.length}
                  </span>
                  <Hearts value={Math.round(avg)} max={5} scale={1} />
                  {manual > 0 && <span className="prod-card__when farm-warn">{t('animals.petN', { count: manual })}</span>}
                  {sad > 0 && <span className="prod-card__when farm-warn">{t('animals.sad', { count: sad })}</span>}
                </div>
              </Tooltip>
            );
          })}
        </div>
      </section>

      <section>
        <h3>{t('animals.allTitle')}</h3>
        <div className="farm-table-wrap">
          <table className="farm-table">
            <thead>
              <tr>
                <th>{t('animals.col.name')}</th>
                <th>{t('animals.col.type')}</th>
                <th>{t('animals.col.hearts')}</th>
                <th>{t('animals.col.mood')}</th>
                <th>{t('animals.col.home')}</th>
                <th>{t('animals.col.care')}</th>
              </tr>
            </thead>
            <tbody>
              {[...farm.animals]
                .sort((a, b) => a.friendship - b.friendship)
                .map((a) => (
                  <tr key={a.type + a.name}>
                    <td>
                      <strong>{a.name}</strong>
                    </td>
                    <td>{name(animals[a.type]?.n) || a.type}</td>
                    <td>
                      <Hearts value={animalHearts(a.friendship)} max={5} scale={1} />
                    </td>
                    <td className={a.happiness < 150 ? 'farm-warn' : undefined}>{t(`animals.mood.${a.happiness >= 200 ? 'happy' : a.happiness >= 150 ? 'fine' : 'sad'}`)}</td>
                    <td>{t(`locations.${a.building}`, { defaultValue: a.building })}</td>
                    <td>
                      {[!a.autoPet && t('animals.needsPet'), a.ateAnimalCracker && t('animals.cracker')].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <HayCard save={save} />
    </div>
  );
}
