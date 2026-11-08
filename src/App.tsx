import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { loadGameData } from '@/data/gameData';
import { useSaveStore } from '@/store/saveStore';
import { AppShell } from '@/app/AppShell';
import { HomePage } from '@/features/home/HomePage';
import { KitPage } from '@/features/kit/KitPage';
import { MapPage } from '@/features/map/MapPage';
import { QuestsPage } from '@/features/quests/QuestsPage';
import { RelationshipsPage } from '@/features/relationships/RelationshipsPage';
import { PlayerPage } from '@/features/player/PlayerPage';
import { ShopsPage } from '@/features/shops/ShopsPage';
import { FarmPlanPage } from '@/features/farm-plan/FarmPlanPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { CollectionsPage } from '@/features/collections/CollectionsPage';
import { CommunityPage } from '@/features/community-center/CommunityPage';
import '@/i18n';
import '@/ui';

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGameData().then(
      () => {
        setReady(true);
        // Reopen the remembered saves folder, if any.
        void useSaveStore.getState().init();
      },
      (e: unknown) => setError(String(e)),
    );
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!ready) return null;

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="today" element={<Navigate to="/calendar/hoje" replace />} />
          <Route path="player" element={<PlayerPage />} />
          <Route path="calendar/:tab?" element={<CalendarPage />} />
          <Route path="relationships" element={<RelationshipsPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="quests" element={<QuestsPage />} />
          <Route path="production" element={<Navigate to="/farm/producing" replace />} />
          <Route path="shops/:shop?" element={<ShopsPage />} />
          <Route path="farm/:tab?" element={<FarmPlanPage />} />
          <Route path="collections/:tab?" element={<CollectionsPage />} />
          <Route path="community/:tab?" element={<CommunityPage />} />
          <Route path="cc" element={<Navigate to="/community/cc" replace />} />
          <Route path="museum" element={<Navigate to="/community/museum" replace />} />
          <Route path="collections/cc" element={<Navigate to="/community/cc" replace />} />
          <Route path="collections/museum" element={<Navigate to="/community/museum" replace />} />
          <Route path="collections/island" element={<Navigate to="/community/island" replace />} />
          <Route path="achievements" element={<Navigate to="/collections/achievements" replace />} />
          <Route path="kit" element={<KitPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
