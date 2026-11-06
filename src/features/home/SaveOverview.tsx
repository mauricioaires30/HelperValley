import { useTranslation } from 'react-i18next';
import { useCurrentSave } from '@/store/saveStore';
import { SeasonIcon } from '@/ui';

const SKILLS = ['farming', 'fishing', 'foraging', 'mining', 'combat'] as const;

/** Quick facts about the loaded save; feature pages will build on this. */
export function SaveOverview() {
  const { t } = useTranslation();
  const { save, player } = useCurrentSave();
  if (!save || !player) return null;

  return (
    <section className="inset" style={{ marginTop: 16 }}>
      <h2>
        {player.farmName} — {player.name}
      </h2>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <SeasonIcon season={save.date.season} />
        {t('saves.day', { day: save.date.day, season: t(`common.seasons.${save.date.season}`), year: save.date.year })}
      </p>
      <ul>
        {SKILLS.map((s) => (
          <li key={s}>
            {t(`common.skills.${s}`)}: {player.skills[s]}
          </li>
        ))}
      </ul>
    </section>
  );
}
