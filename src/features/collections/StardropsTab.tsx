import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RequireSave } from '@/features/saves/RequireSave';
import { usePinStore } from '@/store/pinStore';
import { ItemIcon, Progress } from '@/ui';
import { STARDROP_ITEM, STARDROPS } from './stardrops';

/** The Stardrops that raise max energy: which ones you ate and how to get the rest. */
export function StardropsTab() {
  const { t } = useTranslation();
  const pinned = usePinStore((s) => s.stardrops);
  const toggle = usePinStore((s) => s.toggle);
  return (
    <RequireSave>
      {(_, player) => {
        const has = (flag: string) => player.mailReceived.includes(flag);
        const done = STARDROPS.filter((s) => has(s.flag)).length;
        return (
          <div>
            <div className="museum__progress">
              <Progress value={done} max={STARDROPS.length} />
              <p className="cc-summary__hint">{t('stardrops.hint')}</p>
            </div>
            <ul className="stardrop-list">
              {STARDROPS.map((s) => (
                <li key={s.id} className={has(s.flag) ? 'stardrop inset stardrop--done' : 'stardrop inset'}>
                  <ItemIcon id={STARDROP_ITEM} slot faded={!has(s.flag)} tooltip={false} />
                  <span className="stardrop__text">
                    <strong>{t(`stardrops.${s.id}.title`)}</strong>
                    <span>{has(s.flag) ? t('stardrops.eaten') : t(`stardrops.${s.id}.how`)}</span>
                  </span>
                  {s.place && !has(s.flag) && (
                    <span className="stardrop__actions">
                      <button className={pinned.includes(s.id) ? 'button button--primary' : 'button'} aria-pressed={pinned.includes(s.id)} onClick={() => toggle('stardrops', s.id)}>
                        {pinned.includes(s.id) ? t('stardrops.pinned') : t('stardrops.pin')}
                      </button>
                      {pinned.includes(s.id) && (
                        <Link className="button" to="/map">
                          {t('stardrops.seeMap')}
                        </Link>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </RequireSave>
  );
}
