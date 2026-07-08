import { Card, ColorInput, Group, Stack, Switch, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { CalendarAccount } from '../../api/types';

interface CalendarSelectionSectionProps {
  accounts: CalendarAccount[];
}

export function CalendarSelectionSection({ accounts }: CalendarSelectionSectionProps) {
  const { t } = useTranslation();
  if (accounts.length === 0) {
    return <Text c="dimmed">{t('calendar.connectAccountFirst')}</Text>;
  }

  return (
    <Stack gap="md">
      {accounts.map((account) => (
        <AccountCalendars key={account.id} account={account} />
      ))}
    </Stack>
  );
}

function AccountCalendars({ account }: { account: CalendarAccount }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: calendars = [] } = useQuery({
    queryKey: ['calendar', 'calendars', account.id],
    queryFn: () => api.calendar.calendars(account.id),
    // Right after connecting, discovery runs in the background (fire-and-
    // forget) — without this, the list fetched before it finishes would
    // show "no calendars found" forever. Poll while the account is still
    // syncing (account.status is itself kept fresh by CalendarPage's own
    // polling), matching the account list's refetchInterval pattern.
    refetchInterval: account.status === 'syncing' ? 2000 : false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: number; enabled?: boolean; color?: string }) =>
      api.calendar.updateCalendar(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'calendars', account.id] }),
  });

  return (
    <Card withBorder padding="lg" radius="md">
      <Title order={5} mb="sm">
        {account.label}
      </Title>
      {calendars.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('calendar.noCalendars')}
        </Text>
      ) : (
        <Stack gap="xs">
          {calendars.map((calendar) => (
            <Group key={calendar.id} justify="space-between" wrap="nowrap">
              <Switch
                label={calendar.name}
                checked={calendar.enabled}
                onChange={(e) => updateMutation.mutate({ id: calendar.id, enabled: e.currentTarget.checked })}
              />
              <ColorInput
                value={calendar.color}
                onChangeEnd={(color) => updateMutation.mutate({ id: calendar.id, color })}
                w={140}
                size="xs"
                format="hex"
              />
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}
