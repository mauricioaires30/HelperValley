import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { FishWhere, useLocationName } from '@/features/fish/FishInfo';
import { SourceLabel } from '@/features/farm/Recommendations';
import { cheapestSource } from '@/features/farm/profit';

/**
 * Short "how to get it" for any collection item, picked by what the item is:
 * fish, crop, artisan good, museum piece or seasonal forage.
 */
export function HowToGet({ id }: { id: string }) {
  const { t } = useTranslation();
  const name = useGameName();
  const place = useLocationName();
  const data = gameData();
  const item = getItem(id);

  if (data.fish[id]) return <FishWhere id={id} />;

  const crop = data.farm.crops.find((c) => c.harvest === id);
  if (crop) {
    const seasons = crop.seasons.map((s) => t(`common.seasons.${s}`)).join(', ');
    return (
      <span className="fish-where">
        <span>{t('collections.how.crop', { seasons })}</span>
        <SourceLabel source={cheapestSource(crop.sources, 'any') ?? crop.sources[0] ?? null} seed={crop.seed} />
      </span>
    );
  }

  const tree = data.farm.fruitTrees.find((x) => x.fruit === id);
  if (tree) return <span>{t('collections.how.tree', { seasons: tree.seasons.map((s) => t(`common.seasons.${s}`)).join(', ') })}</span>;

  const machines = data.gameCollections.madeBy[id];
  if (machines?.length) return <span>{t('collections.how.machine', { machines: machines.map((m) => name(getItem(m)?.n) || m).join(', ') })}</span>;

  const museum = data.museum.sources[id];
  if (museum) {
    const parts = [
      museum.geodes.length ? t('museum.from') + ' ' + museum.geodes.map((g) => name(getItem(g)?.n)).join(', ') : '',
      museum.dig.length ? t('museum.dig', { places: museum.dig.map((d) => (data.museum.places[d] ? name(data.museum.places[d]) : place(d))).join(', ') }) : '',
    ].filter(Boolean);
    return <span>{parts.join(' · ')}</span>;
  }

  // Forage and other seasonal items carry season tags.
  const seasons = (item?.tags ?? []).filter((tag) => tag.startsWith('season_')).map((tag) => tag.slice(7));
  if (seasons.length && seasons.length < 4) return <span>{t('collections.how.forage', { seasons: seasons.map((s) => t(`common.seasons.${s}`)).join(', ') })}</span>;

  return null;
}
