import { useEffect, useRef, useState } from 'react';
import { Button, Card, Group, Modal, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { CalendarClock, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CalendarAccount } from '../../api/types';
import { AddAppleCalendarModal } from './AddAppleCalendarModal';
import { CalendarAccountRow } from './CalendarAccountRow';
import { CalendarSelectionSection } from './CalendarSelectionSection';
import { GoogleSetupGuideModal } from './GoogleSetupGuideModal';

export function CalendarPage() {
  const queryClient = useQueryClient();
  const [appleModalOpen, setAppleModalOpen] = useState(false);
  const [googleGuideOpen, setGoogleGuideOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CalendarAccount | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledConnectResult = useRef(false);

  // Surfaces the outcome of the Google OAuth round-trip (see
  // calendar.controller.ts's connectGoogle/googleCallback, which redirect
  // back here with ?connected=google or ?connected=error&message=...) and
  // strips the params so a page refresh doesn't re-show the toast. Guarded
  // by a ref (not just the params themselves) so StrictMode's dev-only
  // double-invocation of this effect doesn't show the toast twice.
  useEffect(() => {
    if (handledConnectResult.current) return;
    const connected = searchParams.get('connected');
    if (!connected) return;
    handledConnectResult.current = true;
    if (connected === 'google') {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] });
      notifications.show({ message: 'Google-Konto verbunden', color: 'teal' });
    } else if (connected === 'error') {
      notifications.show({
        title: 'Verbindung fehlgeschlagen',
        message: searchParams.get('message') ?? 'Unbekannter Fehler',
        color: 'red',
      });
    }
    setSearchParams((params) => {
      params.delete('connected');
      params.delete('message');
      return params;
    }, { replace: true });
    // Intentionally mount-only: only the initial URL's params matter here,
    // and the ref guard above already makes re-invocation a no-op.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: accounts = [] } = useQuery({
    queryKey: ['calendar', 'accounts'],
    queryFn: api.calendar.accounts,
    refetchInterval: (query) => (query.state.data?.some((a) => a.status === 'syncing') ? 2000 : false),
  });

  const resyncMutation = useMutation({
    mutationFn: (id: number) => api.calendar.resync(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.calendar.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] });
      setPendingDelete(null);
    },
  });

  return (
    <Stack>
      <Title order={3}>Kalender</Title>

      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Konten</Title>
          <Group gap="xs">
            <Button variant="light" leftSection={<Plus size={16} />} onClick={() => setGoogleGuideOpen(true)}>
              Mit Google verbinden
            </Button>
            <Button leftSection={<Plus size={16} />} onClick={() => setAppleModalOpen(true)}>
              Apple-Kalender hinzufügen
            </Button>
          </Group>
        </Group>

        {accounts.length === 0 ? (
          <Text c="dimmed">Noch keine Konten verbunden.</Text>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Konto</Table.Th>
                <Table.Th>Typ</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Zuletzt synchronisiert</Table.Th>
                <Table.Th>Aktionen</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.map((account) => (
                <CalendarAccountRow
                  key={account.id}
                  account={account}
                  onResync={(id) => resyncMutation.mutate(id)}
                  onDelete={setPendingDelete}
                />
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Title order={4} mb="md">
          Kalenderauswahl
        </Title>
        <CalendarSelectionSection accounts={accounts} />
      </Card>

      <DisplayScheduleSection />

      <AddAppleCalendarModal opened={appleModalOpen} onClose={() => setAppleModalOpen(false)} />

      <GoogleSetupGuideModal opened={googleGuideOpen} onClose={() => setGoogleGuideOpen(false)} />

      <Modal opened={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Konto trennen">
        <Text mb="md">
          Soll das Konto "{pendingDelete?.label}" wirklich getrennt werden? Alle zugehörigen Kalender
          und zwischengespeicherten Termine werden entfernt.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setPendingDelete(null)}>
            Abbrechen
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
          >
            Trennen
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}

function DisplayScheduleSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('22:00');

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.calendarOverlayEnabled);
    setStart(settings.calendarOverlayStart);
    setEnd(settings.calendarOverlayEnd);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      notifications.show({ message: 'Einstellungen gespeichert', color: 'teal' });
    },
  });

  function save() {
    updateMutation.mutate({
      calendarOverlayEnabled: enabled,
      calendarOverlayStart: start,
      calendarOverlayEnd: end,
    });
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Group gap="xs" mb="md">
        <CalendarClock size={18} />
        <Title order={4}>Anzeigezeitraum</Title>
      </Group>
      <Stack gap="md">
        <Switch
          label="Kalender-Overlay anzeigen"
          description="Zeigt die heutigen Termine als Overlay über der Diashow, solange die aktuelle Uhrzeit im angegebenen Zeitraum liegt."
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <Group grow>
          <TextInput
            type="time"
            label="Beginn"
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            disabled={!enabled}
          />
          <TextInput
            type="time"
            label="Ende"
            value={end}
            onChange={(e) => setEnd(e.currentTarget.value)}
            disabled={!enabled}
          />
        </Group>
        <Button onClick={save} loading={updateMutation.isPending} w={{ base: '100%', sm: 200 }}>
          Speichern
        </Button>
      </Stack>
    </Card>
  );
}
