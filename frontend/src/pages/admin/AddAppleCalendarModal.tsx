import { useState } from 'react';
import { Alert, Anchor, Button, Modal, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

interface AddAppleCalendarModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddAppleCalendarModal({ opened, onClose }: AddAppleCalendarModalProps) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');

  const connectMutation = useMutation({
    mutationFn: () => api.calendar.connectApple({ label: label.trim(), appleId: appleId.trim(), appPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] });
      resetAndClose();
    },
  });

  function resetAndClose() {
    setLabel('');
    setAppleId('');
    setAppPassword('');
    onClose();
  }

  const canSubmit = label.trim().length > 0 && appleId.trim().length > 0 && appPassword.length > 0;

  return (
    <Modal opened={opened} onClose={resetAndClose} title="Apple-Kalender hinzufügen" size="lg">
      <Stack gap="md">
        <TextInput
          label="Bezeichnung"
          placeholder="z.B. Familie (iCloud)"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          required
        />
        <TextInput
          label="Apple-ID (E-Mail)"
          type="email"
          value={appleId}
          onChange={(e) => setAppleId(e.currentTarget.value)}
          required
        />
        <PasswordInput
          label="App-spezifisches Passwort"
          value={appPassword}
          onChange={(e) => setAppPassword(e.currentTarget.value)}
          required
        />
        <Text size="xs" c="dimmed">
          Unter{' '}
          <Anchor href="https://appleid.apple.com/account/manage" target="_blank" rel="noreferrer">
            appleid.apple.com
          </Anchor>{' '}
          → „Anmelden &amp; Sicherheit" → „App-spezifische Passwörter" erzeugen — NICHT das normale
          Apple-ID-Passwort verwenden.
        </Text>

        {connectMutation.isError && (
          <Alert color="red" title="Verbindung fehlgeschlagen">
            {(connectMutation.error as Error).message}
          </Alert>
        )}

        <Button onClick={() => connectMutation.mutate()} disabled={!canSubmit} loading={connectMutation.isPending}>
          Verbinden
        </Button>
      </Stack>
    </Modal>
  );
}
