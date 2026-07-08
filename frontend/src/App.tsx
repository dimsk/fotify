import { Navigate, Route, Routes } from 'react-router-dom';
import { SlideshowPage } from './pages/SlideshowPage';
import { PhotoActionPage } from './pages/PhotoActionPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { SourcesPage } from './pages/admin/SourcesPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { StatisticsPage } from './pages/admin/StatisticsPage';
import { CalendarPage } from './pages/admin/CalendarPage';
import { DatePage } from './pages/admin/DatePage';
import { WeatherPage } from './pages/admin/WeatherPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SlideshowPage />} />
      <Route path="/photo/:id" element={<PhotoActionPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="sources" replace />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="date" element={<DatePage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
      </Route>
    </Routes>
  );
}
