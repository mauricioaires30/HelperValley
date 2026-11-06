import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentSave } from '@/store/saveStore';
import type { Player, SaveData } from '@/save/model';
import { ItemIcon } from '@/ui';

/** Renders children with the loaded save, or a pointer to the Saves page. */
export function RequireSave({ children }: { children: (save: SaveData, player: Player) => ReactNode }) {
  const { t } = useTranslation();
  const { save, player } = useCurrentSave();
  if (!save || !player) {
    return (
      <div className="saves__connect">
        <ItemIcon id="(BC)130" scale={3} tooltip={false} />
        <p>{t('saves.required')}</p>
        <Link className="button button--primary" to="/">
          {t('saves.open')}
        </Link>
      </div>
    );
  }
  return <>{children(save, player)}</>;
}
