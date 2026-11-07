import { useTranslation } from 'react-i18next';
import type { SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { findItem } from '@/save/inventory';
import { ItemIcon, Progress } from '@/ui';

/**
 * Professor Snail's collections, in the order of IslandFieldOffice.piecesDonated:
 * the large skeleton (6 pieces), the snake (3), the bat and the frog.
 */
const PIECES = ['(O)820', '(O)821', '(O)822', '(O)823', '(O)823', '(O)824', '(O)825', '(O)826', '(O)826', '(O)827', '(O)828'];
const SETS = [
  { key: 'skeleton', pieces: [0, 1, 2, 3, 4, 5], walnuts: 6 },
  { key: 'snake', pieces: [6, 7, 8], walnuts: 3 },
  { key: 'bat', pieces: [9], walnuts: 1 },
  { key: 'frog', pieces: [10], walnuts: 1 },
];

function Office({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const office = save.fieldOffice;
  if (!office) return <p>{t('collections.office.locked')}</p>;
  const donated = office.pieces.filter(Boolean).length;

  return (
    <div className="collections-office">
      <div className="museum__progress">
        <Progress value={donated} max={PIECES.length} />
        <p className="cc-summary__hint">{t('collections.office.hint')}</p>
      </div>
      <div className="farm-grid">
        {SETS.map((set) => {
          const done = set.pieces.every((i) => office.pieces[i]);
          return (
            <section key={set.key} className={done ? 'box cc-bundle--complete' : 'box'}>
              <h3>
                {t(`collections.office.${set.key}`)} {done && '✓'}
              </h3>
              <p className="cc-summary__hint">{t('collections.office.reward', { count: set.walnuts })}</p>
              <div className="slot-grid">
                {set.pieces.map((i) => {
                  const have = !office.pieces[i] && findItem(save, PIECES[i]).length > 0;
                  return (
                    <span key={i} className={`slot-state${office.pieces[i] ? ' slot-state--done' : have ? ' slot-state--ready' : ''}`}>
                      <ItemIcon id={PIECES[i]} slot faded={!office.pieces[i] && !have} />
                      {have && <span className="slot-badge">{t('museum.donate')}</span>}
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section className="box">
          <h3>{t('collections.office.surveys')}</h3>
          <ul className="farm-facts">
            <li>{office.plantsLeft ? '✓' : '✗'} {t('collections.office.plantsLeft')}</li>
            <li>{office.plantsRight ? '✓' : '✗'} {t('collections.office.plantsRight')}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export function FieldOfficeView() {
  return <RequireSave>{(save) => <Office save={save} />}</RequireSave>;
}
