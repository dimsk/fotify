import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import i18n from './i18n';
import { api } from './api/client';
import { SlideshowPage } from './pages/SlideshowPage';
import { PhotoActionPage } from './pages/PhotoActionPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { SourcesPage } from './pages/admin/SourcesPage';
import { GeneralPage } from './pages/admin/GeneralPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { StatisticsPage } from './pages/admin/StatisticsPage';
import { CalendarPage } from './pages/admin/CalendarPage';
import { DatePage } from './pages/admin/DatePage';
import { WeatherPage } from './pages/admin/WeatherPage';
import { VideoPage } from './pages/admin/VideoPage';

export function App() {
  return (
    <>
      <LanguageSync />
      <Routes>
        <Route path="/" element={<SlideshowPage />} />
        <Route path="/photo/:id" element={<PhotoActionPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="sources" replace />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="general" element={<GeneralPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="video" element={<VideoPage />} />
          <Route path="date" element={<DatePage />} />
          <Route path="weather" element={<WeatherPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
        </Route>
      </Routes>
    </>
  );
}

function LanguageSync() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  useEffect(() => {
    if (settings?.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings?.language]);

  return null;
}
