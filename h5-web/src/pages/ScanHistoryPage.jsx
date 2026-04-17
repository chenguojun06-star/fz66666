import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import { canUndo } from '@/utils/scanHelpers';
import { eventBus } from '@/utils/eventBus';

const _now = new Date();

function getMonthRange(year, month) {
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${m}-01`, end: `${year}-${m}-${String(lastDay).padStart(2, '0')}`, display: `${year}年${month}月` };
}

function formatTime(timeStr) {
  if (!timeStr) return '-';
  return timeStr.length >= 16 ? timeStr.substring(5, 16) : timeStr;
}

function _normalizeQualityName(processName) {
  if (!processName) return processName;
  if (/^质检(领取|验收|确认)$/.test(processName)) return '质检';
  return processName;
}

export default function ScanHistoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isAdmin = (() => { const r = (user?.role || '').toLowerCase(); return r === 'admin' || r === 'supervisor' || r === 'tenant_owner'; })();
  const [dateMode, setDateMode] = useState(() => searchParams.get('mode') === 'monthly' ? 'month' : 'month');
  const [year, setYear] = useState(_now.getFullYear());
  const [month, setMonth] = useState(_now.getMonth() + 1);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [records, setRecords] = useState([]);
  const [showOnlyPayable, setShowOnlyPayable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [undoingId, setUndoingId] = useState(null);
  const [summary, setSummary] = useState({ totalQuantity: 0, orderCount: 0, recordCount: 0, patternRecordCount: 0, payableRecordCount: 0, totalWage: '0.00' });

  const displayMonth = getMonthRange(year, month).display;

  const getDateRange = () => {
    if (dateMode === 'month') { const r = getMonthRange(year, month); return { start: r.start, end: r.end }; }
    return { start: startDate, end: endDate };
  };

  const loadData = useCallback(async (reset = true) => {
    if (loading) return;
    const nextPage = reset ? 1 : page + 1;
    if (!reset && !hasMore) return;
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const params = { currentUser: 'true', page: nextPage, pageSize: 30 };
      if (start) params.startTime = start + ' 00:00:00';
      if (end) params.endTime = end + ' 23:59:59';
      if (searchKeyword) {
        if (/^\d+$/.test(searchKeyword)) params.bundleNo = searchKeyword;
        else params.orderNo = searchKeyword;
      }

      const [scanRes, patternRes, payrollRes] = await Promise.allSettled([
        api.production.myScanHistory(params),
        reset ? api.production.myPatternScanHistory({ startTime: start + ' 00:00:00', endTime: end + ' 23:59:59' }) : Promise.resolve(null),
        reset ? api.finance.payrollSummary({ startTime: start + ' 00:00:00', endTime: end + ' 23:59:59', includeSettled: true }) : Promise.resolve(null),
      ]);

      const scanData = scanRes.status === 'fulfilled' ? scanRes.value : null;
      const scanResult = scanData?.data || scanData || {};
      const newRecords = (scanResult?.records || scanResult?.list || []).filter(item => (item.scanResult || '').toLowerCase() !== 'failure');

      let patternRecords = [];
      if (reset && patternRes.status === 'fulfilled' && patternRes.value) {
        const pData = patternRes.value?.data || patternRes.value || {};
        patternRecords = pData?.records || pData?.list || [];
      }

      const formatted = newRecords.map(item => ({
        ...item,
        displayTime: formatTime(item.scanTime || item.createTime),
        displayProcess: _normalizeQualityName(item.processName) || item.progressStage || item.scanType || '-',
        displayWorker: item.workerName || item.operatorName || '-',
        displayOrderNo: item.orderNo || '-',
        displayStyleNo: item.styleNo || '-',
        displayBundleNo: item.bundleNo || item.cuttingBundleQrCode || '-',
        displayColor: item.color || '-',
        displaySize: item.size || '-',
        displayUnitPrice: item.unitPrice ? `¥${Number(item.unitPrice).toFixed(2)}` : '-',
        displayQuantity: item.quantity || 0,
        displayBedNo: item.bedNo || item.cuttingBedNo || '-',
        displayLineAmount: (Number(item.totalAmount) || Number(item.scanCost) || ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))).toFixed(2),
        lineAmount: Number(item.totalAmount) || Number(item.scanCost) || ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)),
        isPayable: (Number(item.totalAmount) > 0) || (Number(item.scanCost) > 0) || ((Number(item.unitPrice) || 0) > 0 && (Number(item.quantity) || 0) > 0),
        canUndo: canUndo(item, isAdmin),
      }));

      const patternFormatted = patternRecords.map(item => ({
        ...item,
        displayTime: formatTime(item.scanTime || item.createTime),
        displayProcess: '样板',
        displayWorker: item.workerName || item.operatorName || '-',
        displayOrderNo: item.orderNo || item.styleNo || '-',
        displayStyleNo: item.styleNo || '-',
        displayBundleNo: item.patternNo || '-',
        displayColor: item.color || '-',
        displayUnitPrice: '-',
        displayQuantity: item.quantity || 0,
        displayBedNo: '-',
        displayLineAmount: '0.00',
        lineAmount: 0,
        isPayable: false,
        canUndo: false,
      }));

      const allFormatted = [...formatted, ...patternFormatted].sort((a, b) => {
        const ta = a.scanTime || a.createTime || '';
        const tb = b.scanTime || b.createTime || '';
        return tb.localeCompare(ta);
      });

      const prevList = reset ? [] : records;
      const merged = prevList.concat(allFormatted);
      const total = scanResult?.total || 0;

      let totalWage = 0;
      if (reset && payrollRes.status === 'fulfilled' && payrollRes.value) {
        const payrollData = payrollRes.value?.data || payrollRes.value;
        if (Array.isArray(payrollData)) payrollData.forEach(item => { totalWage += Number(item.totalAmount) || 0; });
      }
      if (totalWage === 0) merged.forEach(r => { const amt = r.lineAmount; if (amt > 0) totalWage += amt; });

      let totalQuantity = 0;
      const orderSet = new Set();
      let payableCount = 0;
      let patternCount = 0;
      merged.forEach(r => {
        totalQuantity += r.displayQuantity || 0;
        if (r.orderNo && r.orderNo !== '-') orderSet.add(r.orderNo);
        if (r.isPayable) payableCount++;
        if (r.displayProcess === '样板') patternCount++;
      });

      setRecords(merged);
      setPage(nextPage);
      setHasMore(merged.length < total);
      setSummary({ totalQuantity, orderCount: orderSet.size, recordCount: merged.length, patternRecordCount: patternCount, payableRecordCount: payableCount, totalWage: totalWage.toFixed(2) });
    } catch (e) {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [loading, page, hasMore, records, dateMode, year, month, startDate, endDate, searchKeyword, showOnlyPayable]);

  useEffect(() => { loadData(true); }, [dateMode, year, month]);

  useEffect(() => {
    const onRefresh = () => loadData(true);
    eventBus.on('DATA_REFRESH', onRefresh);
    return () => eventBus.off('DATA_REFRESH', onRefresh);
  }, []);

  const onPrevMonth = () => { let y = year, m = month - 1; if (m < 1) { m = 12; y--; } setYear(y); setMonth(m); };
  const onNextMonth = () => {
    let y = year, m = month + 1;
    const curYear = _now.getFullYear(), curMonth = _now.getMonth() + 1;
    if (y > curYear || (y === curYear && m >= curMonth)) return;
    if (m > 12) { m = 1; y++; } setYear(y); setMonth(m);
  };

  const handleUndo = async (record) => {
    if (!record.id) { toast.error('无法撤回'); return; }
    if (!window.confirm('确定撤回此条扫码记录？')) return;
    setUndoingId(record.id);
    try {
      await api.production.undoScan({ recordId: record.id });
      toast.success('撤回成功');
      setRecords(prev => prev.filter(r => r.id !== record.id));
      setSummary(prev => ({
        ...prev,
        totalQuantity: prev.totalQuantity - (record.displayQuantity || 0),
        recordCount: prev.recordCount - 1,
        payableRecordCount: prev.payableRecordCount - (record.isPayable ? 1 : 0),
      }));
    } catch (e) {
      toast.error(e.message || '撤回失败');
    } finally {
      setUndoingId(null);
    }
  };

  const displayRecords = showOnlyPayable ? records.filter(r => r.isPayable) : records;

  return (
    <div className="scan-history-stack">
      <div className="mode-tabs">
        <button className={`mode-tab${dateMode === 'month' ? ' mode-tab-active' : ''}`} onClick={() => setDateMode('month')}>按月</button>
        <button className={`mode-tab${dateMode === 'custom' ? ' mode-tab-active' : ''}`} onClick={() => setDateMode('custom')}>自定义</button>
      </div>

      {dateMode === 'month' ? (
        <div className="month-selector">
          <button className="month-arrow" onClick={onPrevMonth}>‹</button>
          <span className="month-text">{displayMonth}</span>
          <button className="month-arrow" onClick={onNextMonth}>›</button>
        </div>
      ) : (
        <div className="filter-section">
          <div className="date-row">
            <div className="date-col">
              <span className="date-label">开始</span>
              <input className="text-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <span className="date-separator">—</span>
            <div className="date-col">
              <span className="date-label">结束</span>
              <input className="text-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="filter-section">
        <div className="search-row">
          <input className="text-input" placeholder="订单号 / 菲号 / 工序" value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadData(true)} style={{ flex: 1 }} />
          <button className="secondary-button" onClick={() => loadData(true)} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>搜索</button>
          {searchKeyword && (
            <button className="ghost-button" onClick={() => { setSearchKeyword(''); loadData(true); }} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>重置</button>
          )}
        </div>
      </div>

      <div className="card-item" style={{ display: 'flex', textAlign: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)' }}>{summary.totalQuantity}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>总数量</div>
        </div>
        <div style={{ width: 1, background: 'var(--color-border-light)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)' }}>{summary.orderCount}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>订单数</div>
        </div>
        <div style={{ width: 1, background: 'var(--color-border-light)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)' }}>{summary.recordCount}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>记录数(样衣{summary.patternRecordCount})</div>
        </div>
        <div style={{ width: 1, background: 'var(--color-border-light)' }} />
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setShowOnlyPayable(!showOnlyPayable)}>
          <div style={{ fontSize: 20, fontWeight: 700, color: showOnlyPayable ? 'var(--color-primary)' : 'var(--color-warning)' }}>¥{summary.totalWage}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>工资({summary.payableRecordCount}条)</div>
        </div>
      </div>

      {loading && records.length === 0 ? (
        <div className="loading-state">加载中...</div>
      ) : displayRecords.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">暂无记录</div>
          <div className="empty-state-desc">扫码后记录会在这里显示</div>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="srt-table-inner">
            <div className="srt-table-header">
              <span className="srt-th srt-th-worker">领取人</span>
              <span className="srt-th srt-th-order">订单号</span>
              <span className="srt-th srt-th-style">款号</span>
              <span className="srt-th srt-th-bundle">菲号</span>
              <span className="srt-th srt-th-process">工序</span>
              <span className="srt-th srt-th-color">颜色</span>
              <span className="srt-th srt-th-size">码数</span>
              <span className="srt-th srt-th-price">单价</span>
              <span className="srt-th srt-th-qty">数量</span>
              <span className="srt-th srt-th-amount">金额</span>
              <span className="srt-th srt-th-bed">床号</span>
              <span className="srt-th srt-th-time">日期</span>
            </div>
            {displayRecords.map((r, idx) => (
              <div key={r.id || idx} className="srt-table-row">
                <span className="srt-td srt-td-worker">{r.displayWorker}</span>
                <span className="srt-td srt-td-order">{r.displayOrderNo}</span>
                <span className="srt-td srt-td-style">{r.displayStyleNo}</span>
                <span className="srt-td srt-td-bundle">{r.displayBundleNo}</span>
                <span className="srt-td srt-td-process">{r.displayProcess}</span>
                <span className="srt-td srt-td-color">{r.displayColor}</span>
                <span className="srt-td srt-td-size">{r.displaySize}</span>
                <span className="srt-td srt-td-price">{r.displayUnitPrice}</span>
                <span className="srt-td srt-td-qty">{r.displayQuantity}</span>
                <span className="srt-td srt-td-amount">{r.displayLineAmount}</span>
                <span className="srt-td srt-td-bed">{r.displayBedNo}</span>
                <span className="srt-td srt-td-time">{r.displayTime}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {displayRecords.length > 0 && (
        <button className="load-more-btn" disabled={loading || !hasMore}
          onClick={() => loadData(false)}>
          {loading ? '加载中...' : hasMore ? '加载更多' : '没有更多了'}
        </button>
      )}
    </div>
  );
}
