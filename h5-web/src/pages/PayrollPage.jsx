import { useState, useEffect } from 'react';
import api from '@/api';
import { http } from '@/services/http';
import { toast, formatDate, formatDateTime } from '@/utils/uiHelper';

function parseDateSafe(dateStr) {
  if (!dateStr) return new Date(NaN);
  return new Date(String(dateStr).replace(' ', 'T'));
}

function _scanTypeText(raw) {
  const v = String(raw || '').trim();
  if (!v) return '-';
  const map = { production: '生产', cutting: '裁剪', procurement: '采购', quality: '质检', pressing: '大烫', packaging: '包装', warehousing: '入库', sewing: '车缝', carSewing: '车缝' };
  return map[v] || v;
}

function _orderStatusText(status) {
  const s = String(status || '').toLowerCase();
  const map = { completed: '已完成', closed: '已关单', archived: '已归档', production: '生产中', pending: '待生产', delayed: '已逾期', scrapped: '已报废', cancelled: '已取消', canceled: '已取消', paused: '已暂停', returned: '已退回' };
  return map[s] || s || '-';
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

  useEffect(() => {
    initDates();
  }, []);

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
      sd = startDate;
      ed = endDate;
    }
    setTimeFilter(filter);
    if (filter !== 'custom') { setStartDate(sd); setEndDate(ed); loadData(sd, ed); }
  };

  const loadData = async (sd, ed) => {
    if (loading) return;
    const s = sd || startDate, e = ed || endDate;
    setLoading(true);
    try {
      const res = await http.post('/api/finance/payroll-settlement/operator-summary', {
        startTime: `${s} 00:00:00`, endTime: `${e} 23:59:59`, includeSettled: true,
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        processData(res.data, s, e);
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
        processName: item.processName || '-', operatorName: item.operatorName || '', scanTypeText: _scanTypeText(item.scanType),
        orderStatusText: _orderStatusText(item.orderStatus), quantity: qty,
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
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['week', 'month', 'custom'].map(f => (
          <button key={f} className={`scan-type-chip${timeFilter === f ? ' active' : ''}`}
            onClick={() => onFilterChange(f)}
            style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--color-border)',
              background: timeFilter === f ? 'var(--color-primary)' : 'var(--color-bg-light)',
              color: timeFilter === f ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
            {f === 'week' ? '本周' : f === 'month' ? '本月' : '自定义'}
          </button>
        ))}
      </div>

      {timeFilter === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="text-input" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); loadData(e.target.value, endDate); }} style={{ flex: 1 }} />
          <input className="text-input" type="date" value={endDate} onChange={e => { setEndDate(e.target.value); loadData(startDate, e.target.value); }} style={{ flex: 1 }} />
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
        {summaryItems.map((item, i) => (
          <div key={i} className={`stat-card${item.highlight ? ' tone-blue' : ''}`}>
            <div className="stat-number" style={{ fontSize: item.highlight ? 18 : 14 }}>{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>工资明细</span>
        <button className="ghost-button" style={{ fontSize: 11 }} onClick={toggleSort}>
          按{sortField === 'time' ? '时间' : '金额'}排序 {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无记录</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {records.map((r, idx) => (
            <div key={idx} className="hero-card compact" style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{r.orderNo}</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>¥{r.totalAmount}</span>
              </div>
              <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {r.processName} · {r.scanTypeText} · {r.quantity}件 · ¥{r.unitPrice}/件
              </div>
              <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2, fontSize: 11 }}>{r.scanTime}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
