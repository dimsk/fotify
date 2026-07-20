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
import { useTranslation } from 'react-i18next';
import {
  Aperture,
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

const STATUS_COLOR: Record<
  Source['status'] | 'backfilling_locations' | 'backfilling_lens_aperture',
  string
> = {
  idle: 'teal',
  scanning: 'blue',
  backfilling_locations: 'violet',
  backfilling_lens_aperture: 'orange',
  error: 'red',
};

interface SourceRowProps {
  source: Source;
  onRescan: (id: number) => void;
  onBackfillLocations: (id: number) => Promise<void>;
  onBackfillLensAperture: (id: number) => Promise<void>;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onDelete: (source: Source) => void;
}

export function SourceRow({
  source,
  onRescan,
  onBackfillLocations,
  onBackfillLensAperture,
  onPause,
  onResume,
  onDelete,
}: SourceRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [locationBackfillActive, setLocationBackfillActive] = useState(false);
  const [lensApertureBackfillActive, setLensApertureBackfillActive] =
    useState(false);
  const progress = useScanProgress(
    source.status === 'scanning' ||
      locationBackfillActive ||
      source.locationBackfillActive ||
      lensApertureBackfillActive ||
      source.lensApertureBackfillActive
      ? source.id
      : null,
  );
  const scanProgress = progress?.status === 'scanning' ? progress : null;
  const locationProgress =
    progress?.status === 'backfilling_locations' ? progress : null;
  const lensApertureProgress =
    progress?.status === 'backfilling_lens_aperture' ? progress : null;
  const isLocationBackfilling =
    locationBackfillActive || source.locationBackfillActive;
  const isLensApertureBackfilling =
    lensApertureBackfillActive || source.lensApertureBackfillActive;
  const displayedStatus =
    locationProgress || isLocationBackfilling
      ? 'backfilling_locations'
      : lensApertureProgress || isLensApertureBackfilling
        ? 'backfilling_lens_aperture'
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

  useEffect(() => {
    if (
      !lensApertureBackfillActive ||
      !progress ||
      progress.status === 'backfilling_lens_aperture'
    )
      return;
    if (progress.status === 'idle' || progress.status === 'error') {
      setLensApertureBackfillActive(false);
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    }
  }, [lensApertureBackfillActive, progress, queryClient]);

  const handleLocationBackfill = async () => {
    setLocationBackfillActive(true);
    try {
      await onBackfillLocations(source.id);
    } catch {
      setLocationBackfillActive(false);
    }
  };

  const handleLensApertureBackfill = async () => {
    setLensApertureBackfillActive(true);
    try {
      await onBackfillLensAperture(source.id);
    } catch {
      setLensApertureBackfillActive(false);
    }
  };

  return (
    <Table.Tr style={source.paused ? { opacity: 0.55 } : undefined}>
      <Table.Td>
        <Group gap={6}>
          {source.name}
          {source.paused && (
            <Badge color="gray" size="sm">
              {t('sources.paused')}
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
          <Text size="sm">{source.type === 'local' ? t('common.local') : 'SMB'}</Text>
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
              {t(
                displayedStatus === 'backfilling_locations'
                  ? 'sources.status.backfilling'
                  : displayedStatus === 'backfilling_lens_aperture'
                    ? 'sources.status.backfillingLensAperture'
                    : `sources.status.${displayedStatus}`,
              )}
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
                  ? t('sources.locationsCount', {
                      processed: locationProgress.processed,
                      total: locationProgress.total,
                    })
                  : t('sources.checkingLocations')}
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
              {t('sources.checkingLocations')}
            </Text>
          )}
          {!isLocationBackfilling &&
            !locationProgress &&
            source.photosNeedingLocationBackfill > 0 && (
              <Text size="xs" c="dimmed">
                {t('sources.locationsOpen', { count: source.photosNeedingLocationBackfill })}
              </Text>
            )}
          {lensApertureProgress && (
            <>
              <Text size="xs" c="dimmed">
                {lensApertureProgress.total > 0
                  ? t('sources.lensApertureCount', {
                      processed: lensApertureProgress.processed,
                      total: lensApertureProgress.total,
                    })
                  : t('sources.checkingLensAperture')}
              </Text>
              {lensApertureProgress.total > 0 && (
                <Progress
                  value={
                    (lensApertureProgress.processed /
                      lensApertureProgress.total) *
                    100
                  }
                  size="xs"
                  color="orange"
                />
              )}
            </>
          )}
          {isLensApertureBackfilling && !lensApertureProgress && (
            <Text size="xs" c="dimmed">
              {t('sources.checkingLensAperture')}
            </Text>
          )}
          {!isLensApertureBackfilling &&
            !lensApertureProgress &&
            source.photosNeedingLensApertureBackfill > 0 && (
              <Text size="xs" c="dimmed">
                {t('sources.lensApertureOpen', {
                  count: source.photosNeedingLensApertureBackfill,
                })}
              </Text>
            )}
        </Stack>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Tooltip label={t('sources.rescan')}>
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
                ? t('sources.locationsChecked')
                : t('sources.checkLocations')
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
          <Tooltip
            label={
              source.photosNeedingLensApertureBackfill === 0
                ? t('sources.lensApertureChecked')
                : t('sources.checkLensAperture')
            }
          >
            <ActionIcon
              variant="subtle"
              color="orange"
              onClick={handleLensApertureBackfill}
              disabled={
                source.status === 'scanning' ||
                isLensApertureBackfilling ||
                source.photosNeedingLensApertureBackfill === 0
              }
            >
              <Aperture size={16} />
            </ActionIcon>
          </Tooltip>
          {source.paused ? (
            <Tooltip label={t('sources.resume')}>
              <ActionIcon
                variant="subtle"
                color="teal"
                onClick={() => onResume(source.id)}
              >
                <Play size={16} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Tooltip label={t('sources.pause')}>
              <ActionIcon variant="subtle" onClick={() => onPause(source.id)}>
                <Pause size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={t('common.delete')}>
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
