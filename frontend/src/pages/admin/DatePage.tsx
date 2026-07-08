import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { DateOverlayMode } from '../../api/types';

export function DatePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<DateOverlayMode>('always');

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.dateOverlayEnabled);
    setMode(settings.dateOverlayMode);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      notifications.show({
        message: t('date.saved'),
        color: 'teal',
      });
    },
  });

  const dateModeOptions: { value: DateOverlayMode; label: string }[] = [
    { value: 'always', label: t('options.overlayModes.always') },
    { value: 'sometimes', label: t('options.overlayModes.sometimes') },
  ];

  return (
    <Stack>
      <Title order={3}>{t('date.title')}</Title>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Switch
            label={t('date.show')}
            description={t('date.showDescription')}
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />

          <Select
            label={t('date.behavior')}
            description={t('date.behaviorDescription')}
            leftSection={<Clock3 size={16} />}
            data={dateModeOptions}
            value={mode}
            onChange={(value) => value && setMode(value as DateOverlayMode)}
            disabled={!enabled}
            allowDeselect={false}
          />

          <Text size="xs" c="dimmed">
            {t('common.changesApplySoon')}
          </Text>
        </Stack>
      </Card>

      <Button
        onClick={() =>
          updateMutation.mutate({
            dateOverlayEnabled: enabled,
            dateOverlayMode: mode,
          })
        }
        loading={updateMutation.isPending}
        w={{ base: '100%', sm: 200 }}
      >
        {t('common.save')}
      </Button>
    </Stack>
  );
}
