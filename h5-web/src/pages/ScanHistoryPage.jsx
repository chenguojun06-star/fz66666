import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { toast, formatDate } from '@/utils/uiHelper';
import { http } from '@/services/http';

const _now = new Date();

function getDateBefore(days) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const [dateMode, setDateMode] = useState('month');
  const [year, setYear] = useState(_now.getFullYear());
  const [month, setMonth] = useState(_now.getMonth() + 1);
  const [startDate, setStartDate] = useState(getDateBefore(30));
  const [endDate, setEndDate] = useState(getDateBefore(0));
  const [searchKeyword, setSearchKeyword] = useState('');
  const [records, setRecords] = useState([]);
  const [showOnlyPayable, setShowOnlyPayable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState({ totalQuantity: 0, orderCount: 0, recordCount: 0, totalWage: '0.00' });

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
      if (searchKeyword) { if (/^\d+$/.test(searchKeyword)) params.bundleNo = searchKeyword; else params.orderNo = searchKeyword; }

      const [scanRes, patternRes, payrollRes] = await Promise.allSettled([
        api.production.myScanHistory(params),
        reset ? api.production.myPatternScanHistory({ startTime: start + ' 00:00:00', endTime: end + ' 23:59:59' }) : Promise.resolve([]),
        reset ? http.post('/api/finance/payroll-settlement/operator-summary', { startTime: start + ' 00:00:00', endTime: end + ' 23:59:59', includeSettled: true }) : Promise.resolve(null),
      ]);

      const result = scanRes.status === 'fulfilled' ? scanRes.value : null;
      const newRecords = (result?.records || []).filter(item => (item.scanResult || '').toLowerCase() !== 'failure');
      const formatted = newRecords.map(item => ({
        ...item,
        displayTime: formatTime(item.scanTime),
        displayProcess: _normalizeQualityName(item.processName) || item.progressStage || item.scanType || '-',
        displayWorker: item.workerName || item.operatorName || '-',
        displayOrderNo: item.orderNo || '-',
        displayBundleNo: item.bundleNo || item.cuttingBundleQrCode || '-',
        displayQuantity: item.quantity || 0,
        lineAmount: Number(item.totalAmount) || Number(item.scanCost) || ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)),
        isPayable: (Number(item.totalAmount) > 0) || (Number(item.scanCost) > 0) || ((Number(item.unitPrice) || 0) > 0 && (Number(item.quantity) || 0) > 0),
      }));

      const prevList = reset ? [] : records;
      const merged = prevList.concat(formatted);
      const total = result?.total || 0;

      let totalWage = 0;
      if (reset && payrollRes.status === 'fulfilled' && payrollRes.value) {
        const payrollData = payrollRes.value?.data || payrollRes.value;
        if (Array.isArray(payrollData)) payrollData.forEach(item => { totalWage += Number(item.totalAmount) || 0; });
      }
      if (totalWage === 0) merged.forEach(r => { const amt = Number(r.totalAmount) || Number(r.scanCost) || ((Number(r.unitPrice) || 0) * (Number(r.quantity) || 0)); if (amt > 0) totalWage += amt; });

      let totalQuantity = 0;
      const orderSet = new Set();
      merged.forEach(r => { totalQuantity += r.quantity || 0; if (r.orderNo && r.orderNo !== '-') orderSet.add(r.orderNo); });

      const displayRecords = showOnlyPayable ? merged.filter(r => r.isPayable) : merged;
      setRecords(merged);
      setPage(nextPage);
      setHasMore(merged.length < total);
      setSummary({ totalQuantity, orderCount: orderSet.size, recordCount: merged.length, totalWage: totalWage.toFixed(2) });
    } catch (e) {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [loading, page, hasMore, records, dateMode, year, month, startDate, endDate, searchKeyword, showOnlyPayable]);

  useEffect(() => { loadData(true); }, [dateMode, year, month]);

  const onPrevMonth = () => { let y = year, m = month - 1; if (m < 1) { m = 12; y--; } setYear(y); setMonth(m); };
  const onNextMonth = () => {
    let y = year, m = month + 1;
    const curYear = _now.getFullYear(), curMonth = _now.getMonth() + 1;
    if (y > curYear || (y === curYear && m >= curMonth)) return;
    if (m > 12) { m = 1; y++; } setYear(y); setMonth(m);
  };

  const displayRecords = showOnlyPayable ? records.filter(r => r.isPayable) : records;

  return (
    <div className="scan-history-stack">
      <div style={{ display: 'flex', gap: 8 }}>
        <button className={`scan-type-chip${dateMode === 'month' ? ' active' : ''}`}
          onClick={() => setDateMode('month')}
          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 16, border: '1px solid var(--color-border)',
            background: dateMode === 'month' ? 'var(--color-primary)' : 'var(--color-bg-light)',
            color: dateMode === 'month' ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
          按月
        </button>
        <button className={`scan-type-chip${dateMode === 'custom' ? ' active' : ''}`}
          onClick={() => setDateMode('custom')}
          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 16, border: '1px solid var(--color-border)',
            background: dateMode === 'custom' ? 'var(--color-primary)' : 'var(--color-bg-light)',
            color: dateMode === 'custom' ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
          自定义
        </button>
      </div>

      {dateMode === 'month' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="ghost-button" onClick={onPrevMonth}>‹</button>
          <span style={{ fontWeight: 600 }}>{displayMonth}</span>
          <button className="ghost-button" onClick={onNextMonth}>›</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="text-input" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); }} style={{ flex: 1 }} />
          <input className="text-input" type="date" value={endDate} onChange={e => { setEndDate(e.target.value); }} style={{ flex: 1 }} />
        </div>
      )}

      <input className="text-input" placeholder="搜索订单号/菲号" value={searchKeyword}
        onChange={e => setSearchKeyword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && loadData(true)} />

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat-card tone-blue" onClick={() => setShowOnlyPayable(!showOnlyPayable)} style={{ cursor: 'pointer' }}>
          <div className="stat-number">¥{summary.totalWage}</div>
          <div className="stat-label">{showOnlyPayable ? '计薪总额' : '工资总额'}</div>
        </div>
        <div className="stat-card tone-green">
          <div className="stat-number">{summary.totalQuantity}</div>
          <div className="stat-label">累计件数</div>
        </div>
      </div>

      {loading && records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : displayRecords.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无记录</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayRecords.map((r, idx) => (
            <div key={r.id || idx} className="hero-card compact" style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{r.displayOrderNo}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{r.displayTime}</span>
              </div>
              <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {r.displayProcess} · {r.displayBundleNo} · {r.displayQuantity}件
                {r.isPayable && <span style={{ color: 'var(--color-primary)', marginLeft: 8 }}>¥{r.lineAmount.toFixed(2)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
