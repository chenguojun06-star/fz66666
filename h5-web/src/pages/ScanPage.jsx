import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import wx from '@/adapters/wx';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { eventBus } from '@/utils/eventBus';
import CameraScanner from '@/components/CameraScanner';
import Icon from '@/components/Icon';
import { scanOfflineQueue, isOnline, setupOfflineQueueSync } from '@/services/scanOfflineQueue';
import { parseBundleCode, validateBundleForStage, determineAutoFlow, STAGE_LABELS } from '@/utils/scanHelpers';

function canUndoScan(record, isAdmin) {
  if (!record.scanTime && !record.createTime) return false;
  const t = new Date(record.scanTime || record.createTime).getTime();
  return Date.now() - t < 3600000 && (record.scanResult || '').toLowerCase() === 'success' && isAdmin;
}

const RECENT_SCAN_TTL = 30000;
const SUBMIT_LOCK_KEY = 'h5_scan_submit_lock';

function formatRelativeTime(timeStr) {
  if (!timeStr) return '';
  const now = Date.now();
  const t = new Date(timeStr).getTime();
  const diff = now - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return timeStr.length >= 16 ? timeStr.substring(5, 16) : timeStr;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = (() => { const r = (user?.role || '').toLowerCase(); return r === 'admin' || r === 'supervisor' || r === 'tenant_owner'; })();
  const [scanType] = useState('production');
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [stats, setStats] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [todayRecords, setTodayRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [undoingId, setUndoingId] = useState(null);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const setScanResultData = useGlobalStore((s) => s.setScanResultData);
  const setQualityData = useGlobalStore((s) => s.setQualityData);
  const setPatternScanData = useGlobalStore((s) => s.setPatternScanData);
  const recentScansRef = useRef(new Map());
  const submitLockRef = useRef(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.production.personalScanStats();
      const p = res?.data ?? res;
      if (p) {
        setStats({
          scanCount: Number(p.scanCount ?? p.todayScanCount ?? 0),
          orderCount: Number(p.orderCount ?? 0),
          totalQuantity: Number(p.totalQuantity ?? p.quantity ?? 0),
          totalAmount: Number(p.totalAmount ?? p.amount ?? 0),
        });
      }
    } catch (e) {
      setStats({ scanCount: 0, orderCount: 0, totalQuantity: 0, totalAmount: 0 });
    }
  }, []);

  const loadTodayHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.production.myScanHistory({
        currentUser: 'true', page: 1, pageSize: 50,
        startTime: today + ' 00:00:00', endTime: today + ' 23:59:59',
      });
      const data = res?.data || res || {};
      const list = (data?.records || data?.list || []).filter(item => (item.scanResult || '').toLowerCase() !== 'failure');
      const formatted = list.map(item => ({
        ...item,
        displayTime: formatRelativeTime(item.scanTime || item.createTime),
        displayRawTime: item.scanTime || item.createTime || '',
        displayProcess: item.processName || item.progressStage || '-',
        displayOrderNo: item.orderNo || '-',
        displayStyleNo: item.styleNo || '-',
        displayBundleNo: item.bundleNo || item.cuttingBundleQrCode || '-',
        displayColor: item.color || '-',
        displaySize: item.size || '-',
        displayQuantity: item.quantity || 0,
        displayUnitPrice: item.unitPrice ? `¥${Number(item.unitPrice).toFixed(2)}` : '-',
        displayOperator: item.workerName || item.operatorName || item.displayName || '-',
        canUndo: canUndoScan(item, isAdmin),
      }));
      setTodayRecords(formatted);
    } catch (e) {
      setTodayRecords([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadStats(); loadTodayHistory(); }, [loadStats, loadTodayHistory]);

  useEffect(() => {
    const onRefresh = () => { loadStats(); loadTodayHistory(); };
    eventBus.on('DATA_REFRESH', onRefresh);
    return () => eventBus.off('DATA_REFRESH', onRefresh);
  }, [loadStats, loadTodayHistory]);

  useEffect(() => {
    const tryFlush = setupOfflineQueueSync(api, ({ type, result }) => {
      if (type === 'success') {
        loadStats();
        loadTodayHistory();
        setOfflineCount((prev) => Math.max(0, prev - 1));
        toast.success('离线扫码已同步');
      }
    });
    scanOfflineQueue.getPendingCount().then(setOfflineCount).catch(() => {});
    return () => {};
  }, []);

  useEffect(() => {
    const checkDayChange = () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (checkDayChange._lastDay && checkDayChange._lastDay !== todayStr) {
        loadStats();
        loadTodayHistory();
      }
      checkDayChange._lastDay = todayStr;
    };
    const timer = setInterval(checkDayChange, 60000);
    checkDayChange();
    return () => clearInterval(timer);
  }, [loadStats, loadTodayHistory]);

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
    if (!code || loading || submitLockRef.current) return;
    if (isRecentDuplicate(code)) { toast.error('请勿重复扫码'); return; }
    submitLockRef.current = true;
    setLoading(true);
    setCameraActive(false);
    if (!isOnline()) {
      try {
        await scanOfflineQueue.enqueue({
          scanCode: code,
          scanType,
          requestId: `h5_offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          quantity: 1,
          processCode: '',
          orderId: '',
          bundleNo: '',
        });
        setLastResult({ scanCode: code, scanType, success: true, message: '网络离线，扫码已缓存，联网后自动上传' });
        toast.warn('网络离线，扫码已缓存');
        setOfflineCount((prev) => prev + 1);
      } catch (e) {
        toast.error('离线缓存失败，请检查存储空间');
      } finally { setLoading(false); submitLockRef.current = false; }
      return;
    }
    try {
      const parsedCode = parseBundleCode(code);
      if (parsedCode && parsedCode.type !== 'unknown') {
        const validation = validateBundleForStage(parsedCode, scanType);
        if (!validation.valid) {
          toast.error(validation.reason);
          setLastResult({ scanCode: code, scanType, success: false, message: validation.reason });
          return;
        }
      }
      const res = await api.production.executeScan({
        scanCode: code, scanType,
        requestId: `h5_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        source: 'h5',
      });
      const data = res?.data || res;
      if (data) {
        const stage = data.progressStage || data.stage || '';
        const lowerStage = String(stage).toLowerCase();
        const flowInfo = determineAutoFlow(data);
        if (lowerStage === 'quality' || lowerStage === '质检') {
          setQualityData({ ...data, scanCode: code, scanType });
          navigate('/scan/quality');
        } else if (lowerStage === 'pattern' || lowerStage === '样板') {
          setPatternScanData({ ...data, scanCode: code, scanType });
          navigate('/scan/pattern');
        } else if (data.needConfirmProcess || (data.stageResult && data.stageResult.allBundleProcesses)) {
          setScanResultData({ ...data, scanCode: code, scanType, flowInfo });
          navigate('/scan/confirm');
        } else {
          setScanResultData({ ...data, scanCode: code, scanType });
          setLastResult({ ...data, scanCode: code, scanType, success: true });
          if (flowInfo) {
            toast.success(flowInfo.message);
          } else {
            toast.success(data.message || '扫码成功');
          }
          setStats((prev) => prev ? { ...prev, scanCount: prev.scanCount + 1, totalQuantity: prev.totalQuantity + (Number(data.quantity) || 1) } : { scanCount: 1, orderCount: 0, totalQuantity: Number(data.quantity) || 1, totalAmount: 0 });
        }
        wx.vibrateShort();
        loadTodayHistory();
      }
    } catch (err) {
      setLastResult({ scanCode: code, scanType, success: false, message: err.message || '扫码失败' });
      toast.error(err.message || '扫码失败');
    } finally { setLoading(false); submitLockRef.current = false; }
  }, [scanType, loading, isRecentDuplicate, setScanResultData, setQualityData, setPatternScanData, navigate, loadTodayHistory]);

  const handleCameraScan = () => {
    if (wx.isWechat) {
      wx.scanCode({ onlyFromCamera: true })
        .then((res) => { handleScanResult(res.result); })
        .catch((e) => {
          // 用户主动取消扫码，静默忽略
          if (e?.errMsg?.includes('cancel')) return;
          // wx.config 未调用或 SDK 调用失败 → 降级到 H5 摄像头扫码
          console.warn('wx.scanCode 失败，降级到 H5 摄像头:', e);
          toast.error('相机打开失败，请重试');
          setCameraActive(true);
        });
    } else {
      setCameraActive(true);
    }
  };

  const handleUndoRecord = async (record) => {
    if (!record.id) { toast.error('无法撤回'); return; }
    if (!window.confirm('确定撤回此条扫码记录？')) return;
    setUndoingId(record.id);
    try {
      await api.production.undoScan({ recordId: record.id });
      toast.success('撤回成功');
      setTodayRecords(prev => prev.filter(r => r.id !== record.id));
      setStats(prev => prev ? { ...prev, scanCount: Math.max(0, prev.scanCount - 1), totalQuantity: Math.max(0, prev.totalQuantity - (record.displayQuantity || 0)) } : prev);
    } catch (e) { toast.error(e.message || '撤回失败'); }
    finally { setUndoingId(null); }
  };

  return (
    <div className="scan-container">
      {/* === 上区：今日统计 === */}
      <div className="card-item">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>今日统计</span>
          <button className="refresh-btn" onClick={loadStats}>
            <Icon name="refresh" size={12} /> 刷新
          </button>
        </div>
        <div style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>{stats?.scanCount ?? '-'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>扫码</div>
          </div>
          <div style={{ width: 1, background: 'var(--color-border-light)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>{stats?.orderCount ?? '-'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>订单</div>
          </div>
          <div style={{ width: 1, background: 'var(--color-border-light)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success)' }}>{stats?.totalQuantity ?? '-'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>数量</div>
          </div>
          <div style={{ width: 1, background: 'var(--color-border-light)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-warning)' }}>{stats ? `¥${stats.totalAmount.toFixed(0)}` : '-'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>收入</div>
          </div>
        </div>
      </div>

      {/* === 中区：扫码结果 === */}
      {lastResult && (
        <div className="card-item" style={{ borderLeft: `3px solid ${lastResult.success ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: lastResult.success ? 'var(--color-success)' : 'var(--color-danger)', marginBottom: 6 }}>
            {lastResult.success ? '扫码成功' : '扫码失败'}
          </div>
          {lastResult.success ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>款号: <strong style={{ color: 'var(--color-text-primary)' }}>{lastResult.styleNo || '-'}</strong></span>
              <span style={{ color: 'var(--color-text-secondary)' }}>工序: <strong style={{ color: 'var(--color-text-primary)' }}>{lastResult.processName || '-'}</strong></span>
              <span style={{ color: 'var(--color-text-secondary)' }}>数量: <strong style={{ color: 'var(--color-text-primary)' }}>{lastResult.quantity || 1}</strong></span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{lastResult.message}</div>
          )}
        </div>
      )}

      {/* === 中区：扫码按钮 === */}
      <div className="card-item" style={{ textAlign: 'center', padding: '14px 16px' }}>
        <button className="scan-big-btn" onClick={handleCameraScan} disabled={loading}>
          {loading ? <span className="scan-spinner" /> : <Icon name="scan" size={36} color="#fff" />}
        </button>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', marginTop: 8 }}>
          {loading ? '识别中...' : '扫码识别'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>自动匹配工序</div>
      </div>

      {/* === 下区：今日记录 === */}
      <div className="card-item">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>今日记录</span>
          <button className="filter-btn" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => navigate('/scan/history')}>查看全部 ›</button>
        </div>
        {loadingHistory ? (
          <div className="loading-state" style={{ padding: 16 }}>加载中...</div>
        ) : todayRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, fontSize: 13, color: 'var(--color-text-secondary)' }}>暂无今日记录</div>
        ) : (
          <div className="today-records-list">
            {(() => {
              const groups = {};
              todayRecords.forEach(r => {
                const key = `${r.displayOrderNo}|${r.displayProcess}`;
                if (!groups[key]) groups[key] = { id: key, orderNo: r.displayOrderNo, styleNo: r.displayStyleNo, process: r.displayProcess, items: [], totalQty: 0, latestTime: '' };
                groups[key].items.push(r);
                groups[key].totalQty += r.displayQuantity;
                if (!groups[key].latestTime || (r.displayRawTime > groups[key].latestTime)) groups[key].latestTime = r.displayRawTime;
              });
              const groupList = Object.values(groups).sort((a, b) => b.latestTime.localeCompare(a.latestTime));
              return groupList.map(g => {
                const isExpanded = expandedGroupId === g.id;
                return (
                  <div key={g.id} className="today-record-group">
                    <div className="today-record-group-header" onClick={() => setExpandedGroupId(isExpanded ? null : g.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>{g.orderNo}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{g.styleNo}</span>
                        <span className="tag tag-blue" style={{ fontSize: 11 }}>{g.process}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12 }}>
                        <span style={{ color: 'var(--color-text-tertiary)' }}>{formatRelativeTime(g.latestTime)}</span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>共{g.totalQty}件</span>
                        <span style={{ color: 'var(--color-primary)', marginLeft: 'auto' }}>{isExpanded ? '收起' : '展开'} ›</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="today-record-group-details">
                        {g.items.map((r, ri) => (
                          <div key={r.id || ri} className="today-record-detail-item">
                            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              <span>颜色: <strong style={{ color: 'var(--color-text-primary)' }}>{r.displayColor}</strong></span>
                              <span>单价: <strong style={{ color: 'var(--color-text-primary)' }}>{r.displayUnitPrice}</strong></span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                              <span>码数: <strong style={{ color: 'var(--color-text-primary)' }}>{r.displaySize}</strong></span>
                              <span>数量: <strong style={{ color: 'var(--color-text-primary)' }}>{r.displayQuantity}件</strong></span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                              <span>{r.displayRawTime.length >= 16 ? r.displayRawTime.substring(5, 16) : r.displayRawTime}</span>
                              {r.displayOperator && r.displayOperator !== '-' && <span>{r.displayOperator}</span>}
                              {r.canUndo && (
                                <button className="filter-btn" style={{ fontSize: 10, padding: '1px 8px', marginLeft: 'auto' }} disabled={undoingId === r.id} onClick={() => handleUndoRecord(r)}>
                                  {undoingId === r.id ? '...' : '撤回'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      <CameraScanner active={cameraActive} onScan={handleScanResult}
        onError={(msg) => { if (msg) toast.error(msg); setCameraActive(false); }} />
    </div>
  );
}
