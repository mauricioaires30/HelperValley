import { useTranslation } from 'react-i18next';
import { getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { ItemIcon } from '@/ui';

/** A hutch holds 20 slimes; each filled trough lets 5 of them make a slime ball overnight. */
const CAPACITY = 20;
const SLIMES_PER_TROUGH = 5;

/** Slime hutches: who lives there, water for tonight, slime balls to break, machines. */
export function SlimesView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  const hutches = save.slimeHutches;
  if (hutches.length === 0) return <p>{t('slimes.none')}</p>;
  const eggMachines = save.farm.machines.filter((m) => m.machine === '(BC)156' || m.machine === '(BC)158');

  return (
    <div className="prod">
      {hutches.map((h, i) => {
        const byName = new Map<string, { count: number; color: string }>();
        for (const s of h.slimes) byName.set(s.name, { count: (byName.get(s.name)?.count ?? 0) + 1, color: s.color });
        const needed = Math.min(h.water.length || 4, Math.ceil(h.slimes.length / SLIMES_PER_TROUGH));
        const filled = h.water.filter(Boolean).length;
        const thirsty = !h.sprinkler && filled < needed;
        return (
          <section key={i} className="prod">
            {hutches.length > 1 && <h3>{t('slimes.hutch', { n: i + 1 })}</h3>}
            <div className="prod-summary">
              <span className="box">{t('slimes.count', { count: h.slimes.length, max: CAPACITY })}</span>
              <span className={thirsty ? 'box farm-warn' : 'box'}>
                {h.sprinkler ? t('slimes.sprinkler') : thirsty ? t('slimes.water', { filled, needed }) : t('slimes.waterOk', { filled, total: h.water.length })}
              </span>
              <span className={h.balls > 0 ? 'box farm-warn' : 'box'}>{t('slimes.balls', { count: h.balls })}</span>
              <span className="box">{h.wickedStatue ? t('slimes.statue') : t('slimes.noStatue')}</span>
            </div>
            <div className="prod-grid">
              {[...byName].map(([slime, { count, color }]) => (
                <div key={slime} className="prod-card inset">
                  <span className="slime-dot" style={{ background: color }} aria-hidden="true" />
                  <span className="prod-card__name">{t(`slimes.kind.${slime}`, { defaultValue: slime })}</span>
                  <span className="prod-card__when">×{count}</span>
                </div>
              ))}
            </div>
            <p className="cc-summary__hint">{t('slimes.hint')}</p>
          </section>
        );
      })}
      {eggMachines.length > 0 && (
        <section>
          <h3>{t('slimes.machines')}</h3>
          <div className="prod-grid">
            {eggMachines.map((m, i) => (
              <div key={i} className={m.ready ? 'prod-card inset prod-card--ready' : 'prod-card inset'}>
                <ItemIcon id={m.output} slot tooltip={false} tint={m.tint} />
                <span className="prod-card__name">{name(getItem(m.output)?.n)}</span>
                <span className="prod-card__when">{name(getItem(m.machine)?.n)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
