import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function CameraScanner({ active, onScan, onError }) {
  const elementId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const [running, setRunning] = useState(false);
  const mountedRef = useRef(true);

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState();
      if (state === 2 || state === 3) {
        await scannerRef.current.stop();
      }
    } catch (_) {}
    try {
      scannerRef.current.clear();
    } catch (_) {}
    scannerRef.current = null;
    if (mountedRef.current) setRunning(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  useEffect(() => {
    if (!active) {
      stopScanner();
      return;
    }
    if (running) return;

    const scanner = new Html5Qrcode(elementId.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (mountedRef.current) onScan(decodedText);
        },
        () => {}
      )
      .then(() => {
        if (mountedRef.current) setRunning(true);
      })
      .catch((error) => {
        if (mountedRef.current) {
          onError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      stopScanner();
    };
  }, [active]);

  return <div id={elementId.current} className="scanner-frame" />;
}
