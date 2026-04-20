import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function CameraScanner({ active, onScan, onError }) {
  const elementId = useRef(`scanner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    } catch (e) { console.warn('CameraScanner stop:', e.message); }
    try {
      scannerRef.current.clear();
    } catch (e) { console.warn('CameraScanner clear:', e.message); }
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

    const el = document.getElementById(elementId.current);
    if (!el) return;

    const startCamera = async () => {
      // 1. 非安全上下文（HTTP）时 getUserMedia 直接被浏览器拒绝，无法弹出权限对话框
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        if (mountedRef.current) onError('camera_https_required');
        return;
      }

      // 2. 浏览器不支持 mediaDevices（极旧或特殊内置浏览器）
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        if (mountedRef.current) onError('camera_unsupported');
        return;
      }

      // 3. 用 Permissions API 预检状态（避免权限已被永久拒绝时用户无感知）
      try {
        const perm = await navigator.permissions.query({ name: 'camera' });
        if (perm.state === 'denied') {
          if (mountedRef.current) onError('camera_denied');
          return;
        }
      } catch (_) {
        // Permissions API 不支持 camera query 时跳过预检，由 catch 兜底
      }

      const scanner = new Html5Qrcode(elementId.current);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (mountedRef.current) {
              stopScanner();
              onScan(decodedText);
            }
          },
          () => {}
        )
        .then(() => {
          if (mountedRef.current) setRunning(true);
        })
        .catch((error) => {
          if (!mountedRef.current) return;
          // 用 error.name 判断类型比字符串 includes 更可靠
          const name = error?.name || '';
          const msg = error instanceof Error ? error.message : String(error);
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError'
              || msg.includes('Permission') || msg.includes('denied')) {
            onError('camera_denied');
          } else if (name === 'NotFoundError' || msg.includes('NotFound')
              || msg.includes('Requested device not found')) {
            onError('camera_notfound');
          } else {
            onError('camera_error');
          }
        });
    };

    startCamera();

    return () => {
      stopScanner();
    };
  }, [active]);

  if (!active) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: '#000', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'rgba(0,0,0,0.7)',
        paddingTop: 'calc(12px + var(--safe-area-top, 0px))',
      }}>
        <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>扫码识别</span>
        <button onClick={() => { stopScanner(); onError(''); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div id={elementId.current} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{
        padding: '20px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.7)',
        fontSize: 14, background: 'rgba(0,0,0,0.7)',
        paddingBottom: 'calc(20px + var(--safe-area-bottom, 0px))',
      }}>
        将二维码/条码放入框内，自动识别
      </div>
    </div>
  );
}
