import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { Progress } from '@/ui';
import { perfection, perfectionTotal } from './perfectionScore';

/** The game's Perfection tracker: every part, its weight, and what's missing first. */
function PerfectionView({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const parts = perfection(save);
  const total = perfectionTotal(parts);
  // Unfinished parts first, the ones worth the most points left on top.
  const sorted = [...parts].sort((a, b) => Number(a.progress >= 1) - Number(b.progress >= 1) || (1 - b.progress) * b.weight - (1 - a.progress) * a.weight);

  return (
    <div className="perfection">
      <header className="cc__header">
        <h2>{t('perfection.title', { pct: total.toFixed(1) })}</h2>
      </header>
      <Progress value={Math.round(total)} max={100} />
      <p className="cc-summary__hint">{t('perfection.hint')}</p>
      <div className="walnut-cards">
        {sorted.map((p) => (
          <Link key={p.key} to={p.to} className={p.progress >= 1 ? 'inset walnut-card perfection-card perfection-card--done' : 'inset walnut-card perfection-card'}>
            <header>
              <strong>{t(`perfection.part.${p.key}`)}</strong>
              <span className="walnut-total">
                {(p.progress * p.weight).toFixed(1)}/{p.weight}%
              </span>
            </header>
            <Progress value={p.have} max={p.of} />
            <span>{p.progress >= 1 ? t('perfection.done') : t(`perfection.how.${p.key}`)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PerfectionTab() {
  return <RequireSave>{(save) => <PerfectionView save={save} />}</RequireSave>;
}
