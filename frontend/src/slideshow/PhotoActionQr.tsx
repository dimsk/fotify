import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import styles from './PhotoActionQr.module.css';

interface SlideShownDetail {
  photoId: number | null;
}

export function PhotoActionQr() {
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const onSlideShown = (event: Event) => {
      setPhotoId((event as CustomEvent<SlideShownDetail>).detail.photoId);
    };
    window.addEventListener('fotify:slide-shown', onSlideShown);
    return () => window.removeEventListener('fotify:slide-shown', onSlideShown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (photoId === null) {
      setDataUrl(null);
      return;
    }
    const url = `${window.location.origin}/photo/${photoId}`;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 4,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((nextDataUrl) => {
        if (!cancelled) setDataUrl(nextDataUrl);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (!dataUrl) return null;

  return (
    <div className={styles.qr} aria-hidden="true">
      <img src={dataUrl} alt="" />
    </div>
  );
}
