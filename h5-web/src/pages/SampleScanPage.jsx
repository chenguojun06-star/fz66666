import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import wx from '@/adapters/wx';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { eventBus } from '@/utils/eventBus';
const CameraScanner = lazy(() => import('@/components/CameraScanner'));
import Icon from '@/components/Icon';

const OPERATION_LABELS = {
  RECEIVE: '领取', PLATE: '车板', FOLLOW_UP: '跟单', COMPLETE: '完成',
  REVIEW: '审核', WAREHOUSE_IN: '入库', WAREHOUSE_OUT: '出库', WAREHOUSE_RETURN: '归还',
};

const RECENT_SCAN_TTL = 30000;

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

function parseSampleCode(code) {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();

  try {
    const json = JSON.parse(trimmed);
    if (json.type === 'pattern' || json.patternId) {
      return { type: 'pattern', patternId: json.patternId || json.id, styleNo: json.styleNo, raw: trimmed };
    }
    if (json.styleNo && json.color && json.size) {
      return { type: 'sample', styleNo: json.styleNo, color: json.color, size: json.size, raw: trimmed };
    }
    if (json.styleNo) {
      return { type: 'sample_partial', styleNo: json.styleNo, raw: trimmed };
    }
  } catch (_) {}

  const uPattern = /^U-?([^-]+?)-([^-]+?)-([^-]+)$/;
  const uMatch = trimmed.match(uPattern);
  if (uMatch) {
    return { type: 'sample', styleNo: uMatch[1], color: uMatch[2], size: uMatch[3], raw: trimmed };
  }

  const bundlePattern = /^(PO\d{8}\d*)-(ST\d+)-(.+?)-([^-]+?)-(\d+)-(\d{2})$/;
  const bundleMatch = trimmed.match(bundlePattern);
  if (bundleMatch) {
    return { type: 'bundle', orderNo: bundleMatch[1], styleNo: bundleMatch[2], color: bundleMatch[3], size: bundleMatch[4], raw: trimmed };
  }

  return null;
}

