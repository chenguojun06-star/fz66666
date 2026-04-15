import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import wx from '@/adapters/wx';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import CameraScanner from '@/components/CameraScanner';
import Icon from '@/components/Icon';

export default function ScanPage() {
  const navigate = useNavigate();
  const [scanType, setScanType] = useState('production');
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [stats, setStats] = useState({ scanCount: 0, orderCount: 0, totalQuantity: 0, totalAmount: 0 });
  const [lastResult, setLastResult] = useState(null);
  const setScanResultData = useGlobalStore((s) => s.setScanResultData);

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

  const handleScanResult = useCallback(async (code) => {
    if (!code || loading) return;
    setLoading(true);
    try {
      const res = await api.production.executeScan({ scanCode: code, scanType });
      const data = res?.data || res;
      if (data) {
        setLastResult({ ...data, scanCode: code, scanType, success: true });
        setScanResultData({ ...data, scanCode: code, scanType });
        setStats((prev) => ({
          ...prev,
          scanCount: prev.scanCount + 1,
          totalQuantity: prev.totalQuantity + (Number(data.quantity) || 1),
        }));
        wx.vibrateShort();
      }
    } catch (err) {
      setLastResult({ scanCode: code, scanType, success: false, message: err.message || '扫码失败' });
      toast.error(err.message || '扫码失败');
    } finally {
      setLoading(false);
    }
  }, [scanType, loading, setScanResultData]);

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

      {lastResult && (
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
            </div>
          ) : (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{lastResult.message}</div>
          )}
        </div>
      )}

      <div className="scan-area-card">
        <button className="scan-big-btn" onClick={handleCameraScan} disabled={loading}>
          {loading ? '...' : <Icon name="scan" size={36} color="#fff" />}
        </button>
        <div className="scan-btn-label">{loading ? '识别中...' : '扫码识别'}</div>
        <div className="scan-btn-hint">自动匹配工序</div>
        <div style={{ fontSize: 'var(--font-size-xxs)', color: 'var(--color-text-disabled)', marginTop: 6, textAlign: 'center', lineHeight: 1.4 }}>
          说明：系统会按订单工序模板与历史扫码自动识别当前应执行工序，仅允许流转到未完成工序。
        </div>
      </div>

      {cameraActive && (
        <CameraScanner active={cameraActive} onScan={handleScanResult}
          onError={(msg) => { toast.error(msg); setCameraActive(false); }} />
      )}
    </div>
  );
}
