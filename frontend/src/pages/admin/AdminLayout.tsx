import { AppShell, Group, Indicator, NavLink, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Calendar as CalendarIcon,
  CalendarClock,
  Clock3,
  CloudSun,
  FolderOpen,
  Film,
  SlidersHorizontal,
  Settings as SettingsIcon,
  Tv,
} from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';

const SOURCE_HEALTH_POLL_MS = 30_000;

export function AdminLayout() {
  const { t } = useTranslation();
  const location = useLocation();

  // A lightweight background poll so a failed source (e.g. an SMB share
  // that dropped, especially during an unattended automatic rescan) is
  // noticed without having to open the Quellen page to see it.
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: api.sources.list,
    refetchInterval: SOURCE_HEALTH_POLL_MS,
  });
  const hasSourceError = sources?.some((s) => s.status === 'error') ?? false;

  return (
    <AppShell navbar={{ width: 240, breakpoint: 'sm' }} padding="md">
      <AppShell.Navbar p="md">
        <Group mb="lg" gap="xs">
          <Tv size={22} />
          <Title order={4}>{t('nav.adminTitle')}</Title>
        </Group>
        <NavLink
          component={Link}
          to="/admin/general"
          label={t('nav.general')}
          leftSection={<SettingsIcon size={18} />}
          active={location.pathname.startsWith('/admin/general')}
        />
        <Indicator
          disabled={!hasSourceError}
          color="red"
          position="middle-end"
          offset={8}
          w="100%"
          processing
        >
          <NavLink
            component={Link}
            to="/admin/sources"
            label={t('nav.sources')}
            leftSection={<FolderOpen size={18} />}
            active={location.pathname.startsWith('/admin/sources')}
          />
        </Indicator>
        <NavLink
          component={Link}
          to="/admin/scheduler"
          label={t('nav.scheduler')}
          leftSection={<CalendarClock size={18} />}
          active={location.pathname.startsWith('/admin/scheduler')}
        />
        <NavLink
          component={Link}
          to="/admin/settings"
          label={t('nav.slideshowSettings')}
          leftSection={<SlidersHorizontal size={18} />}
          active={location.pathname.startsWith('/admin/settings')}
        />
        <NavLink
          component={Link}
          to="/admin/video"
          label={t('nav.video')}
          leftSection={<Film size={18} />}
          active={location.pathname.startsWith('/admin/video')}
        />
        <NavLink
          component={Link}
          to="/admin/date"
          label={t('nav.date')}
          leftSection={<Clock3 size={18} />}
          active={location.pathname.startsWith('/admin/date')}
        />
        <NavLink
          component={Link}
          to="/admin/weather"
          label={t('nav.weather')}
          leftSection={<CloudSun size={18} />}
          active={location.pathname.startsWith('/admin/weather')}
        />
        <NavLink
          component={Link}
          to="/admin/calendar"
          label={t('nav.calendar')}
          leftSection={<CalendarIcon size={18} />}
          active={location.pathname.startsWith('/admin/calendar')}
        />
        <NavLink
          component={Link}
          to="/admin/statistics"
          label={t('nav.statistics')}
          leftSection={<BarChart3 size={18} />}
          active={location.pathname.startsWith('/admin/statistics')}
        />
        <NavLink
          component={Link}
          to="/"
          label={t('nav.slideshow')}
          leftSection={<Tv size={18} />}
          mt="auto"
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
