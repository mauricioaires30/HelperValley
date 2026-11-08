import { useTranslation } from 'react-i18next';
import { gameData, getItem, type LocalizedName } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData, ItemTint } from '@/save/model';
import { ItemIcon, Tooltip } from '@/ui';
import { useLocationName } from '@/features/fish/FishInfo';

interface Group {
  output: string;
  flavor?: { kind: string; of: string };
  tint?: ItemTint;
  machines: Map<string, number>;
  count: number;
  ready: number;
  next: number;
}

/** "Vinho de Mirtilo" for flavored goods, using the game's own name formats; plain name otherwise. */
export function flavoredName(id: string, flavor: { kind: string; of: string } | undefined, name: (n: LocalizedName | undefined) => string): string {
  const format = flavor && gameData().gameCollections.flavorNames?.[flavor.kind];
  const of = flavor && name(getItem(flavor.of)?.n);
  return format && of ? name(format).replace('{0}', of) : name(getItem(id)?.n) || id;
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
        <ItemIcon id={g.output} slot count={ready ? g.ready : g.count - g.ready} tooltip={false} tint={g.tint} />
        <span className="prod-card__name">{flavoredName(g.output, g.flavor, name)}</span>
        <span className="prod-card__when">{ready ? t('prod.readyNow') : t('prod.nextIn', { time: duration(g.next) })}</span>
      </div>
    </Tooltip>
  );
}

/** What the farm is producing, split into "ready to collect" and "in progress". */
export function ProductionView({ save }: { save: SaveData }) {
  const { t } = useTranslation();

  const groups = new Map<string, Group>();
  for (const m of save.farm.machines) {
    const key = m.flavor ? `${m.output}|${m.flavor.of}` : m.output;
    const g = groups.get(key) ?? { output: m.output, flavor: m.flavor, tint: m.tint, machines: new Map(), count: 0, ready: 0, next: Infinity };
    g.count++;
    const where = `${m.machine}|${m.location}`;
    g.machines.set(where, (g.machines.get(where) ?? 0) + 1);
    if (m.ready) g.ready++;
    else g.next = Math.min(g.next, m.minutes);
    groups.set(key, g);
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
      </div>

      {ready.length > 0 && (
        <section>
          <h3>{t('prod.readyTitle')}</h3>
          <div className="prod-grid">
            {ready.map((g) => (
              <ProductCard key={g.output + (g.flavor?.of ?? '')} g={g} ready />
            ))}
          </div>
        </section>
      )}

      {working.length > 0 && (
        <section>
          <h3>{t('prod.workingTitle')}</h3>
          <div className="prod-grid">
            {working.map((g) => (
              <ProductCard key={g.output + (g.flavor?.of ?? '')} g={g} ready={false} />
            ))}
          </div>
        </section>
      )}

      {save.farm.machines.length === 0 && <p>{t('prod.nothing')}</p>}
    </div>
  );
}

/** Fish ponds: fish, population, what's waiting to be collected and what the fish are asking for. */
export function PondsView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  if (save.farm.ponds.length === 0) return <p>{t('prod.noPonds')}</p>;
  return (
    <div className="prod">
      <div className="prod-grid">
        {save.farm.ponds.map((p, i) => (
          <div key={i} className={p.output || p.request ? 'prod-card inset prod-card--ready' : 'prod-card inset'}>
            {p.fish ? <ItemIcon id={p.fish} slot tooltip={false} /> : <span>{t('prod.emptyPond')}</span>}
            <span className="prod-card__name">{p.fish ? name(getItem(p.fish)?.n) : ''}</span>
            <span className="prod-card__when">{t('prod.pondFish', { count: p.count, max: p.max })}</span>
            {p.output && (
              <span className="prod-card__when">
                {t('prod.pondOutput', { item: name(getItem(p.output)?.n) })}
              </span>
            )}
            {p.request && (
              <span className="prod-card__when farm-warn">
                {t('prod.pondWants', { count: p.request.count, item: name(getItem(p.request.item)?.n) })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
