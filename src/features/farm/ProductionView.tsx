import { useTranslation } from 'react-i18next';
import { getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { ItemIcon, Tooltip } from '@/ui';

/** "2h 30min", "3d 4h" from game minutes. */
function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    if (minutes <= 0) return t('prod.ready');
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    return days ? t('prod.days', { days, hours }) : hours ? t('prod.hours', { hours, mins }) : t('prod.mins', { mins });
  };
}

/** Everything the farm is producing right now: machines, bee houses, crab pots and fish ponds. */
export function ProductionView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  const duration = useDuration();

  // Group by machine and output: 12 kegs making Starfruit Wine, 4 ready, next in 2h.
  const groups = new Map<string, { machine: string; output: string; count: number; ready: number; next: number }>();
  for (const m of save.farm.machines) {
    const key = `${m.machine}|${m.output}`;
    const g = groups.get(key) ?? { machine: m.machine, output: m.output, count: 0, ready: 0, next: Infinity };
    g.count++;
    if (m.ready) g.ready++;
    else g.next = Math.min(g.next, m.minutes);
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.ready - a.ready || a.next - b.next);
  const totalReady = rows.reduce((n, g) => n + g.ready, 0);
  const value = rows.reduce((n, g) => n + (getItem(g.output)?.p ?? 0) * g.count, 0);

  return (
    <div className="farm-grid farm-grid--wide">
      <section className="box">
        <h3>{t('prod.machinesTitle', { count: save.farm.machines.length })}</h3>
        <p className="cc-summary__hint">{t('prod.summary', { ready: totalReady, value: value.toLocaleString() })}</p>
        <div className="farm-table-wrap">
          <table className="farm-table">
            <thead>
              <tr>
                <th>{t('prod.col.machine')}</th>
                <th>{t('prod.col.making')}</th>
                <th className="num">{t('prod.col.count')}</th>
                <th className="num">{t('prod.col.ready')}</th>
                <th className="num">{t('prod.col.next')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={`${g.machine}|${g.output}`} className={g.ready ? 'prod-row--ready' : undefined}>
                  <td>
                    <span className="farm-crop">
                      <ItemIcon id={g.machine} scale={1} tooltip={false} />
                      {name(getItem(g.machine)?.n)}
                    </span>
                  </td>
                  <td>
                    <span className="farm-crop">
                      <ItemIcon id={g.output} tooltip={false} />
                      {name(getItem(g.output)?.n) || g.output}
                    </span>
                  </td>
                  <td className="num">{g.count}</td>
                  <td className="num">{g.ready || '—'}</td>
                  <td className="num">{g.next === Infinity ? '—' : duration(g.next)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p>{t('prod.nothing')}</p>}
        </div>
      </section>

      {save.farm.ponds.length > 0 && (
        <section className="box">
          <h3>{t('prod.pondsTitle', { count: save.farm.ponds.length })}</h3>
          <div className="prod-ponds">
            {save.farm.ponds.map((p, i) => (
              <div key={i} className="prod-pond inset">
                {p.fish ? <ItemIcon id={p.fish} /> : <span>{t('prod.emptyPond')}</span>}
                <span>
                  {p.fish && name(getItem(p.fish)?.n)} {p.count}/{p.max}
                </span>
                {p.output && (
                  <Tooltip text={t('prod.pondOutput', { item: name(getItem(p.output)?.n) })}>
                    <span className="slot-state slot-state--ready">
                      <ItemIcon id={p.output} slot tooltip={false} />
                    </span>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
