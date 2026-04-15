import { useState, useEffect } from 'react';
import api from '@/api';
import { toast, formatDate, formatDateTime } from '@/utils/uiHelper';
import { scanTypeText, orderStatusText } from '@/utils/scanHelpers';
import EmptyState from '@/components/EmptyState';

function parseDateSafe(dateStr) {
  if (!dateStr) return new Date(NaN);
  return new Date(String(dateStr).replace(' ', 'T'));
}

export default function PayrollPage() {
  const [timeFilter, setTimeFilter] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [records, setRecords] = useState([]);
  const [summaryItems, setSummaryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState('time');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => { initDates(); }, []);

  const initDates = () => {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    setStartDate(`${y}-${m}-01`);
    setEndDate(`${y}-${m}-${d}`);
    loadData(`${y}-${m}-01`, `${y}-${m}-${d}`);
  };

  const onFilterChange = (filter) => {
    const now = new Date();
    let sd = '', ed = formatDate(now);
    if (filter === 'week') {
      const day = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - day + 1);
      sd = formatDate(monday);
    } else if (filter === 'month') {
      const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
      sd = `${y}-${m}-01`;
    } else {
      sd = startDate; ed = endDate;
    }
    setTimeFilter(filter);
    if (filter !== 'custom') { setStartDate(sd); setEndDate(ed); loadData(sd, ed); }
  };

  const loadData = async (sd, ed) => {
    if (loading) return;
    const s = sd || startDate, e = ed || endDate;
    setLoading(true);
    try {
      const res = await api.finance.payrollSummary({
        startTime: `${s} 00:00:00`, endTime: `${e} 23:59:59`, includeSettled: true,
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        processData(res.data, s, e);
      } else if (Array.isArray(res)) {
        processData(res, s, e);
      } else { toast.error('加载失败'); }
    } catch (error) {
      toast.error(error.message || '加载失败');
    } finally { setLoading(false); }
  };

  const processData = (data, filterStart, filterEnd) => {
    const fs = filterStart ? new Date(filterStart + 'T00:00:00') : null;
    const fe = filterEnd ? new Date(filterEnd + 'T23:59:59') : null;
    let totalAmount = 0, totalQuantity = 0;
    const orderNoSet = new Set();
    const recs = [];
    for (const item of data) {
      if (!item.startTime) continue;
      const time = parseDateSafe(item.startTime);
      if ((fs && time < fs) || (fe && time > fe)) continue;
      const amt = Number(item.totalAmount) || 0;
      const qty = Number(item.quantity) || 0;
      totalAmount += amt;
      totalQuantity += qty;
      if (item.orderNo) orderNoSet.add(item.orderNo);
      recs.push({
        orderNo: item.orderNo || '-', styleNo: item.styleNo || '-', color: item.color || '-', size: item.size || '-',
        processName: item.processName || '-', operatorName: item.operatorName || '', scanTypeText: scanTypeText(item.scanType),
        orderStatusText: orderStatusText(item.orderStatus), quantity: qty,
        unitPrice: (Number(item.unitPrice) || 0).toFixed(2), totalAmount: amt.toFixed(2), totalAmountNum: amt,
        scanTime: item.startTime ? formatDateTime(parseDateSafe(item.startTime)) : '-', rawScanTime: item.startTime || '',
      });
    }
    sortRecords(recs, sortField, sortOrder);
    setRecords(recs);
    setSummaryItems([
      { label: '总金额', value: '¥' + totalAmount.toFixed(2), highlight: true },
      { label: '总数量', value: totalQuantity + ' 件' },
      { label: '扫码次数', value: recs.length + ' 次' },
      { label: '参与订单', value: orderNoSet.size + ' 个' },
    ]);
  };

  const sortRecords = (recs, field, order) => {
    const dir = order === 'desc' ? -1 : 1;
    if (field === 'time') recs.sort((a, b) => { const ta = a.rawScanTime || '', tb = b.rawScanTime || ''; return (tb > ta ? 1 : tb < ta ? -1 : 0) * dir; });
    else recs.sort((a, b) => dir * (b.totalAmountNum - a.totalAmountNum));
  };

  const toggleSort = () => {
    const newField = sortField === 'amount' ? 'time' : 'amount';
    setSortField(newField);
    setSortOrder('desc');
    const recs = [...records];
    sortRecords(recs, newField, 'desc');
    setRecords(recs);
  };

  return (
    <div className="sub-page">
      <div className="tab-bar" style={{ marginBottom: 12 }}>
        {['week', 'month', 'custom'].map(f => (
          <button key={f} className={`scan-type-chip${timeFilter === f ? ' active' : ''}`}
            onClick={() => onFilterChange(f)} style={{ flex: 1 }}>
            {f === 'week' ? '本周' : f === 'month' ? '本月' : '自定义'}
          </button>
        ))}
      </div>

      {timeFilter === 'custom' && (
        <div className="sub-page-row-stretch" style={{ marginBottom: 12 }}>
          <input className="text-input" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); loadData(e.target.value, endDate); }} />
          <input className="text-input" type="date" value={endDate} onChange={e => { setEndDate(e.target.value); loadData(startDate, e.target.value); }} />
        </div>
      )}

      <div className="stats-grid stats-grid-2col" style={{ marginBottom: 12 }}>
        {summaryItems.map((item, i) => (
          <div key={i} className={`stat-card${item.highlight ? ' tone-blue' : ''}`}>
            <div className="stat-number" style={{ fontSize: item.highlight ? 'var(--font-size-lg)' : 'var(--font-size-base)' }}>{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="sub-page-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>【工序明细】</span>
        <button className="ghost-button" style={{ fontSize: 'var(--font-size-xs)' }} onClick={toggleSort}>
          按{sortField === 'time' ? '时间' : '金额'}排序 {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : records.length === 0 ? (
        <EmptyState icon="💰" title="暂无记录" desc="扫码后工资记录会在这里显示" />
      ) : (
        <div className="list-stack">
          {records.map((r, idx) => (
            <div key={idx} className="card-item" style={{ padding: 10, fontSize: 'var(--font-size-sm)' }}>
              <div className="sub-page-row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{r.orderNo}</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>¥{r.totalAmount}</span>
              </div>
              <div className="card-item-meta" style={{ marginTop: 2 }}>
                {r.processName} · {r.scanTypeText} · {r.quantity}件 · ¥{r.unitPrice}/件
                {r.operatorName && <span> · 扫码人：{r.operatorName}</span>}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{r.scanTime}</div>
            </div>
          ))}
        </div>
      )}

      {records.length > 0 && (
        <div className="list-end-text">
          当前筛选总计：¥{summaryItems[0]?.value?.replace('¥', '') || '0.00'}
        </div>
      )}
    </div>
  );
}