export default function SampleScanPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [stockInfo, setStockInfo] = useState(null);
  const [actions, setActions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [todayRecords, setTodayRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [todayStats, setTodayStats] = useState({ inbound: 0, loan: 0, return: 0, total: 0 });
  const setPatternScanData = useGlobalStore((s) => s.setPatternScanData);
  const recentScansRef = useRef(new Map());

  const loadTodayHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.production.myPatternScanHistory({
        startTime: today + ' 00:00:00',
        endTime: today + ' 23:59:59',
      });
      const list = res?.data || res || [];
      const formatted = list.map(item => ({
        ...item,
        displayTime: formatRelativeTime(item.scanTime),
        displayRawTime: item.scanTime || '',
        displayOperation: OPERATION_LABELS[item.operationType] || item.operationType || '-',
        displayStyleNo: item.styleNo || '-',
        displayColor: item.color || '-',
      }));

      const stats = { inbound: 0, loan: 0, return: 0, total: list.length };
      list.forEach(item => {
        const op = String(item.operationType || '').toUpperCase();
        if (op === 'WAREHOUSE_IN') stats.inbound++;
        else if (op === 'WAREHOUSE_OUT') stats.loan++;
        else if (op === 'WAREHOUSE_RETURN') stats.return++;
      });
      setTodayStats(stats);
      setTodayRecords(formatted);
    } catch (e) {
      setTodayRecords([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadTodayHistory(); }, [loadTodayHistory]);

  useEffect(() => {
    const onRefresh = () => { loadTodayHistory(); };
    eventBus.on('DATA_REFRESH', onRefresh);
    return () => eventBus.off('DATA_REFRESH', onRefresh);
  }, [loadTodayHistory]);

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
    if (isRecentDuplicate(code)) { toast.error('请勿重复扫码'); return; }
    setLoading(true);
    setCameraActive(false);

    const parsed = parseSampleCode(code);

    if (!parsed) {
      setLastResult({ success: false, message: '无法识别的样衣编码格式' });
      toast.error('无法识别的样衣编码格式');
      setLoading(false);
      return;
    }

    if (parsed.type === 'pattern' && parsed.patternId) {
      setPatternScanData({ patternId: parsed.patternId, styleNo: parsed.styleNo, scanCode: code });
      navigate('/scan/pattern');
      setLoading(false);
      return;
    }

    if (parsed.type === 'sample' && parsed.styleNo && parsed.color && parsed.size) {
      try {
        const res = await api.sampleStock.scanQuery({ styleNo: parsed.styleNo, color: parsed.color, size: parsed.size });
        const data = res?.data || res || {};
        setStockInfo(data);
        setActions(data.actions || []);
        const found = data.found;
        setLastResult({
          success: true,
          message: found ? '样衣查询成功' : '该样衣尚未入库',
          styleNo: parsed.styleNo,
          color: parsed.color,
          size: parsed.size,
          found,
        });
        toast.success(found ? '样衣查询成功' : '该样衣尚未入库，可执行入库操作');
        wx.vibrateShort();
        loadTodayHistory();
      } catch (err) {
        setLastResult({ success: false, message: err.message || '查询失败' });
        toast.error(err.message || '查询失败');
      }
    } else if (parsed.type === 'bundle') {
      try {
        const res = await api.sampleStock.scanQuery({ styleNo: parsed.styleNo, color: parsed.color, size: parsed.size });
        const data = res?.data || res || {};
        setStockInfo(data);
        setActions(data.actions || []);
        setLastResult({
          success: true,
          message: data.found ? '样衣查询成功' : '该样衣尚未入库',
          styleNo: parsed.styleNo,
          color: parsed.color,
          size: parsed.size,
          found: data.found,
        });
        toast.success(data.found ? '样衣查询成功' : '该样衣尚未入库，可执行入库操作');
        wx.vibrateShort();
        loadTodayHistory();
      } catch (err) {
        setLastResult({ success: false, message: err.message || '查询失败' });
        toast.error(err.message || '查询失败');
      }
    } else {
      setLastResult({ success: false, message: '样衣编码缺少款号/颜色/尺码信息' });
      toast.error('样衣编码缺少款号/颜色/尺码信息');
    }
    setLoading(false);
  }, [loading, isRecentDuplicate, setPatternScanData, navigate, loadTodayHistory]);

  const handleCameraScan = () => {
    if (wx.isWechat) {
      wx.scanCode({ onlyFromCamera: true })
        .then((res) => { handleScanResult(res.result); })
        .catch((e) => {
          if (e?.errMsg?.includes('cancel')) return;
          console.warn('wx.scanCode 失败，降级到 H5 摄像头:', e);
          toast.error('相机打开失败，请重试');
          setCameraActive(true);
        });
    } else {
      setCameraActive(true);
    }
  };

  const doAction = async (actionName, apiFn) => {
    if (submitting || !stockInfo) return;
    setSubmitting(true);
    const labelMap = { inbound: '入库', loan: '借调', return: '归还' };
    const label = labelMap[actionName] || actionName;
    try {
      await apiFn();
      toast.success(`${label}成功`);
      setLastResult({ success: true, message: `${label}成功` });
      wx.vibrateShort();
      setTimeout(() => {
        if (stockInfo?.stock?.styleNo) {
          api.sampleStock.scanQuery({
            styleNo: stockInfo.stock.styleNo || lastResult?.styleNo,
            color: stockInfo.stock.color || lastResult?.color,
            size: stockInfo.stock.size || lastResult?.size,
          }).then(res => {
            const data = res?.data || res || {};
            setStockInfo(data);
            setActions(data.actions || []);
          }).catch(() => {});
        }
        loadTodayHistory();
      }, 600);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || `${label}失败`;
      toast.error(msg);
      setLastResult({ success: false, message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const onInbound = () => {
    if (!window.confirm(`确认将 ${lastResult?.styleNo || ''} ${lastResult?.color || ''} ${lastResult?.size || ''} 入库？`)) return;
    doAction('inbound', () => api.sampleStock.inbound({
      styleNo: lastResult?.styleNo, color: lastResult?.color, size: lastResult?.size, quantity: 1,
    }));
  };

  const onLoan = () => {
    if (!window.confirm(`确认借调 ${lastResult?.styleNo || ''} ${lastResult?.color || ''} ${lastResult?.size || ''}？`)) return;
    doAction('loan', () => api.sampleStock.loan({
      styleNo: lastResult?.styleNo, color: lastResult?.color, size: lastResult?.size,
      borrower: user?.name || user?.username || '', borrowerId: String(user?.id || ''), quantity: 1,
    }));
  };

  const onReturn = () => {
    const loans = stockInfo?.activeLoans || [];
    if (!loans.length) { toast.error('无借调记录'); return; }
    if (!window.confirm(`确认归还 ${lastResult?.styleNo || ''} ${lastResult?.color || ''} ${lastResult?.size || ''}？`)) return;
    doAction('return', () => api.sampleStock.returnSample({
      loanId: loans[0].id, quantity: loans[0].quantity || 1,
    }));
  };

  return (
    <div className="scan-container">
      <div className="card-item">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>今日样衣统计</span>
          <button className="refresh-btn" onClick={loadTodayHistory}>
            <Icon name="refresh" size={12} /> 刷新
          </button>
        </div>
        <div style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>{todayStats.total}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>操作</div>
          </div>
          <div style={{ width: 1, background: 'var(--color-border-light)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success)' }}>{todayStats.inbound}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>入库</div>
          </div>
          <div style={{ width: 1, background: 'var(--color-border-light)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-warning)' }}>{todayStats.loan}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>借调</div>
          </div>
          <div style={{ width: 1, background: 'var(--color-border-light)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-info, #3b82f6)' }}>{todayStats.return}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>归还</div>
          </div>
        </div>
      </div>

      {lastResult && (
        <div className="card-item" style={{ borderLeft: `3px solid ${lastResult.success ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: lastResult.success ? 'var(--color-success)' : 'var(--color-danger)', marginBottom: 6 }}>
            {lastResult.success ? '扫码成功' : '扫码失败'}
          </div>
          {lastResult.success ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>款号: <strong style={{ color: 'var(--color-text-primary)' }}>{lastResult.styleNo || '-'}</strong></span>
              <span style={{ color: 'var(--color-text-secondary)' }}>颜色: <strong style={{ color: 'var(--color-text-primary)' }}>{lastResult.color || '-'}</strong></span>
              <span style={{ color: 'var(--color-text-secondary)' }}>尺码: <strong style={{ color: 'var(--color-text-primary)' }}>{lastResult.size || '-'}</strong></span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{lastResult.message}</div>
          )}
          {lastResult.success && stockInfo && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {stockInfo.found ? (
                <span>在库: <strong style={{ color: 'var(--color-success)' }}>{stockInfo.availableQuantity ?? stockInfo.stock?.quantity ?? 0}件</strong>
                  {stockInfo.activeLoans?.length > 0 && <span> · 借出: <strong style={{ color: 'var(--color-warning)' }}>{stockInfo.activeLoans.length}条</strong></span>}
                </span>
              ) : (
                <span style={{ color: 'var(--color-warning)' }}>尚未入库</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card-item" style={{ textAlign: 'center', padding: '14px 16px' }}>
        <button className="scan-big-btn" onClick={handleCameraScan} disabled={loading}>
          {loading ? <span className="scan-spinner" /> : <Icon name="scan" size={36} color="#fff" />}
        </button>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', marginTop: 8 }}>
          {loading ? '识别中...' : '样衣扫码'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>扫描样衣二维码查询库存</div>
      </div>

      {lastResult?.success && actions.length > 0 && (
        <div className="card-item">
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 10 }}>操作</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {actions.includes('inbound') && (
              <button className="primary-button" style={{ flex: 1 }} onClick={onInbound} disabled={submitting}>
                {submitting ? '处理中...' : '入库'}
              </button>
            )}
            {actions.includes('loan') && (
              <button className="secondary-button" style={{ flex: 1 }} onClick={onLoan} disabled={submitting}>
                {submitting ? '处理中...' : '借调'}
              </button>
            )}
            {actions.includes('return') && (
              <button className="ghost-button" style={{ flex: 1 }} onClick={onReturn} disabled={submitting}>
                {submitting ? '处理中...' : '归还'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card-item">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>今日扫码记录</span>
        </div>
        {loadingHistory ? (
          <div className="loading-state" style={{ padding: 16 }}>加载中...</div>
        ) : todayRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, fontSize: 13, color: 'var(--color-text-secondary)' }}>暂无今日记录</div>
        ) : (
          <div className="today-records-list">
            {todayRecords.map((r, i) => (
              <div key={r.id || i} className="sample-scan-record-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`sample-op-tag sample-op-${String(r.operationType || '').toLowerCase()}`}>
                    {r.displayOperation}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>{r.displayStyleNo}</span>
                  {r.displayColor && r.displayColor !== '-' && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.displayColor}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{r.displayTime}</span>
                  {r.operatorName && <span style={{ color: 'var(--color-text-secondary)' }}>{r.operatorName}</span>}
                  {r.warehouseCode && <span style={{ color: 'var(--color-text-tertiary)' }}>仓位: {r.warehouseCode}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        {cameraActive && (
          <CameraScanner active={cameraActive} onScan={handleScanResult}
            onError={(msg) => { if (msg) toast.error(msg); setCameraActive(false); }} />
        )}
      </Suspense>
    </div>
  );
}
