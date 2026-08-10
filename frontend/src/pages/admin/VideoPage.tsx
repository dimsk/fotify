import { useEffect, useRef, useState } from 'react';
import { Button, Card, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type {
  VideoCompatibilityMode,
  VideoDurationMode,
} from '../../api/types';

export function VideoPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });
  const [compatibilityMode, setCompatibilityMode] =
    useState<VideoCompatibilityMode>('normalize');
  const [durationMode, setDurationMode] =
    useState<VideoDurationMode>('full');
  const [maxSeconds, setMaxSeconds] = useState(30);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!settings || hydrated.current) return;
    hydrated.current = true;
    setCompatibilityMode(settings.videoCompatibilityMode);
    setDurationMode(settings.videoDurationMode);
    setMaxSeconds(Math.round(settings.videoMaxDurationMs / 1000));
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      notifications.show({ message: t('video.saved'), color: 'teal' });
    },
    onError: (error) => {
      notifications.show({
        message: `${t('video.saveFailed')}: ${(error as Error).message}`,
        color: 'red',
      });
    },
  });

  const compatibilityOptions: {
    value: VideoCompatibilityMode;
    label: string;
  }[] = [
    { value: 'direct-mp4', label: t('video.compatibilityDirectMp4') },
    { value: 'direct-common', label: t('video.compatibilityDirectCommon') },
    { value: 'normalize', label: t('video.compatibilityNormalize') },
  ];
  const durationOptions: { value: VideoDurationMode; label: string }[] = [
    { value: 'full', label: t('video.durationFull') },
    { value: 'photo', label: t('video.durationPhoto') },
    { value: 'random-segment', label: t('video.durationRandomSegment') },
    { value: 'capped', label: t('video.durationCapped') },
  ];

  return (
    <Stack>
      <Title order={3}>{t('video.title')}</Title>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Select
            label={t('video.compatibility')}
            description={t('video.compatibilityDescription')}
            leftSection={<Film size={16} />}
            data={compatibilityOptions}
            value={compatibilityMode}
            onChange={(value) =>
              value && setCompatibilityMode(value as VideoCompatibilityMode)
            }
            allowDeselect={false}
          />
          <Select
            label={t('video.duration')}
            description={t('video.durationDescription')}
            data={durationOptions}
            value={durationMode}
            onChange={(value) =>
              value && setDurationMode(value as VideoDurationMode)
            }
            allowDeselect={false}
          />
          <NumberInput
            label={t('video.maxDuration')}
            min={1}
            max={600}
            value={maxSeconds}
            onChange={(value) => setMaxSeconds(Number(value) || 1)}
            disabled={durationMode !== 'capped'}
          />
          <Text size="xs" c="dimmed">
            {t('video.mutedNotice')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('video.rescanNotice')}
          </Text>
        </Stack>
      </Card>
      <Button
        onClick={() =>
          updateMutation.mutate({
            videoCompatibilityMode: compatibilityMode,
            videoDurationMode: durationMode,
            videoMaxDurationMs: maxSeconds * 1000,
          })
        }
        loading={updateMutation.isPending}
        disabled={!settings}
        w={{ base: '100%', sm: 200 }}
      >
        {t('common.save')}
      </Button>
    </Stack>
  );
}
