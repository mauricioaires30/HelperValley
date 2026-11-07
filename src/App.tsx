import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { loadGameData } from '@/data/gameData';
import { useSaveStore } from '@/store/saveStore';
import { AppShell } from '@/app/AppShell';
import { HomePage } from '@/features/home/HomePage';
import { KitPage } from '@/features/kit/KitPage';
import { RelationshipsPage } from '@/features/relationships/RelationshipsPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { AchievementsPage } from '@/features/achievements/AchievementsPage';
import { MuseumPage } from '@/features/museum/MuseumPage';
import { CommunityCenterPage } from '@/features/community-center/CommunityCenterPage';
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
          <Route path="cc" element={<CommunityCenterPage />} />
          <Route path="museum" element={<MuseumPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
          <Route path="kit" element={<KitPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
