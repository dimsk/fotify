import { ActionIcon, Badge, Group, Table, Text, Tooltip } from '@mantine/core';
import { RefreshCw, Trash2 } from 'lucide-react';
import type { CalendarAccount } from '../../api/types';

const STATUS_COLOR: Record<CalendarAccount['status'], string> = {
  idle: 'teal',
  syncing: 'blue',
  error: 'red',
};

const PROVIDER_LABEL: Record<CalendarAccount['provider'], string> = {
  google: 'Google',
  apple: 'Apple (iCloud)',
};

interface CalendarAccountRowProps {
  account: CalendarAccount;
  onResync: (id: number) => void;
  onDelete: (account: CalendarAccount) => void;
}

export function CalendarAccountRow({ account, onResync, onDelete }: CalendarAccountRowProps) {
  return (
    <Table.Tr>
      <Table.Td>{account.label}</Table.Td>
      <Table.Td>
        <Badge variant="light" color={account.provider === 'google' ? 'blue' : 'gray'}>
          {PROVIDER_LABEL[account.provider]}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Tooltip label={account.lastSyncError ?? ''} disabled={!account.lastSyncError}>
          <Badge color={STATUS_COLOR[account.status]} style={{ width: 'max-content' }}>
            {account.status}
          </Badge>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString('de-DE') : 'Noch nie'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Tooltip label="Neu synchronisieren">
            <ActionIcon variant="subtle" onClick={() => onResync(account.id)} disabled={account.status === 'syncing'}>
              <RefreshCw size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Trennen">
            <ActionIcon variant="subtle" color="red" onClick={() => onDelete(account)}>
              <Trash2 size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
