import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import wx from '@/adapters/wx';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import CameraScanner from '@/components/CameraScanner';
import useVoiceInput from '@/hooks/useVoiceInput';

const SCAN_TYPES = [
  { key: 'production', label: '生产', icon: '🏭' },
  { key: 'cutting', label: '裁剪', icon: '✂️' },
  { key: 'quality', label: '质检', icon: '🔍' },
  { key: 'warehouse', label: '入库', icon: '📦' },
  { key: 'procurement', label: '采购', icon: '🛒' },
  { key: 'packaging', label: '包装', icon: '🎁' },
];

export default function ScanPage() {
  const navigate = useNavigate();
  const [scanType, setScanType] = useState('production');
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const setScanResultData = useGlobalStore((s) => s.setScanResultData);

  const voice = useVoiceInput({
    lang: 'zh-CN',
    continuous: false,
    onResult: (transcript) => {
      setManualCode(transcript.replace(/\s+/g, ''));
    },
  });

  useEffect(() => {
    if (voice.error === 'NOT_SUPPORTED') {
      toast.info('当前浏览器不支持语音识别');
    } else if (voice.error === 'PERMISSION_DENIED') {
      toast.error('请允许麦克风权限');
    } else if (voice.error && voice.error !== 'NO_SPEECH' && voice.error !== 'aborted') {
      toast.error('语音识别出错：' + voice.error);
    }
  }, [voice.error]);

  const handleScanResult = useCallback(async (code) => {
    if (!code || loading) return;
    setLoading(true);
    try {
      const res = await api.production.executeScan({
        scanCode: code,
        scanType,
      });
      const data = res?.data || res;
      if (data) {
        setScanResultData({ ...data, scanCode: code, scanType });
        navigate('/scan/scan-result');
      }
    } catch (err) {
      toast.error(err.message || '扫码失败');
    } finally {
      setLoading(false);
    }
  }, [scanType, loading, navigate, setScanResultData]);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (!code) { toast.error('请输入菲号'); return; }
    handleScanResult(code);
  };

  const handleCameraScan = () => {
    if (wx.isWechat) {
      wx.scanCode({ onlyFromCamera: true }).then((res) => {
        handleScanResult(res.result);
      }).catch(() => {});
    } else {
      setCameraActive(true);
    }
  };

  return (
    <div className="scan-stack">
      <div className="scan-type-bar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
        {SCAN_TYPES.map((t) => (
          <button
            key={t.key}
            className={`scan-type-chip${scanType === t.key ? ' active' : ''}`}
            onClick={() => setScanType(t.key)}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 20, border: '1px solid var(--color-border)',
              background: scanType === t.key ? 'var(--color-primary)' : 'var(--color-bg-light)',
              color: scanType === t.key ? '#fff' : 'var(--color-text-primary)',
              fontWeight: scanType === t.key ? 700 : 400, cursor: 'pointer', fontSize: 13,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="hero-card compact">
        <h3 className="hero-title small">扫码操作</h3>
        <p className="hero-subtitle">选择扫码类型后，点击扫码或手动输入菲号</p>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="primary-button" style={{ flex: 1 }} onClick={handleCameraScan}>
          📷 扫码
        </button>
        <button className="secondary-button" style={{ flex: 1 }} onClick={() => navigate('/scan/history')}>
          📋 历史
        </button>
      </div>

      {cameraActive && (
        <CameraScanner
          active={cameraActive}
          onScan={handleScanResult}
          onError={(msg) => { toast.error(msg); setCameraActive(false); }}
        />
      )}

      <div className="manual-panel" style={{ padding: 18 }}>
        <div className="field-block">
          <label>手动输入菲号</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="text-input"
              placeholder={voice.listening ? '正在聆听菲号...' : '输入菲号/二维码内容'}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              style={{ flex: 1 }}
            />
            <button
              onClick={voice.toggle}
              style={{
                width: 40, height: 40, borderRadius: 20, flexShrink: 0,
                border: voice.listening ? '2px solid #ef4444' : '1px solid var(--color-border)',
                background: voice.listening ? '#fef2f2' : 'var(--color-bg-light)',
                fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: voice.listening ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}
              title="语音输入菲号"
            >
              🎤
            </button>
            <button className="primary-button" onClick={handleManualSubmit} disabled={loading}>
              提交
            </button>
          </div>
          {voice.listening && (
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }}>🔴</span>
              正在聆听，请说出菲号...
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
