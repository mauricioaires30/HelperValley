import { ItemIcon, Hearts, Progress, Portrait, NpcSprite, SeasonIcon, QualityStar } from '@/ui';

const SAMPLE_ITEMS = ['(O)24', '(O)74', '(O)128', '(O)337', '(BC)13', '(W)4', '(H)0', '(B)504', '(T)CopperAxe', '(TR)FrogEgg'];

/** Visual reference of every UI kit component (dev aid, linked in the nav for now). */
export function KitPage() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h2>Items</h2>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SAMPLE_ITEMS.map((id, i) => (
            <ItemIcon key={id} id={id} slot quality={([0, 1, 2, 4] as const)[i % 4]} count={i * 3} faded={i === 9} />
          ))}
        </div>
      </section>

      <section className="box">
        <h3>Box</h3>
        <p>
          Hearts: <Hearts value={7} /> <QualityStar quality={4} />
        </p>
        <p>
          Seasons: <SeasonIcon season="spring" /> <SeasonIcon season="summer" /> <SeasonIcon season="fall" />{' '}
          <SeasonIcon season="winter" />
        </p>
      </section>

      <section className="inset">
        <h3>Progress</h3>
        <Progress value={18} max={25} />
        <Progress value={30} max={30} />
      </section>

      <section style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
        <Portrait npc="Abigail" />
        <Portrait npc="Sebastian" />
        <NpcSprite npc="Lewis" />
        <button className="button">Button</button>
        <button className="button button--primary">Primary</button>
        <button className="button" disabled>
          Disabled
        </button>
      </section>
    </div>
  );
}
