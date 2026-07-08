import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Code,
  CopyButton,
  Group,
  List,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../../api/client';

interface GoogleSetupGuideModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Google requires every application to have its own registered OAuth
 * client (Client ID + Secret) before it can request access to anyone's
 * Calendar — there is no way around this one-time setup step, for any app.
 * This guide walks the admin through creating that client in Google Cloud
 * Console once, then saves the resulting Client ID/Secret/public URL into
 * the database (secret encrypted, like the Apple app-password) via the form
 * below — no .env editing or backend restart needed. Afterwards, every end
 * user just clicks the "Connect" button and approves on Google's own
 * consent screen — no credentials typed into Fotify at any point.
 */
export function GoogleSetupGuideModal({ opened, onClose }: GoogleSetupGuideModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['calendar', 'google-config'],
    queryFn: api.calendar.googleConfig,
    enabled: opened,
  });

  const [clientId, setClientId] = useState('');
  const [publicUrl, setPublicUrl] = useState(window.location.origin);
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    if (status?.clientId) setClientId(status.clientId);
    if (status?.publicUrl) setPublicUrl(status.publicUrl);
  }, [status?.clientId, status?.publicUrl]);

  const redirectUri = `${publicUrl.replace(/\/$/, '')}/calendar/google/callback`;

  const saveMutation = useMutation({
    mutationFn: () =>
      api.calendar.updateGoogleConfig({
        clientId: clientId.trim(),
        publicUrl: publicUrl.trim(),
        clientSecret: clientSecret.length > 0 ? clientSecret : undefined,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['calendar', 'google-config'], updated);
      setClientSecret('');
      notifications.show({ message: t('calendar.googleCredentialsSaved'), color: 'teal' });
    },
  });

  // A secret must be entered the first time; afterwards it's optional —
  // omitting it keeps the previously-saved secret (see save()'s comment).
  const canSave =
    clientId.trim().length > 0 &&
    publicUrl.trim().length > 0 &&
    (clientSecret.length > 0 || !!status?.configured);

  return (
    <Modal opened={opened} onClose={onClose} title={t('calendar.setupGoogle')} size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('calendar.googleIntro')}
        </Text>

        <List type="ordered" spacing="sm" size="sm">
          <List.Item>
            <Anchor href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              {t('calendar.googleStep1')} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </Anchor>
          </List.Item>
          <List.Item>
            {t('calendar.googleStep2')}
          </List.Item>
          <List.Item>
            {t('calendar.googleStep3')}
          </List.Item>
          <List.Item>
            {t('calendar.googleStep4')}
          </List.Item>
          <List.Item>
            {t('calendar.googleStep5')}
            <Group gap="xs" mt={4} wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: 'break-all' }}>{redirectUri}</Code>
              <CopyButton value={redirectUri}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                    <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </List.Item>
        </List>

        <Title order={6} mt="xs">
          {t('calendar.credentials')}
        </Title>
        <TextInput
          label={t('calendar.publicUrl')}
          description={
            <Trans
              i18nKey="calendar.publicUrlDescription"
              values={{ origin: window.location.origin }}
              components={{ code: <Code /> }}
            />
          }
          value={publicUrl}
          onChange={(e) => setPublicUrl(e.currentTarget.value)}
        />
        <TextInput
          label={t('calendar.clientId')}
          value={clientId}
          onChange={(e) => setClientId(e.currentTarget.value)}
        />
        <PasswordInput
          label={t('calendar.clientSecret')}
          placeholder={status?.configured ? t('calendar.keepSecretPlaceholder') : undefined}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.currentTarget.value)}
        />
        {saveMutation.isError && (
          <Alert color="red" title={t('calendar.saveFailed')}>
            {(saveMutation.error as Error).message}
          </Alert>
        )}
        <Button onClick={() => saveMutation.mutate()} disabled={!canSave} loading={saveMutation.isPending} variant="light">
          {t('calendar.saveCredentials')}
        </Button>

        <Title order={6} mt="xs">
          {t('calendar.afterSetup')}
        </Title>
        <Text size="sm" c="dimmed">
          {t('calendar.afterSetupText')}
        </Text>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!status?.configured}
            onClick={() => {
              window.open(api.calendar.googleConnectUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            {t('calendar.connectToGoogle')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
