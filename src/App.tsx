import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { loadGameData } from '@/data/gameData';
import { useSaveStore } from '@/store/saveStore';
import { AppShell } from '@/app/AppShell';
import { HomePage } from '@/features/home/HomePage';
import { KitPage } from '@/features/kit/KitPage';
import { MapPage } from '@/features/map/MapPage';
import { FarmPage } from '@/features/farm/FarmPage';
import { RelationshipsPage } from '@/features/relationships/RelationshipsPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { AchievementsPage } from '@/features/achievements/AchievementsPage';
import { CollectionsPage } from '@/features/collections/CollectionsPage';
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
          <Route path="today" element={<Navigate to="/calendar" replace />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="relationships" element={<RelationshipsPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="production" element={<FarmPage />} />
          <Route path="farm" element={<Navigate to="/production" replace />} />
          <Route path="collections/:tab?" element={<CollectionsPage />} />
          <Route path="cc" element={<Navigate to="/collections/cc" replace />} />
          <Route path="museum" element={<Navigate to="/collections/museum" replace />} />
          <Route path="achievements" element={<AchievementsPage />} />
          <Route path="kit" element={<KitPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
