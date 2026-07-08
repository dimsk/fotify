import { useState } from 'react';
import { Alert, Button, Modal, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';

interface AddAppleCalendarModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddAppleCalendarModal({ opened, onClose }: AddAppleCalendarModalProps) {
  const { t } = useTranslation();
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
    <Modal opened={opened} onClose={resetAndClose} title={t('calendar.addAppleTitle')} size="lg">
      <Stack gap="md">
        <TextInput
          label={t('calendar.label')}
          placeholder={t('calendar.appleLabelPlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          required
        />
        <TextInput
          label={t('calendar.appleId')}
          type="email"
          value={appleId}
          onChange={(e) => setAppleId(e.currentTarget.value)}
          required
        />
        <PasswordInput
          label={t('calendar.appPassword')}
          value={appPassword}
          onChange={(e) => setAppPassword(e.currentTarget.value)}
          required
        />
        <Text size="xs" c="dimmed">
          {t('calendar.applePasswordHelp')}
        </Text>

        {connectMutation.isError && (
          <Alert color="red" title={t('calendar.connectionFailed')}>
            {(connectMutation.error as Error).message}
          </Alert>
        )}

        <Button onClick={() => connectMutation.mutate()} disabled={!canSubmit} loading={connectMutation.isPending}>
          {t('common.connect')}
        </Button>
      </Stack>
    </Modal>
  );
}
