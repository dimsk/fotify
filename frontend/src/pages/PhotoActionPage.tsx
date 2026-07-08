import { Anchor, Button, Card, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, EyeOff, Heart } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import styles from './PhotoActionPage.module.css';

export function PhotoActionPage() {
  const { t } = useTranslation();
  const params = useParams();
  const photoId = Number(params.id);
  const queryClient = useQueryClient();
  const validPhotoId = Number.isInteger(photoId) && photoId > 0;

  const { data, isError } = useQuery({
    queryKey: ['photo-actions', photoId],
    queryFn: () => api.photos.actions(photoId),
    enabled: validPhotoId,
  });

  const favoriteMutation = useMutation({
    mutationFn: () => api.photos.favorite(photoId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['photo-actions', photoId], updated);
      notifications.show({ message: t('photoAction.favoritedNotification'), color: 'teal' });
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => api.photos.hide(photoId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['photo-actions', photoId], updated);
      notifications.show({
        message: t('photoAction.hiddenNotification'),
        color: 'teal',
      });
    },
  });

  if (!validPhotoId || isError) {
    return (
      <main className={styles.page}>
        <Card className={styles.panel} withBorder padding="lg" radius="md">
          <Stack>
            <Title order={3}>{t('photoAction.notFound')}</Title>
            <Anchor component={Link} to="/">
              {t('photoAction.toSlideshow')}
            </Anchor>
          </Stack>
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Card className={styles.panel} withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={3}>{t('photoAction.current')}</Title>
          <img
            className={styles.preview}
            src={api.photos.displayUrl(photoId)}
            alt=""
          />
          <div className={styles.actions}>
            <Button
              component="a"
              href={api.photos.downloadUrl(photoId)}
              leftSection={<Download size={18} />}
              variant="light"
            >
              {t('photoAction.download')}
            </Button>
            <Button
              leftSection={<Heart size={18} />}
              onClick={() => favoriteMutation.mutate()}
              loading={favoriteMutation.isPending}
              disabled={data?.favorited}
              variant={data?.favorited ? 'default' : 'light'}
            >
              {data?.favorited ? t('photoAction.favorited') : t('photoAction.favorite')}
            </Button>
            <Button
              leftSection={<EyeOff size={18} />}
              onClick={() => hideMutation.mutate()}
              loading={hideMutation.isPending}
              disabled={data?.hidden}
              color="red"
              variant={data?.hidden ? 'default' : 'light'}
            >
              {data?.hidden
                ? t('photoAction.hidden')
                : t('photoAction.hide')}
            </Button>
          </div>
          <Text size="xs" c="dimmed">
            {t('photoAction.saved')}
          </Text>
        </Stack>
      </Card>
    </main>
  );
}
