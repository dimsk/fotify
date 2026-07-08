import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import type { Source } from '../../api/types';
import { useScanProgress } from '../../hooks/useScanProgress';

const STATUS_COLOR: Record<Source['status'] | 'backfilling_locations', string> =
  {
    idle: 'teal',
    scanning: 'blue',
    backfilling_locations: 'violet',
    error: 'red',
  };

const STATUS_LABEL: Record<Source['status'] | 'backfilling_locations', string> =
  {
    idle: 'idle',
    scanning: 'scanning',
    backfilling_locations: 'Standorte',
    error: 'error',
  };

interface SourceRowProps {
  source: Source;
  onRescan: (id: number) => void;
  onBackfillLocations: (id: number) => Promise<void>;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onDelete: (source: Source) => void;
}

export function SourceRow({
  source,
  onRescan,
  onBackfillLocations,
  onPause,
  onResume,
  onDelete,
}: SourceRowProps) {
  const queryClient = useQueryClient();
  const [locationBackfillActive, setLocationBackfillActive] = useState(false);
  const progress = useScanProgress(
    source.status === 'scanning' ||
      locationBackfillActive ||
      source.locationBackfillActive
      ? source.id
      : null,
  );
  const scanProgress = progress?.status === 'scanning' ? progress : null;
  const locationProgress =
    progress?.status === 'backfilling_locations' ? progress : null;
  const isLocationBackfilling =
    locationBackfillActive || source.locationBackfillActive;
  const displayedStatus =
    locationProgress || isLocationBackfilling
      ? 'backfilling_locations'
      : source.status;

  const location =
    source.type === 'local'
      ? source.localPath
      : `${source.smbHost}/${source.smbShare}${source.smbRootPath ? '/' + source.smbRootPath : ''}`;

  useEffect(() => {
    if (
      !locationBackfillActive ||
      !progress ||
      progress.status === 'backfilling_locations'
    )
      return;
    if (progress.status === 'idle' || progress.status === 'error') {
      setLocationBackfillActive(false);
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    }
  }, [locationBackfillActive, progress, queryClient]);

  const handleLocationBackfill = async () => {
    setLocationBackfillActive(true);
    try {
      await onBackfillLocations(source.id);
    } catch {
      setLocationBackfillActive(false);
    }
  };

  return (
    <Table.Tr style={source.paused ? { opacity: 0.55 } : undefined}>
      <Table.Td>
        <Group gap={6}>
          {source.name}
          {source.paused && (
            <Badge color="gray" size="sm">
              Pausiert
            </Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          {source.type === 'local' ? (
            <FolderOpen size={14} />
          ) : (
            <Server size={14} />
          )}
          <Text size="sm">{source.type === 'local' ? 'Lokal' : 'SMB'}</Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed" style={{ fontFamily: 'monospace' }}>
          {location}
        </Text>
      </Table.Td>
      <Table.Td>{source.photoCount}</Table.Td>
      <Table.Td>{source.shownCount}</Table.Td>
      <Table.Td>
        <Stack gap={4} style={{ minWidth: 130 }}>
          <Tooltip
            label={source.lastScanError ?? progress?.error ?? ''}
            disabled={!source.lastScanError && !progress?.error}
          >
            <Badge
              color={STATUS_COLOR[displayedStatus]}
              style={{ width: 'max-content' }}
            >
              {STATUS_LABEL[displayedStatus]}
            </Badge>
          </Tooltip>
          {scanProgress && scanProgress.total > 0 && (
            <Progress
              value={(scanProgress.processed / scanProgress.total) * 100}
              size="xs"
            />
          )}
          {locationProgress && (
            <>
              <Text size="xs" c="dimmed">
                {locationProgress.total > 0
                  ? `${locationProgress.processed}/${locationProgress.total} Standort(e)`
                  : 'Standorte werden geprüft...'}
              </Text>
              {locationProgress.total > 0 && (
                <Progress
                  value={
                    (locationProgress.processed / locationProgress.total) * 100
                  }
                  size="xs"
                  color="violet"
                />
              )}
            </>
          )}
          {isLocationBackfilling && !locationProgress && (
            <Text size="xs" c="dimmed">
              Standorte werden geprüft...
            </Text>
          )}
          {!isLocationBackfilling &&
            !locationProgress &&
            source.photosNeedingLocationBackfill > 0 && (
              <Text size="xs" c="dimmed">
                {source.photosNeedingLocationBackfill} Standort(e) offen
              </Text>
            )}
        </Stack>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Tooltip label="Neu scannen">
            <ActionIcon
              variant="subtle"
              onClick={() => onRescan(source.id)}
              disabled={source.status === 'scanning'}
            >
              <RefreshCw size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              source.photosNeedingLocationBackfill === 0
                ? 'Standorte geprüft'
                : 'Standorte prüfen'
            }
          >
            <ActionIcon
              variant="subtle"
              color="violet"
              onClick={handleLocationBackfill}
              disabled={
                source.status === 'scanning' ||
                isLocationBackfilling ||
                source.photosNeedingLocationBackfill === 0
              }
            >
              <MapPin size={16} />
            </ActionIcon>
          </Tooltip>
          {source.paused ? (
            <Tooltip label="Fortsetzen">
              <ActionIcon
                variant="subtle"
                color="teal"
                onClick={() => onResume(source.id)}
              >
                <Play size={16} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Tooltip label="Pausieren">
              <ActionIcon variant="subtle" onClick={() => onPause(source.id)}>
                <Pause size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Löschen">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => onDelete(source)}
            >
              <Trash2 size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
