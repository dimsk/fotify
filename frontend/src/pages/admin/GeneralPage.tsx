import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  FileImage,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { Language } from '../../api/types';

const IMAGE_FORMAT_OPTIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
const VIDEO_FORMAT_OPTIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'];

const FALLBACK_TIMEZONES = [
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getTimeZoneOptions(current: string) {
  const supported =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : FALLBACK_TIMEZONES;
  return Array.from(new Set([current, ...supported]))
    .filter(Boolean)
    .map((value) => ({ value, label: value.replaceAll('_', ' ') }));
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group gap="xs" mb="md">
        {icon}
        <Title order={4}>{title}</Title>
      </Group>
      <Stack gap="md">{children}</Stack>
    </Card>
  );
}

export function GeneralPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });

  const [language, setLanguage] = useState<Language>('en');
  const [clientPresenceDetectionEnabled, setClientPresenceDetectionEnabled] =
    useState(true);
  const [slideshowZoom, setSlideshowZoom] = useState(1);
  const [scheduleTimezone, setScheduleTimezone] = useState(getBrowserTimeZone);
  const [nightModeEnabled, setNightModeEnabled] = useState(false);
  const [nightModeStart, setNightModeStart] = useState('22:00');
  const [nightModeEnd, setNightModeEnd] = useState('07:00');
  const [enabledImageFormats, setEnabledImageFormats] = useState<string[]>(
    IMAGE_FORMAT_OPTIONS,
  );
  const [enabledVideoFormats, setEnabledVideoFormats] = useState<string[]>(
    VIDEO_FORMAT_OPTIONS,
  );

  useEffect(() => {
    if (!settings) return;
    setLanguage(settings.language);
    setClientPresenceDetectionEnabled(settings.clientPresenceDetectionEnabled);
    setSlideshowZoom(settings.slideshowZoom);
    setScheduleTimezone(settings.scheduleTimezone ?? getBrowserTimeZone());
    setNightModeEnabled(settings.nightModeEnabled);
    setNightModeStart(settings.nightModeStart);
    setNightModeEnd(settings.nightModeEnd);
    setEnabledImageFormats(
      settings.enabledImageFormats?.length
        ? settings.enabledImageFormats
        : IMAGE_FORMAT_OPTIONS,
    );
    setEnabledVideoFormats(settings.enabledVideoFormats ?? []);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      notifications.show({ message: t('common.settingsSaved'), color: 'teal' });
    },
  });

  function save() {
    updateMutation.mutate({
      language,
      clientPresenceDetectionEnabled,
      slideshowZoom,
      scheduleTimezone,
      nightModeEnabled,
      nightModeStart,
      nightModeEnd,
      enabledImageFormats,
      enabledVideoFormats,
    });
  }

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'en', label: t('common.english') },
    { value: 'de', label: t('common.german') },
  ];
  const timeZoneOptions = getTimeZoneOptions(scheduleTimezone);

  return (
    <Stack>
      <Title order={3}>{t('settings.general')}</Title>

      <Section icon={<SettingsIcon size={18} />} title={t('settings.general')}>
        <Select
          label={t('common.language')}
          description={t('settings.languageDescription')}
          data={languageOptions}
          value={language}
          onChange={(v) => v && setLanguage(v as Language)}
          allowDeselect={false}
        />
        <Switch
          label={t('settings.clientPresenceDetection')}
          description={t('settings.clientPresenceDetectionDescription')}
          checked={clientPresenceDetectionEnabled}
          onChange={(e) =>
            setClientPresenceDetectionEnabled(e.currentTarget.checked)
          }
        />
        <NumberInput
          label={t('settings.slideshowZoom')}
          description={t('settings.slideshowZoomDescription')}
          value={slideshowZoom}
          min={0.5}
          max={2}
          step={0.05}
          decimalScale={2}
          onChange={(v) => setSlideshowZoom(Number(v) || 1)}
        />
      </Section>

      <Section icon={<CalendarClock size={18} />} title={t('settings.schedule')}>
        <Select
          label={t('settings.timeZone')}
          description={t('settings.timeZoneDescription')}
          data={timeZoneOptions}
          value={scheduleTimezone}
          onChange={(v) => v && setScheduleTimezone(v)}
          searchable
          allowDeselect={false}
        />

        <Switch
          label={t('settings.nightMode')}
          description={t('settings.nightModeDescription')}
          checked={nightModeEnabled}
          onChange={(e) => setNightModeEnabled(e.currentTarget.checked)}
        />

        <Group grow>
          <TextInput
            type="time"
            label={t('common.start')}
            value={nightModeStart}
            onChange={(e) => setNightModeStart(e.currentTarget.value)}
            disabled={!nightModeEnabled}
          />
          <TextInput
            type="time"
            label={t('common.end')}
            value={nightModeEnd}
            onChange={(e) => setNightModeEnd(e.currentTarget.value)}
            disabled={!nightModeEnabled}
          />
        </Group>
      </Section>

      <Section icon={<FileImage size={18} />} title={t('settings.fileFormats')}>
        <MultiSelect
          label={t('settings.imageFormats')}
          description={t('settings.imageFormatsDescription')}
          data={IMAGE_FORMAT_OPTIONS}
          value={enabledImageFormats}
          onChange={setEnabledImageFormats}
        />
        <MultiSelect
          label={t('settings.videoFormats')}
          description={t('settings.videoFormatsDescription')}
          data={VIDEO_FORMAT_OPTIONS}
          value={enabledVideoFormats}
          onChange={setEnabledVideoFormats}
        />
      </Section>

      <Button
        onClick={save}
        loading={updateMutation.isPending}
        w={{ base: '100%', sm: 200 }}
      >
        {t('common.save')}
      </Button>
    </Stack>
  );
}
