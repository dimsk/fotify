import { useState } from 'react';
import {
  Badge,
  Card,
  Group,
  Image,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Film, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { RecentMedia } from '../../api/types';
import { formatCapturedAt } from '../../slideshow/format-date';

const LIMIT_OPTIONS = ['50', '100', '200', '500'];

function locationLabel(media: RecentMedia): string | null {
  const parts = [media.locationCity, media.locationCountry].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function RecentMediaPage() {
  const { t } = useTranslation();
  const [limit, setLimit] = useState('50');
  const { data } = useQuery({
    queryKey: ['recent-media', limit],
    queryFn: () => api.photos.recent(Number(limit)),
  });

  if (!data) return null;

  return (
    <Stack gap="lg">
      <Group gap="xs" justify="space-between">
        <Group gap="xs">
          <History size={20} />
          <Title order={3}>{t('recent.title')}</Title>
          {data.length > 0 && <Badge variant="light">{data.length}</Badge>}
        </Group>
        <Select
          label={t('recent.limit')}
          data={LIMIT_OPTIONS}
          value={limit}
          onChange={(v) => v && setLimit(v)}
          allowDeselect={false}
          w={110}
        />
      </Group>

      {data.length === 0 ? (
        <Text c="dimmed">{t('recent.empty')}</Text>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
          {data.map((media) => (
            <Card key={media.id} withBorder padding="xs" radius="md">
              <Card.Section
                component="a"
                href={api.photos.displayUrl(media.id)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ position: 'relative', display: 'block', cursor: 'pointer' }}
              >
                <Image
                  src={api.photos.displayUrl(media.id)}
                  alt={formatCapturedAt(media.capturedAt) ?? ''}
                  height={160}
                  fit="cover"
                  fallbackSrc=""
                />
                {media.mediaType === 'video' && (
                  <Badge
                    variant="dark"
                    size="sm"
                    leftSection={<Film size={12} />}
                    style={{ position: 'absolute', top: 8, left: 8 }}
                  >
                    {t('recent.video')}
                  </Badge>
                )}
              </Card.Section>
              <Stack gap={2} mt="xs">
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {formatCapturedAt(media.capturedAt) ?? t('common.unknown')}
                </Text>
                {locationLabel(media) && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {locationLabel(media)}
                  </Text>
                )}
                <Tooltip label={media.relativePath} multiline maw={320} withinPortal>
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ wordBreak: 'break-all' }}>
                    {media.relativePath}
                  </Text>
                </Tooltip>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {t('recent.shownAt')}: {new Date(media.lastShownAt).toLocaleString()}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
