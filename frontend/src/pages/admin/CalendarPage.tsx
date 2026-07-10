import { useEffect, useRef, useState } from 'react';
import { Button, Card, Group, Modal, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { CalendarClock, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { CalendarAccount } from '../../api/types';
import { AddAppleCalendarModal } from './AddAppleCalendarModal';
import { CalendarAccountRow } from './CalendarAccountRow';
import { CalendarSelectionSection } from './CalendarSelectionSection';
import { GoogleSetupGuideModal } from './GoogleSetupGuideModal';

export function CalendarPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [appleModalOpen, setAppleModalOpen] = useState(false);
  const [googleGuideOpen, setGoogleGuideOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CalendarAccount | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledConnectResult = useRef(false);
  const previousAccountStatus = useRef<Map<number, CalendarAccount['status']>>(new Map());

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
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      notifications.show({ message: t('calendar.connectedGoogle'), color: 'teal' });
    } else if (connected === 'error') {
      notifications.show({
        title: t('calendar.connectionFailed'),
        message: searchParams.get('message') ?? t('calendar.unknownError'),
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

  useEffect(() => {
    for (const account of accounts) {
      const previous = previousAccountStatus.current.get(account.id);
      if (previous === undefined || previous !== account.status) {
        queryClient.invalidateQueries({ queryKey: ['calendar', 'calendars', account.id] });
      }
      previousAccountStatus.current.set(account.id, account.status);
    }
    const validIds = new Set(accounts.map((account) => account.id));
    for (const id of previousAccountStatus.current.keys()) {
      if (!validIds.has(id)) previousAccountStatus.current.delete(id);
    }
  }, [accounts, queryClient]);

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
      <Title order={3}>{t('calendar.title')}</Title>

      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>{t('calendar.accounts')}</Title>
          <Group gap="xs">
            <Button variant="light" leftSection={<Plus size={16} />} onClick={() => setGoogleGuideOpen(true)}>
              {t('calendar.connectGoogle')}
            </Button>
            <Button leftSection={<Plus size={16} />} onClick={() => setAppleModalOpen(true)}>
              {t('calendar.addApple')}
            </Button>
          </Group>
        </Group>

        {accounts.length === 0 ? (
          <Text c="dimmed">{t('calendar.noAccounts')}</Text>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('calendar.account')}</Table.Th>
                <Table.Th>{t('common.type')}</Table.Th>
                <Table.Th>{t('common.status')}</Table.Th>
                <Table.Th>{t('calendar.lastSynced')}</Table.Th>
                <Table.Th>{t('common.actions')}</Table.Th>
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
          {t('calendar.selection')}
        </Title>
        <CalendarSelectionSection accounts={accounts} />
      </Card>

      <DisplayScheduleSection />

      <AddAppleCalendarModal
        opened={appleModalOpen}
        onClose={() => setAppleModalOpen(false)}
        onConnected={() => queryClient.invalidateQueries({ queryKey: ['calendar'] })}
      />

      <GoogleSetupGuideModal opened={googleGuideOpen} onClose={() => setGoogleGuideOpen(false)} />

      <Modal opened={!!pendingDelete} onClose={() => setPendingDelete(null)} title={t('calendar.deleteTitle')}>
        <Text mb="md">
          {t('calendar.deleteConfirm', { label: pendingDelete?.label })}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setPendingDelete(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
          >
            {t('common.disconnect')}
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}

function DisplayScheduleSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('22:00');
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(15);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.calendarOverlayEnabled);
    setStart(settings.calendarOverlayStart);
    setEnd(settings.calendarOverlayEnd);
    setSyncIntervalMinutes(settings.calendarSyncIntervalMinutes);
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
      calendarOverlayEnabled: enabled,
      calendarOverlayStart: start,
      calendarOverlayEnd: end,
      calendarSyncIntervalMinutes: syncIntervalMinutes,
    });
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Group gap="xs" mb="md">
        <CalendarClock size={18} />
        <Title order={4}>{t('calendar.displayWindow')}</Title>
      </Group>
      <Stack gap="md">
        <Switch
          label={t('calendar.showOverlay')}
          description={t('calendar.showOverlayDescription')}
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <Group grow>
          <TextInput
            type="time"
            label={t('common.start')}
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            disabled={!enabled}
          />
          <TextInput
            type="time"
            label={t('common.end')}
            value={end}
            onChange={(e) => setEnd(e.currentTarget.value)}
            disabled={!enabled}
          />
        </Group>
        <TextInput
          type="number"
          label={t('calendar.syncInterval')}
          description={t('calendar.syncIntervalDescription')}
          value={String(syncIntervalMinutes)}
          onChange={(e) => setSyncIntervalMinutes(Math.max(1, Number(e.currentTarget.value) || 1))}
        />
        <Button onClick={save} loading={updateMutation.isPending} w={{ base: '100%', sm: 200 }}>
          {t('common.save')}
        </Button>
      </Stack>
    </Card>
  );
}
