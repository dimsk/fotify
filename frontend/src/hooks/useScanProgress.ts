import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ScanProgressEvent } from '../api/types';

let sharedSocket: Socket | null = null;

/** One lazily-created socket for all admin-side progress subscriptions. */
function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({ transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

export function useScanProgress(
  sourceId: number | null,
): ScanProgressEvent | null {
  const [event, setEvent] = useState<ScanProgressEvent | null>(null);

  useEffect(() => {
    if (sourceId === null) {
      setEvent(null);
      return;
    }
    const socket = getSocket();
    const onProgress = (progress: ScanProgressEvent) => {
      // The shared socket is joined to every watched source's room, so it
      // receives all their events — only adopt the ones for this source.
      if (progress.sourceId === sourceId) setEvent(progress);
    };
    const subscribe = () => socket.emit('scan:watch', sourceId);

    socket.on('scan:progress', onProgress);
    socket.on('connect', subscribe);
    subscribe();

    return () => {
      socket.off('scan:progress', onProgress);
      socket.off('connect', subscribe);
      socket.emit('scan:unwatch', sourceId);
    };
  }, [sourceId]);

  return event;
}
