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
import { api } from '../../api/client';
import type { DateOverlayMode } from '../../api/types';

const DATE_MODE_OPTIONS: { value: DateOverlayMode; label: string }[] = [
  { value: 'always', label: 'Immer anzeigen' },
  { value: 'sometimes', label: 'Bei manchen Bildern einblenden' },
];

export function DatePage() {
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
        message: 'Datumseinstellungen gespeichert',
        color: 'teal',
      });
    },
  });

  return (
    <Stack>
      <Title order={3}>Datum</Title>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Switch
            label="Datum und Uhrzeit anzeigen"
            description="Zeigt das aktuelle Datum und die Uhrzeit oben rechts in der Diashow."
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />

          <Select
            label="Anzeigeverhalten"
            description="Bei manchen Bildern wird das Datum weich eingeblendet und danach wieder ausgeblendet."
            leftSection={<Clock3 size={16} />}
            data={DATE_MODE_OPTIONS}
            value={mode}
            onChange={(value) => value && setMode(value as DateOverlayMode)}
            disabled={!enabled}
            allowDeselect={false}
          />

          <Text size="xs" c="dimmed">
            Änderungen wirken sich innerhalb weniger Sekunden in der Diashow
            aus.
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
        Speichern
      </Button>
    </Stack>
  );
}
