import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { ItemIcon, Progress, Sprite, Tooltip } from '@/ui';
import { FarmerSprite } from './FarmerSprite';
import { ToolsSection } from './Tools';
import { candlesFor, farmerLevel, grandpaPoints, masteryState, professionTree, skillProgress, SKILL_ORDER } from './progress';
import './player.css';

const CURSORS = 'LooseSprites/Cursors';
/** Skill icons in Cursors (SkillsPage), by skill index. */
const SKILL_ICON_X = [10, 20, 60, 30, 120, 50];

function ProfessionIcon({ id, owned }: { id: number; owned: boolean }) {
  const name = useGameName();
  const p = gameData().player.professions[id];
  return (
    <Tooltip
      text={
        <span className="slot-tooltip">
          <strong>{name(p?.n)}</strong>
          <span>{name(p?.d)}</span>
        </span>
      }
    >
      <span className={owned ? 'profession' : 'profession profession--missing'}>
        <Sprite sheet={CURSORS} x={(id % 6) * 16} y={624 + Math.floor(id / 6) * 16} w={16} h={16} scale={2} label={name(p?.n)} />
      </span>
    </Tooltip>
  );
}

function Skills({ player }: { player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const skills = gameData().player.skills;
  return (
    <section className="panel player__section">
      <h2>{t('player.skills', { level: farmerLevel(player) })}</h2>
      <ul className="skills">
        {SKILL_ORDER.map((key, i) => {
          const level = player.skills[key];
          const progress = skillProgress(player.experience[i] ?? 0, level);
          const tree = i < 5 ? professionTree(i) : [];
          return (
            <li key={key} className="skills__row">
              <Sprite sheet={CURSORS} x={SKILL_ICON_X[i]} y={428} w={10} h={10} scale={3} label={name(skills[i]?.n)} />
              <span className="skills__name">{name(skills[i]?.n)}</span>
              <span className="skills__pips" aria-label={t('player.level', { level })}>
                {Array.from({ length: 10 }, (_, n) => {
                  const big = n === 4 || n === 9;
                  const on = n < level;
                  return <Sprite key={n} sheet={CURSORS} x={(big ? 145 : 129) + (on ? (big ? 14 : 8) : 0)} y={338} w={big ? 14 : 8} h={9} scale={2} />;
                })}
              </span>
              <span className="skills__xp">
                {level >= 10 ? t('player.maxed') : t('player.xp', { into: progress.into.toLocaleString(), of: progress.of.toLocaleString() })}
              </span>
              <span className="skills__professions">
                {tree.map((branch) => {
                  const took = player.professions.includes(branch.id);
                  return (
                    <span key={branch.id} className="skills__branch">
                      <ProfessionIcon id={branch.id} owned={took} />
                      {took && branch.next.map((id) => (player.professions.includes(id) ? <ProfessionIcon key={id} id={id} owned /> : null))}
                    </span>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Mastery({ player }: { player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const data = gameData().player;
  const m = masteryState(player);
  return (
    <section className="panel player__section">
      <h2>{t('player.mastery.title')}</h2>
      {!m.unlocked ? (
        <p className="cc-summary__hint">{t('player.mastery.locked')}</p>
      ) : (
        <>
          <p className="cc-summary__hint">
            {t('player.mastery.level', { level: m.level })}
            {m.toClaim > 0 && <strong> · {t('player.mastery.toClaim', { count: m.toClaim })}</strong>}
          </p>
          {m.next ? <Progress value={m.next.into} max={m.next.of} /> : <p>{t('player.mastery.max')}</p>}
        </>
      )}
      <ul className="mastery">
        {data.mastery.map((entry, i) => (
          <li key={i} className={m.claimed[i] ? 'mastery__skill inset' : 'mastery__skill inset mastery__skill--missing'}>
            <span className="mastery__head">
              <strong>{name(entry.title)}</strong>
              <span className={m.claimed[i] ? 'check check--on' : 'check'} aria-label={m.claimed[i] ? t('player.mastery.claimed') : undefined} />
            </span>
            <span className="mastery__rewards">
              {entry.rewards.map((id) => (
                <ItemIcon key={id} id={id} slot />
              ))}
            </span>
            <span className="mastery__perk">{name(entry.perk)}</span>
          </li>
        ))}
      </ul>
      <p className="cc-summary__hint">{t('player.mastery.how')}</p>
    </section>
  );
}

function Grandpa({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const points = grandpaPoints(save, player);
  const score = points.reduce((sum, p) => sum + (p.done ? p.points : 0), 0);
  const candles = candlesFor(score);
  const missing = points.filter((p) => !p.done);
  const done = points.filter((p) => p.done);
  const achievements = gameData().achievements;
  const label = (p: (typeof points)[number]) => {
    if (p.key === 'achievement') return t('player.grandpa.achievement', { name: name(achievements[p.values!.id]?.n) });
    return t(`player.grandpa.${p.key}`, { ...p.values, amount: p.values?.amount?.toLocaleString() });
  };
  return (
    <section className="panel player__section">
      <h2>{t('player.grandpa.title')}</h2>
      <p className="cc-summary__hint">
        {save.grandpaScore > 0 ? t('player.grandpa.lit', { count: save.grandpaScore }) : t('player.grandpa.notYet')}
        {' · '}
        {t('player.grandpa.now', { score, candles })}
      </p>
      <Progress value={score} max={21} />
      {/* What's missing comes first and stands out; what's done folds away. */}
      {missing.length > 0 ? (
        <>
          <h3 className="grandpa__todo-title">{t('player.grandpa.todo', { count: missing.reduce((n, p) => n + p.points, 0) })}</h3>
          <ul className="grandpa grandpa--todo">
            {missing.map((p, i) => (
              <li key={i} className="grandpa__point grandpa__point--todo box">
                <span className="check" aria-hidden="true" />
                <span>{label(p)}</span>
                <span className="grandpa__pts">+{p.points}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="grandpa__all">{t('player.grandpa.allDone')}</p>
      )}
      <details className="grandpa__done">
        <summary>{t('player.grandpa.doneList', { count: done.length })}</summary>
        <ul className="grandpa">
          {done.map((p, i) => (
            <li key={i} className="grandpa__point grandpa__point--done">
              <span className="check check--on" aria-hidden="true" />
              <span>{label(p)}</span>
              <span className="grandpa__pts">+{p.points}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="cc-summary__hint">{t('player.grandpa.how')}</p>
    </section>
  );
}

function Profile({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const hat = player.look.hat ? getItem(`(H)${player.look.hat}`) : undefined;
  return (
    <section className="panel player__card">
      <FarmerSprite look={player.look} scale={1.5} label={player.name} />
      <div>
        <h1>{player.name}</h1>
        <p>{t('player.farm', { farm: player.farmName || save.players[0]?.farmName })}</p>
        {player.spouse && <p>{t('player.spouse', { name: name(gameData().npcs[player.spouse]?.n) || player.spouse })}</p>}
        <p>{t('player.earned', { amount: player.totalMoneyEarned.toLocaleString() })}</p>
        {hat && <p>{t('player.wearing', { hat: name(hat.n) })}</p>}
      </div>
    </section>
  );
}

export function PlayerPage() {
  return (
    <RequireSave>
      {(save, player) => (
        <div className="player">
          <Profile save={save} player={player} />
          <Skills player={player} />
          <ToolsSection save={save} player={player} />
          <Mastery player={player} />
          <Grandpa save={save} player={save.players.find((p) => p.isHost) ?? player} />
        </div>
      )}
    </RequireSave>
  );
}
