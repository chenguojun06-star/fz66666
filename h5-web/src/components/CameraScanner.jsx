import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function CameraScanner({ active, onScan, onError }) {
  const elementId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!active || running) {
      return undefined;
    }

    const scanner = new Html5Qrcode(elementId.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          onScan(decodedText);
        },
        () => {}
      )
      .then(() => setRunning(true))
      .catch((error) => {
        onError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      scannerRef.current
        ?.stop()
        .catch(() => {})
        .finally(() => {
          scannerRef.current?.clear().catch(() => {});
          setRunning(false);
        });
    };
  }, [active, onError, onScan, running]);

  return <div id={elementId.current} className="scanner-frame" />;
}
