import { useState } from 'react';
import { Button, Group, Modal, Table, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import type { Source } from '../../api/types';
import { AddSourceModal } from './AddSourceModal';
import { SourceRow } from './SourceRow';

export function SourcesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Source | null>(null);

  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: api.sources.list,
    refetchInterval: (query) =>
      query.state.data?.some(
        (s) => s.status === 'scanning' || s.locationBackfillActive,
      )
        ? 2000
        : false,
  });

  const rescanMutation = useMutation({
    mutationFn: (id: number) => api.sources.rescan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const backfillLocationsMutation = useMutation({
    mutationFn: (id: number) => api.sources.backfillLocations(id),
    onSuccess: () => {
      notifications.show({
        message: 'Standort-Ermittlung gestartet — läuft im Hintergrund.',
        color: 'teal',
      });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.sources.pause(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => api.sources.resume(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.sources.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setPendingDelete(null);
    },
  });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Quellen</Title>
        <Button
          leftSection={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          Quelle hinzufügen
        </Button>
      </Group>

      {sources.length === 0 ? (
        <Text c="dimmed">Noch keine Quellen hinzugefügt.</Text>
      ) : (
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Typ</Table.Th>
              <Table.Th>Pfad</Table.Th>
              <Table.Th>Fotos</Table.Th>
              <Table.Th>Gezeigt</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Aktionen</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                onRescan={(id) => rescanMutation.mutate(id)}
                onBackfillLocations={(id) =>
                  backfillLocationsMutation.mutateAsync(id)
                }
                onPause={(id) => pauseMutation.mutate(id)}
                onResume={(id) => resumeMutation.mutate(id)}
                onDelete={setPendingDelete}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}

      <AddSourceModal opened={modalOpen} onClose={() => setModalOpen(false)} />

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Quelle löschen"
      >
        <Text mb="md">
          Soll die Quelle "{pendingDelete?.name}" wirklich gelöscht werden? Alle
          zugehörigen Fotos werden aus der Diashow entfernt.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setPendingDelete(null)}>
            Abbrechen
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() =>
              pendingDelete && deleteMutation.mutate(pendingDelete.id)
            }
          >
            Löschen
          </Button>
        </Group>
      </Modal>
    </>
  );
}
