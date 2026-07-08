import { useState } from 'react';
import { Alert, Button, Modal, Stack, Tabs, TextInput, PasswordInput, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { CreateSourceInput } from '../../api/types';
import { DirectoryBrowser } from '../../components/DirectoryBrowser';

interface AddSourceModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddSourceModal({ opened, onClose }: AddSourceModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'local' | 'smb'>('local');

  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState<string | null>(null);

  const [smbHost, setSmbHost] = useState('');
  const [smbShare, setSmbShare] = useState('');
  const [smbUsername, setSmbUsername] = useState('');
  const [smbPassword, setSmbPassword] = useState('');
  const [smbDomain, setSmbDomain] = useState('');
  const [smbRootPath, setSmbRootPath] = useState<string | null>(null);
  const [smbBrowseArmed, setSmbBrowseArmed] = useState(false);

  const createMutation = useMutation({
    mutationFn: (input: CreateSourceInput) => api.sources.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      resetAndClose();
    },
  });

  function resetAndClose() {
    setName('');
    setLocalPath(null);
    setSmbHost('');
    setSmbShare('');
    setSmbUsername('');
    setSmbPassword('');
    setSmbDomain('');
    setSmbRootPath(null);
    setSmbBrowseArmed(false);
    setTab('local');
    onClose();
  }

  const canSubmitLocal = name.trim().length > 0 && !!localPath;
  const canSubmitSmb =
    name.trim().length > 0 && smbHost.trim().length > 0 && smbShare.trim().length > 0 &&
    smbUsername.trim().length > 0 && smbPassword.length > 0;

  function submitLocal() {
    if (!localPath) return;
    createMutation.mutate({ type: 'local', name: name.trim(), localPath });
  }

  function submitSmb() {
    createMutation.mutate({
      type: 'smb',
      name: name.trim(),
      smbHost: smbHost.trim(),
      smbShare: smbShare.trim(),
      smbUsername: smbUsername.trim(),
      smbPassword,
      smbDomain: smbDomain.trim() || undefined,
      smbRootPath: smbRootPath ?? undefined,
    });
  }

  return (
    <Modal opened={opened} onClose={resetAndClose} title={t('sources.addModalTitle')} size="lg">
      <Stack gap="md">
        <TextInput
          label={t('common.name')}
          placeholder={t('sources.exampleName')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

        <Tabs value={tab} onChange={(v) => setTab((v as 'local' | 'smb') ?? 'local')}>
          <Tabs.List>
            <Tabs.Tab value="local" leftSection={<FolderOpen size={16} />}>
              {t('sources.localTab')}
            </Tabs.Tab>
            <Tabs.Tab value="smb" leftSection={<Server size={16} />}>
              {t('sources.smbTab')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="local" pt="md">
            <Stack gap="xs">
              <DirectoryBrowser listDirectory={(path) => api.sources.browseLocal(path)} onSelect={setLocalPath} />
              {localPath && (
                <Text size="sm" c="teal">
                  {t('sources.selected', { path: localPath })}
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="smb" pt="md">
            <Stack gap="xs">
               <TextInput label={t('sources.host')} value={smbHost} onChange={(e) => setSmbHost(e.currentTarget.value)} required />
               <TextInput label={t('sources.shareName')} value={smbShare} onChange={(e) => setSmbShare(e.currentTarget.value)} required />
              <TextInput
                label={t('sources.username')}
                value={smbUsername}
                onChange={(e) => setSmbUsername(e.currentTarget.value)}
                required
              />
              <PasswordInput
                label={t('sources.password')}
                value={smbPassword}
                onChange={(e) => setSmbPassword(e.currentTarget.value)}
                required
              />
              <TextInput
                label={t('sources.domain')}
                value={smbDomain}
                onChange={(e) => setSmbDomain(e.currentTarget.value)}
              />

              {!smbBrowseArmed ? (
                <Button
                  variant="light"
                  disabled={!smbHost || !smbShare || !smbUsername || !smbPassword}
                  onClick={() => setSmbBrowseArmed(true)}
                >
                  {t('sources.connectBrowse')}
                </Button>
              ) : (
                <DirectoryBrowser
                  listDirectory={(path) =>
                    api.sources.browseSmb({
                      host: smbHost.trim(),
                      share: smbShare.trim(),
                      username: smbUsername.trim(),
                      password: smbPassword,
                      domain: smbDomain.trim() || undefined,
                      path,
                    })
                  }
                  onSelect={setSmbRootPath}
                />
              )}
              {smbRootPath !== null && (
                <Text size="sm" c="teal">
                  {t('sources.selectedSubfolder', { path: smbRootPath || t('sources.shareRoot') })}
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {createMutation.isError && (
          <Alert color="red" title={t('sources.addError')}>
            {(createMutation.error as Error).message}
          </Alert>
        )}

        <Button
          onClick={tab === 'local' ? submitLocal : submitSmb}
          disabled={tab === 'local' ? !canSubmitLocal : !canSubmitSmb}
          loading={createMutation.isPending}
        >
          {t('sources.add')}
        </Button>
      </Stack>
    </Modal>
  );
}
