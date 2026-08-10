import {
  Card,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Images,
  Eye,
  EyeOff,
  HardDrive,
  FolderOpen,
  Calendar,
  MapPin,
  Film,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatCapturedAt } from '../../slideshow/format-date';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function StatisticsPage() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['statistics'],
    queryFn: api.photos.statistics,
  });

  if (!data) return null;

  const shownPercent =
    data.totalPhotos + data.totalVideos > 0
      ? Math.round(
          (data.shownCount / (data.totalPhotos + data.totalVideos)) * 100,
        )
      : 0;
  const capturedRange =
    data.oldestCapturedAt || data.newestCapturedAt
      ? `${formatCapturedAt(data.oldestCapturedAt) ?? t('common.unknown')} - ${
          formatCapturedAt(data.newestCapturedAt) ?? t('common.unknown')
        }`
      : t('common.unknown');
  const kpis = [
    {
      icon: <Images size={16} />,
      label: t('statistics.totalPhotos'),
      value: String(data.totalPhotos),
    },
    {
      icon: <Film size={16} />,
      label: t('statistics.totalVideos'),
      value: String(data.totalVideos),
    },
    {
      icon: <FolderOpen size={16} />,
      label: t('statistics.sources'),
      value: String(data.totalSources),
    },
    {
      icon: <Eye size={16} />,
      label: t('statistics.shown'),
      value: `${data.shownCount} (${shownPercent}%)`,
    },
    {
      icon: <EyeOff size={16} />,
      label: t('statistics.neverShown'),
      value: String(data.neverShownCount),
    },
    {
      icon: <Images size={16} />,
      label: t('statistics.landscape'),
      value: String(data.byOrientation.landscape),
    },
    {
      icon: <Images size={16} />,
      label: t('statistics.portrait'),
      value: String(data.byOrientation.portrait),
    },
    {
      icon: <Images size={16} />,
      label: t('statistics.square'),
      value: String(data.byOrientation.square),
    },
    {
      icon: <MapPin size={16} />,
      label: t('statistics.withGps'),
      value: String(data.photosWithGpsCoordinates),
    },
    {
      icon: <MapPin size={16} />,
      label: t('statistics.withoutGps'),
      value: String(data.photosWithoutGpsCoordinates),
    },
    {
      icon: <Calendar size={16} />,
      label: t('statistics.capturedRange'),
      value: capturedRange,
    },
    {
      icon: <HardDrive size={16} />,
      label: t('statistics.cacheSize'),
      value: `${formatBytes(data.cache.totalBytes)} (${t('statistics.files', { count: data.cache.fileCount })})`,
    },
  ];
  const kpiRows = Array.from({ length: Math.ceil(kpis.length / 2) }, (_, i) =>
    kpis.slice(i * 2, i * 2 + 2),
  );

  return (
    <Stack gap="lg">
      <Title order={3}>{t('statistics.title')}</Title>

      <Card withBorder padding="md" radius="md">
        <Table verticalSpacing="xs">
          <Table.Tbody>
            {kpiRows.map((row) => (
              <Table.Tr key={row.map((kpi) => kpi.label).join(':')}>
                {row.map((kpi) => (
                  <Table.Td key={kpi.label} style={{ width: '50%' }}>
                    <Group justify="space-between" gap="md">
                      <Group gap="xs" c="dimmed" wrap="nowrap">
                        {kpi.icon}
                        <Text size="sm">{kpi.label}</Text>
                      </Group>
                      <Text size="sm" fw={600} ta="right" style={{ flex: 1 }}>
                        {kpi.value}
                      </Text>
                    </Group>
                  </Table.Td>
                ))}
                {row.length === 1 && <Table.Td style={{ width: '50%' }} />}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Title order={4}>{t('statistics.bySource')}</Title>
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('common.name')}</Table.Th>
            <Table.Th>{t('common.type')}</Table.Th>
            <Table.Th>{t('sources.photos')}</Table.Th>
            <Table.Th>{t('sources.videos')}</Table.Th>
            <Table.Th>{t('sources.shown')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.sources.map((source) => {
            const percent =
              source.photoCount + source.videoCount > 0
                ? Math.round(
                    (source.shownCount /
                      (source.photoCount + source.videoCount)) *
                      100,
                  )
                : 0;
            return (
              <Table.Tr key={source.id}>
                <Table.Td>{source.name}</Table.Td>
                <Table.Td>{source.type === 'local' ? t('common.local') : 'SMB'}</Table.Td>
                <Table.Td>{source.photoCount}</Table.Td>
                <Table.Td>{source.videoCount}</Table.Td>
                <Table.Td>
                  <Text size="sm" mb={2}>
                    {source.shownCount} ({percent}%)
                  </Text>
                  <Progress value={percent} size="xs" />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
