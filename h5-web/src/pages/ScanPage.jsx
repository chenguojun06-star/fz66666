import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import wx from '@/adapters/wx';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import CameraScanner from '@/components/CameraScanner';
import Icon from '@/components/Icon';

const RECENT_SCAN_TTL = 2000;

export default function ScanPage() {
  const navigate = useNavigate();
  const [scanType] = useState('production');
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [stats, setStats] = useState({ scanCount: 0, orderCount: 0, totalQuantity: 0, totalAmount: 0 });
  const [lastResult, setLastResult] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const setScanResultData = useGlobalStore((s) => s.setScanResultData);
  const setQualityData = useGlobalStore((s) => s.setQualityData);
  const setPatternScanData = useGlobalStore((s) => s.setPatternScanData);
  const recentScansRef = useRef(new Map());

  useEffect(() => {
    api.production.personalScanStats().then((res) => {
      const p = res?.data || res;
      setStats({
        scanCount: Number(p?.scanCount || 0),
        orderCount: Number(p?.orderCount || 0),
        totalQuantity: Number(p?.totalQuantity || 0),
        totalAmount: Number(p?.totalAmount || 0),
      });
    }).catch(() => {});
  }, []);

  const isRecentDuplicate = useCallback((code) => {
    const now = Date.now();
    const lastTime = recentScansRef.current.get(code);
    if (lastTime && now - lastTime < RECENT_SCAN_TTL) return true;
    recentScansRef.current.set(code, now);
    for (const [k, t] of recentScansRef.current) {
      if (now - t > RECENT_SCAN_TTL * 2) recentScansRef.current.delete(k);
    }
    return false;
  }, []);

  const handleScanResult = useCallback(async (code) => {
    if (!code || loading) return;
    if (isRecentDuplicate(code)) {
      toast.error('请勿重复扫码');
      return;
    }
    setLoading(true);
    setCameraActive(false);
    setConfirmData(null);
    try {
      const res = await api.production.executeScan({ scanCode: code, scanType });
      const data = res?.data || res;
      if (data) {
        const stage = data.progressStage || data.stage || '';
        const lowerStage = String(stage).toLowerCase();
        if (lowerStage === 'quality' || lowerStage === '质检') {
          setQualityData({ ...data, scanCode: code, scanType });
          navigate('/scan/quality');
        } else if (lowerStage === 'pattern' || lowerStage === '样板') {
          setPatternScanData({ ...data, scanCode: code, scanType });
          navigate('/scan/pattern');
        } else if (data.needConfirmProcess || (data.stageResult && data.stageResult.allBundleProcesses)) {
          setScanResultData({ ...data, scanCode: code, scanType });
          setConfirmData({ ...data, scanCode: code, scanType });
        } else {
          setScanResultData({ ...data, scanCode: code, scanType });
          setLastResult({ ...data, scanCode: code, scanType, success: true });
          setStats((prev) => ({
            ...prev,
            scanCount: prev.scanCount + 1,
            totalQuantity: prev.totalQuantity + (Number(data.quantity) || 1),
          }));
        }
        wx.vibrateShort();
      }
    } catch (err) {
      setLastResult({ scanCode: code, scanType, success: false, message: err.message || '扫码失败' });
      toast.error(err.message || '扫码失败');
    } finally {
      setLoading(false);
    }
  }, [scanType, loading, isRecentDuplicate, setScanResultData, setQualityData, setPatternScanData, navigate]);

  const handleCameraScan = () => {
    if (wx.isWechat) {
      wx.scanCode({ onlyFromCamera: true }).then((res) => {
        handleScanResult(res.result);
      }).catch(() => {});
    } else {
      setCameraActive(true);
    }
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (!code) {
      toast.error('请输入菲号或条码');
      return;
    }
    handleScanResult(code);
    setManualCode('');
  };

  const goResultPage = () => {
    if (confirmData) {
      navigate('/scan/result');
    }
  };

  return (
    <div className="scan-container">
      <div className="sub-page-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>今日统计</span>
        <button className="ghost-button" style={{ fontSize: 'var(--font-size-xs)', padding: '2px 10px' }} onClick={() => {
          api.production.personalScanStats().then((res) => {
            const p = res?.data || res;
            setStats({
              scanCount: Number(p?.scanCount || 0),
              orderCount: Number(p?.orderCount || 0),
              totalQuantity: Number(p?.totalQuantity || 0),
              totalAmount: Number(p?.totalAmount || 0),
            });
          }).catch(() => {});
        }}>刷新</button>
      </div>

      <div className="today-stats-card">
        <div className="today-stat-item">
          <div className="today-stat-value">{stats.scanCount}</div>
          <div className="today-stat-label">扫码</div>
        </div>
        <div className="today-stat-item">
          <div className="today-stat-value">{stats.orderCount}</div>
          <div className="today-stat-label">订单</div>
        </div>
        <div className="today-stat-item">
          <div className="today-stat-value">{stats.totalQuantity}</div>
          <div className="today-stat-label">数量</div>
        </div>
        <div className="today-stat-item">
          <div className="today-stat-value">¥{(stats.totalAmount || 0).toFixed(0)}</div>
          <div className="today-stat-label">收入</div>
        </div>
      </div>

      <div className="quick-entry-row">
        <div className="quick-entry-card" onClick={() => navigate('/scan/history')}>
          <Icon name="clipboard" size={18} />
          <span className="quick-entry-text">历史记录</span>
          <span className="quick-entry-desc">全部扫码记录</span>
        </div>
        <div className="quick-entry-card" onClick={() => navigate('/scan/history?mode=monthly')}>
          <Icon name="calendar" size={18} />
          <span className="quick-entry-text">当月记录</span>
          <span className="quick-entry-desc">本月汇总统计</span>
        </div>
      </div>

      {confirmData && (
        <div className="scan-result-card" onClick={goResultPage} style={{ cursor: 'pointer' }}>
          <div className="scan-result-header">
            <span className="scan-result-tag success">扫码识别结果</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>点击确认 ›</span>
          </div>
          <div className="scan-result-info">
            <span className="scan-result-info-item">款号: <span>{confirmData.styleNo || '-'}</span></span>
            <span className="scan-result-info-item">菲号: <span>{confirmData.bundleNo || '-'}</span></span>
            {confirmData.orderNo && <span className="scan-result-info-item">订单: <span>{confirmData.orderNo}</span></span>}
            {confirmData.quantity && <span className="scan-result-info-item">数量: <span>{confirmData.quantity}</span></span>}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            可一次勾选多个工序，确认后统一领取
          </div>
        </div>
      )}

      {lastResult && !confirmData && (
        <div className={`scan-result-card${lastResult.success ? '' : ' scan-fail'}`}>
          <div className="scan-result-header">
            <span className={`scan-result-tag ${lastResult.success ? 'success' : 'fail'}`}>
              {lastResult.success ? '扫码成功' : '扫码失败'}
            </span>
            {lastResult.success && lastResult.orderNo && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{lastResult.orderNo}</span>
            )}
          </div>
          {lastResult.success ? (
            <div className="scan-result-info">
              <span className="scan-result-info-item">款号: <span>{lastResult.styleNo || '-'}</span></span>
              <span className="scan-result-info-item">工序: <span>{lastResult.processName || '-'}</span></span>
              <span className="scan-result-info-item">数量: <span>{lastResult.quantity || 1}</span></span>
              {lastResult.factoryName && <span className="scan-result-info-item">工厂: <span>{lastResult.factoryName}</span></span>}
              <span className="scan-result-info-item">
                归属: <span>{lastResult.delegateTargetType === 'external' ? '外部' : '内部'}</span>
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{lastResult.message}</div>
          )}
          {lastResult.success && lastResult.delegateTargetType && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', marginTop: 4 }}>
              本工序今日累计 {lastResult.todayProcessCount || 0} 件
            </div>
          )}
          {!lastResult.success && (
            <div className="sub-page-row" style={{ marginTop: 8 }}>
              <button className="ghost-button" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }} onClick={() => window.location.reload()}>检查网络</button>
              <button className="primary-button" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }} onClick={handleCameraScan}>重新扫码</button>
            </div>
          )}
        </div>
      )}

      <div className="scan-area-card">
        <button className="scan-big-btn" onClick={handleCameraScan} disabled={loading}>
          {loading ? '...' : <Icon name="scan" size={36} color="#fff" />}
        </button>
        <div className="scan-btn-label">{loading ? '识别中...' : '扫码识别'}</div>
        <div className="scan-btn-hint">自动匹配工序</div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="text-input" placeholder="手动输入菲号/条码" value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            style={{ flex: 1, padding: '8px 12px', fontSize: 'var(--font-size-sm)' }} />
          <button className="secondary-button" onClick={handleManualSubmit} disabled={loading || !manualCode.trim()}
            style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontSize: 'var(--font-size-sm)' }}>提交</button>
        </div>
      </div>

      <CameraScanner active={cameraActive} onScan={handleScanResult}
        onError={(msg) => { if (msg) toast.error(msg); setCameraActive(false); }} />
    </div>
  );
}
