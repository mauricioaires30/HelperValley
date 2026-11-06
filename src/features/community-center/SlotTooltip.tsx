import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { totalCount, type ItemLocation } from '@/save/inventory';
import { Tooltip } from '@/ui';

/** Translates container locations ("Shed", "FarmHouse"...) with a raw fallback. */
export function useLocationLabel() {
  const { t } = useTranslation();
  return (l: ItemLocation) =>
    l.kind === 'inventory' ? t('locations.inventory', { name: l.where }) : t(`locations.${l.where}`, { defaultValue: l.where });
}

/** Item name, required amount/quality and where the farm already has it. */
export function SlotTooltip({ slot, children }: { slot: { id: string; count: number; quality: number; owned: ItemLocation[] }; children: ReactNode }) {
  const { t } = useTranslation();
  const name = useGameName();
  const label = useLocationLabel();
  const item = getItem(slot.id);
  const have = totalCount(slot.owned);
  return (
    <Tooltip
      text={
        <span className="slot-tooltip">
          <strong>
            {name(item?.n)} ×{slot.count}
          </strong>
          {slot.quality > 0 && <span>{t('cc.minQuality', { quality: t(`common.quality.${({ 1: 'silver', 2: 'gold', 4: 'iridium' } as Record<number, string>)[slot.quality]}`) })}</span>}
          {have > 0 ? (
            slot.owned.map((l) => (
              <span key={l.kind + l.where}>
                {label(l)}: {l.count}
              </span>
            ))
          ) : (
            <span>{t('cc.noneOwned')}</span>
          )}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}
