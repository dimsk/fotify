import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Button, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import { ArrowUp, Folder, RefreshCw } from 'lucide-react';
import type { DirectoryListing } from '../api/types';

interface DirectoryBrowserProps {
  listDirectory: (path?: string) => Promise<DirectoryListing>;
  onSelect: (path: string) => void;
  disabled?: boolean;
}

export function DirectoryBrowser({ listDirectory, onSelect, disabled }: DirectoryBrowserProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (path?: string) => {
    setLoading(true);
    setError(null);
    listDirectory(path)
      .then(setListing)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!disabled) load(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  if (disabled) return null;

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <ActionIcon
          variant="default"
          disabled={!listing?.parentPath && listing?.parentPath !== ''}
          onClick={() => load(listing?.parentPath ?? undefined)}
        >
          <ArrowUp size={16} />
        </ActionIcon>
        <ActionIcon variant="default" onClick={() => load(listing?.currentPath)}>
          <RefreshCw size={16} />
        </ActionIcon>
        <Text size="sm" c="dimmed" style={{ fontFamily: 'monospace' }}>
          {listing?.currentPath || '/'}
        </Text>
      </Group>

      {error && (
        <Alert color="red" title="Fehler">
          {error}
        </Alert>
      )}

      <ScrollArea h={220} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
        {loading ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        ) : (
          <Stack gap={2} p={4}>
            {listing?.directories.map((dir) => (
              <Button
                key={dir.path}
                variant="subtle"
                justify="start"
                leftSection={<Folder size={16} />}
                onClick={() => load(dir.path)}
                size="sm"
              >
                {dir.name}
              </Button>
            ))}
            {listing && listing.directories.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                Keine Unterordner
              </Text>
            )}
          </Stack>
        )}
      </ScrollArea>

      <Button onClick={() => listing && onSelect(listing.currentPath)} disabled={!listing}>
        Diesen Ordner verwenden
      </Button>
    </Stack>
  );
}
