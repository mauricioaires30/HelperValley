import { useTranslation } from 'react-i18next';
import { getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { ItemIcon, Tooltip } from '@/ui';
import { useLocationName } from '@/features/fish/FishInfo';

interface Group {
  output: string;
  machines: Map<string, number>;
  count: number;
  ready: number;
  next: number;
}

/** "2h 30min", "3d 4h" from game minutes. */
function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    return days ? t('prod.days', { days, hours }) : hours ? t('prod.hours', { hours, mins }) : t('prod.mins', { mins });
  };
}

/** One product: big icon with how many, what makes it (tooltip) and when the next is done. */
function ProductCard({ g, ready }: { g: Group; ready: boolean }) {
  const { t } = useTranslation();
  const name = useGameName();
  const duration = useDuration();
  const place = useLocationName();
  return (
    <Tooltip
      text={
        <span className="slot-tooltip">
          {[...g.machines].map(([key, n]) => {
            const [id, location] = key.split('|');
            return (
              <span key={key}>
                {n}× {name(getItem(id)?.n)} · {place(location)}
              </span>
            );
          })}
        </span>
      }
    >
      <div className={ready ? 'prod-card inset prod-card--ready' : 'prod-card inset'}>
        <ItemIcon id={g.output} slot count={ready ? g.ready : g.count - g.ready} tooltip={false} />
        <span className="prod-card__name">{name(getItem(g.output)?.n) || g.output}</span>
        <span className="prod-card__when">{ready ? t('prod.readyNow') : t('prod.nextIn', { time: duration(g.next) })}</span>
      </div>
    </Tooltip>
  );
}

/** What the farm is producing, split into "ready to collect" and "in progress". */
export function ProductionView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();

  const groups = new Map<string, Group>();
  for (const m of save.farm.machines) {
    const g = groups.get(m.output) ?? { output: m.output, machines: new Map(), count: 0, ready: 0, next: Infinity };
    g.count++;
    const key = `${m.machine}|${m.location}`;
    g.machines.set(key, (g.machines.get(key) ?? 0) + 1);
    if (m.ready) g.ready++;
    else g.next = Math.min(g.next, m.minutes);
    groups.set(m.output, g);
  }
  const all = [...groups.values()];
  const ready = all.filter((g) => g.ready > 0).sort((a, b) => b.ready - a.ready);
  const working = all.filter((g) => g.count > g.ready).sort((a, b) => a.next - b.next);
  const readyCount = ready.reduce((n, g) => n + g.ready, 0);

  return (
    <div className="prod">
      <div className="prod-summary">
        <span className="box">{t('prod.readyCount', { count: readyCount })}</span>
        <span className="box">{t('prod.workingCount', { count: save.farm.machines.length - readyCount })}</span>
        {save.farm.ponds.length > 0 && <span className="box">{t('prod.pondCount', { count: save.farm.ponds.length })}</span>}
      </div>

      {ready.length > 0 && (
        <section>
          <h3>{t('prod.readyTitle')}</h3>
          <div className="prod-grid">
            {ready.map((g) => (
              <ProductCard key={g.output} g={g} ready />
            ))}
          </div>
        </section>
      )}

      {working.length > 0 && (
        <section>
          <h3>{t('prod.workingTitle')}</h3>
          <div className="prod-grid">
            {working.map((g) => (
              <ProductCard key={g.output} g={g} ready={false} />
            ))}
          </div>
        </section>
      )}

      {save.farm.ponds.length > 0 && (
        <section>
          <h3>{t('prod.pondsTitle', { count: save.farm.ponds.length })}</h3>
          <div className="prod-grid">
            {save.farm.ponds.map((p, i) => (
              <Tooltip key={i} text={p.output ? t('prod.pondOutput', { item: name(getItem(p.output)?.n) }) : t('prod.pondNothing')}>
                <div className={p.output ? 'prod-card inset prod-card--ready' : 'prod-card inset'}>
                  {p.fish ? <ItemIcon id={p.fish} slot tooltip={false} /> : <span>{t('prod.emptyPond')}</span>}
                  <span className="prod-card__name">{p.fish ? name(getItem(p.fish)?.n) : ''}</span>
                  <span className="prod-card__when">
                    {p.count}/{p.max}
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        </section>
      )}

      {save.farm.machines.length === 0 && <p>{t('prod.nothing')}</p>}
    </div>
  );
}
