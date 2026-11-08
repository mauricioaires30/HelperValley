import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { PondsView, ProductionView } from './ProductionView';
import { AnimalsView } from './AnimalsView';
import { SlimesView } from './SlimesView';
import { Recommendations } from './Recommendations';
import './farm.css';

const VIEWS = ['production', 'ponds', 'animals', 'slimes', 'recommendations'] as const;
type View = (typeof VIEWS)[number];

function Farm({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('production');
  return (
    <div className="farm">
      <header className="cc__header">
        <h2>{t('prod.title')}</h2>
        <div className="calendar__nav" role="tablist">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={v === view} className={v === view ? 'button button--primary' : 'button'} onClick={() => setView(v)}>
              {t(`farm.view.${v}`)}
            </button>
          ))}
        </div>
      </header>
      {view === 'production' && <ProductionView save={save} />}
      {view === 'ponds' && <PondsView save={save} />}
      {view === 'animals' && <AnimalsView save={save} />}
      {view === 'slimes' && <SlimesView save={save} />}
      {view === 'recommendations' && <Recommendations save={save} player={player} />}
    </div>
  );
}

export function FarmPage() {
  return <RequireSave>{(save, player) => <Farm save={save} player={player} />}</RequireSave>;
}
