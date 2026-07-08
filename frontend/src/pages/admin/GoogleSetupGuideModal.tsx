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
 * user just clicks the "Verbinden" button and approves on Google's own
 * consent screen — no credentials typed into Fotify at any point.
 */
export function GoogleSetupGuideModal({ opened, onClose }: GoogleSetupGuideModalProps) {
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
      notifications.show({ message: 'Google-Zugangsdaten gespeichert', color: 'teal' });
    },
  });

  // A secret must be entered the first time; afterwards it's optional —
  // omitting it keeps the previously-saved secret (see save()'s comment).
  const canSave =
    clientId.trim().length > 0 &&
    publicUrl.trim().length > 0 &&
    (clientSecret.length > 0 || !!status?.configured);

  return (
    <Modal opened={opened} onClose={onClose} title="Google Kalender einrichten" size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Google verlangt für jede Anwendung eine eigene registrierte OAuth-Client-ID, bevor sie
          Zugriff auf einen Kalender anfragen darf. Das ist ein einmaliger Einrichtungsschritt für
          diese Fotify-Installation — Nutzer selbst geben später nur noch mit einem Klick ihre
          Zustimmung auf der Google-Seite, ohne jemals ein Passwort bei Fotify einzugeben.
        </Text>

        <List type="ordered" spacing="sm" size="sm">
          <List.Item>
            <Anchor href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Google Cloud Console → APIs &amp; Services → Credentials <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </Anchor>{' '}
            öffnen und ein Projekt anlegen (oder ein vorhandenes auswählen).
          </List.Item>
          <List.Item>
            Unter „APIs &amp; Services" → „Library" nach <Code>Google Calendar API</Code> suchen und
            aktivieren.
          </List.Item>
          <List.Item>
            Unter „OAuth consent screen" einen externen Consent-Screen anlegen und den Scope{' '}
            <Code>calendar.readonly</Code> hinzufügen. Solange die App im Status „Testing" bleibt,
            muss das eigene Google-Konto als Testnutzer eingetragen werden.
          </List.Item>
          <List.Item>
            Unter „Credentials" → „Create Credentials" → „OAuth client ID" den Typ{' '}
            <Code>Web application</Code> wählen.
          </List.Item>
          <List.Item>
            Als „Authorized redirect URI" genau diese Adresse eintragen (passt sich an, wenn die
            „Öffentliche Adresse" unten geändert wird):
            <Group gap="xs" mt={4} wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: 'break-all' }}>{redirectUri}</Code>
              <CopyButton value={redirectUri}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Kopiert' : 'Kopieren'}>
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
          Zugangsdaten hinterlegen
        </Title>
        <TextInput
          label="Öffentliche Adresse"
          description={
            <>
              Nur die Basis-Adresse ohne Pfad, z.B. <Code>{window.location.origin}</Code> — NICHT
              die vollständige Redirect-URI von oben (der Pfad <Code>/calendar/google/callback</Code>{' '}
              wird automatisch angehängt).
            </>
          }
          value={publicUrl}
          onChange={(e) => setPublicUrl(e.currentTarget.value)}
        />
        <TextInput
          label="Client-ID"
          value={clientId}
          onChange={(e) => setClientId(e.currentTarget.value)}
        />
        <PasswordInput
          label="Client-Secret"
          placeholder={status?.configured ? '•••••••• (unverändert lassen zum Beibehalten)' : undefined}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.currentTarget.value)}
        />
        {saveMutation.isError && (
          <Alert color="red" title="Speichern fehlgeschlagen">
            {(saveMutation.error as Error).message}
          </Alert>
        )}
        <Button onClick={() => saveMutation.mutate()} disabled={!canSave} loading={saveMutation.isPending} variant="light">
          Zugangsdaten speichern
        </Button>

        <Title order={6} mt="xs">
          Danach
        </Title>
        <Text size="sm" c="dimmed">
          Auf „Zu Google verbinden" klicken — das führt direkt zur Google-Anmeldeseite. Nach der
          Bestätigung dort ist das Konto automatisch verbunden.
        </Text>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!status?.configured}
            onClick={() => {
              window.open(api.calendar.googleConnectUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            Zu Google verbinden
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
