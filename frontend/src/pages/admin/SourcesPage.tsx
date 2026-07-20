import { useState } from 'react';
import { Button, Group, Modal, Table, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { Source } from '../../api/types';
import { AddSourceModal } from './AddSourceModal';
import { SourceRow } from './SourceRow';

export function SourcesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Source | null>(null);

  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: api.sources.list,
    refetchInterval: (query) =>
      query.state.data?.some(
        (s) =>
          s.status === 'scanning' ||
          s.locationBackfillActive ||
          s.lensApertureBackfillActive,
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
        message: t('sources.locationBackfillStarted'),
        color: 'teal',
      });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const backfillLensApertureMutation = useMutation({
    mutationFn: (id: number) => api.sources.backfillLensAperture(id),
    onSuccess: () => {
      notifications.show({
        message: t('sources.lensApertureBackfillStarted'),
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
        <Title order={3}>{t('sources.title')}</Title>
        <Button
          leftSection={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          {t('sources.add')}
        </Button>
      </Group>

      {sources.length === 0 ? (
        <Text c="dimmed">{t('sources.empty')}</Text>
      ) : (
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th>{t('common.type')}</Table.Th>
              <Table.Th>{t('sources.path')}</Table.Th>
              <Table.Th>{t('sources.photos')}</Table.Th>
              <Table.Th>{t('sources.shown')}</Table.Th>
              <Table.Th>{t('common.status')}</Table.Th>
              <Table.Th>{t('common.actions')}</Table.Th>
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
                onBackfillLensAperture={(id) =>
                  backfillLensApertureMutation.mutateAsync(id)
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
        title={t('sources.deleteTitle')}
      >
        <Text mb="md">
          {t('sources.deleteConfirm', { name: pendingDelete?.name })}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setPendingDelete(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() =>
              pendingDelete && deleteMutation.mutate(pendingDelete.id)
            }
          >
            {t('common.delete')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
