import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ScanProgressEvent } from '../api/types';

export function useScanProgress(
  sourceId: number | null,
): ScanProgressEvent | null {
  const [event, setEvent] = useState<ScanProgressEvent | null>(null);

  useEffect(() => {
    if (sourceId === null) {
      setEvent(null);
      return;
    }
    const source = new EventSource(api.sources.scanProgressUrl(sourceId));
    source.onmessage = (msg) => {
      setEvent(JSON.parse(msg.data));
    };
    source.onerror = () => {
      setEvent(
        (current) => current ?? { status: 'idle', processed: 0, total: 0 },
      );
      source.close();
    };
    return () => source.close();
  }, [sourceId]);

  return event;
}
