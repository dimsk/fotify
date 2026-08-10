import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FilePlus2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { AutoRescanFrequency } from '../../api/types';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour).padStart(2, '0'),
  label: String(hour).padStart(2, '0'),
}));
const MINUTE_OPTIONS = ['00', '15', '30', '45'].map((minute) => ({
  value: minute,
  label: minute,
}));

function formatTimestamp(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function parseAddedFiles(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

export function SchedulerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });

  const [autoRescanEnabled, setAutoRescanEnabled] = useState(false);
  const [frequency, setFrequency] = useState<AutoRescanFrequency>('daily');
  const [weekday, setWeekday] = useState('1');
  const [hour, setHour] = useState('04');
  const [minute, setMinute] = useState('00');

  useEffect(() => {
    if (!settings) return;
    setAutoRescanEnabled(settings.autoRescanEnabled);
    setFrequency(settings.autoRescanFrequency ?? 'daily');
    setWeekday(String(settings.autoRescanWeekday ?? 1));
    const [h = '04', m = '00'] = (settings.autoRescanTime ?? '04:00').split(':');
    setHour(h);
    setMinute(m);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      notifications.show({ message: t('common.settingsSaved'), color: 'teal' });
    },
  });

  const quickScanMutation = useMutation({
    mutationFn: api.sources.quickScanAll,
    onSuccess: (result) => {
      notifications.show({
        message: t('scheduler.scanComplete', { count: result.added }),
        color: 'teal',
      });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
    onError: () => {
      notifications.show({ message: t('scheduler.scanFailed'), color: 'red' });
    },
  });

  function save() {
    updateMutation.mutate({
      autoRescanEnabled,
      autoRescanFrequency: frequency,
      autoRescanWeekday: Number(weekday),
      autoRescanTime: `${hour}:${minute}`,
    });
  }

  const weekdayOptions = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    value: String(day),
    label: t(`scheduler.weekdays.${day}`),
  }));
  const lastScanAt = formatTimestamp(settings?.lastQuickScanAt ?? null);
  const addedFiles = parseAddedFiles(settings?.lastQuickScanFiles ?? null);

  return (
    <Stack>
      <Title order={3}>{t('scheduler.title')}</Title>

      <Card withBorder padding="lg" radius="md">
        <Group gap="xs" mb="md">
          <CalendarClock size={18} />
          <Title order={4}>{t('scheduler.quickScan')}</Title>
        </Group>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t('scheduler.quickScanDescription')}
          </Text>
          <Switch
            label={t('scheduler.enabled')}
            checked={autoRescanEnabled}
            onChange={(e) => setAutoRescanEnabled(e.currentTarget.checked)}
          />
          <Group align="flex-end" wrap="wrap">
            <Select
              label={t('scheduler.frequency')}
              data={[
                { value: 'daily', label: t('scheduler.daily') },
                { value: 'weekly', label: t('scheduler.weekly') },
              ]}
              value={frequency}
              onChange={(v) => v && setFrequency(v as AutoRescanFrequency)}
              allowDeselect={false}
              disabled={!autoRescanEnabled}
              w={180}
            />
            {frequency === 'weekly' && (
              <Select
                label={t('scheduler.weekday')}
                data={weekdayOptions}
                value={weekday}
                onChange={(v) => v && setWeekday(v)}
                allowDeselect={false}
                disabled={!autoRescanEnabled}
                w={180}
              />
            )}
            <Select
              label={t('scheduler.hour')}
              data={HOUR_OPTIONS}
              value={hour}
              onChange={(v) => v && setHour(v)}
              allowDeselect={false}
              disabled={!autoRescanEnabled}
              w={100}
            />
            <Select
              label={t('scheduler.minute')}
              data={MINUTE_OPTIONS}
              value={minute}
              onChange={(v) => v && setMinute(v)}
              allowDeselect={false}
              disabled={!autoRescanEnabled}
              w={100}
            />
          </Group>
          <Group>
            <Button
              onClick={save}
              loading={updateMutation.isPending}
              w={{ base: '100%', sm: 200 }}
            >
              {t('common.save')}
            </Button>
            <Button
              variant="light"
              leftSection={<Play size={16} />}
              onClick={() => quickScanMutation.mutate()}
              loading={quickScanMutation.isPending}
              w={{ base: '100%', sm: 'auto' }}
            >
              {t('scheduler.runNow')}
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            {t('scheduler.runNowDescription')}
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Group gap="xs" mb="md">
          <FilePlus2 size={18} />
          <Title order={4}>{t('scheduler.lastAddedTitle')}</Title>
          {addedFiles.length > 0 && (
            <Badge variant="light">{addedFiles.length}</Badge>
          )}
        </Group>
        <Stack gap="md" mb="md">
          <Group>
            <Text size="sm" c="dimmed">
              {t('scheduler.lastScan')}:
            </Text>
            <Text size="sm" fw={600}>
              {lastScanAt || t('scheduler.never')}
            </Text>
          </Group>
          <Group>
            <Text size="sm" c="dimmed">
              {t('scheduler.lastScanAdded')}:
            </Text>
            <Text size="sm" fw={600}>
              {settings?.lastQuickScanAdded ?? '—'}
            </Text>
          </Group>
        </Stack>
        {addedFiles.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('scheduler.lastAddedEmpty')}
          </Text>
        ) : (
          <ScrollArea h={260}>
            <Stack gap={2}>
              {addedFiles.map((file) => (
                <Text
                  key={file}
                  size="sm"
                  style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                >
                  {file}
                </Text>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Card>
    </Stack>
  );
}
