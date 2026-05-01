import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { eventBus } from '@/utils/eventBus';

export default function CuttingTaskDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [orderId, setOrderId] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [taskInfo, setTaskInfo] = useState({});
  const [orderLines, setOrderLines] = useState([]);
  const [bundleSize, setBundleSize] = useState('');
  const [excessRate, setExcessRate] = useState('');
  const [summary, setSummary] = useState({ totalOrdered: 0, totalCutting: 0, totalBundles: 0 });
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    const tid = searchParams.get('taskId') || '';
    const on = decodeURIComponent(searchParams.get('orderNo') || '');
    const oid = decodeURIComponent(searchParams.get('orderId') || '');
    setTaskId(tid); setOrderNo(on); setOrderId(oid);
    if (on) loadDetail(on, oid);
  }, []);

  const loadDetail = async (no, oid) => {
    setLoading(true);
    try {
      const orderRes = await api.production.orderDetailByOrderNo(no);
      const order = extractFirst(orderRes);
      const taskRes = await api.production.getCuttingTaskByOrderId(no);
      const task = extractFirst(taskRes);
      setTaskInfo({ ...(task || {}), styleNo: order?.styleNo || task?.styleNo || '', orderId: order?.id || oid });
      setCoverImage(getAuthedImageUrl(order?.coverImage || order?.styleImage || ''));
      setOrderId(order?.id || oid);
      if (order?.orderDetails) parseOrderLines(order);
      else setHasData(false);
    } catch (e) { toast.error('加载任务失败'); } finally { setLoading(false); }
  };

  const extractFirst = (res) => {
    if (Array.isArray(res) && res.length) return res[0];
    if (res?.records?.length) return res.records[0];
    if (res?.data?.length) return res.data[0];
    return res || null;
  };

  const parseOrderLines = (order) => {
    const details = typeof order.orderDetails === 'string' ? JSON.parse(order.orderDetails) : (order.orderDetails || []);
    if (!details.length) { setHasData(false); return; }
    const lines = details.map((item, idx) => ({
      color: item.color || '', size: item.size || '',
      orderedQty: Number(item.quantity) || Number(item.cuttingQty) || 0,
      cuttingQty: 0, bundleCount: 0, lastBundleQty: 0, defaultLastQty: 0,
      bundleDisplay: '-', lastBundleOverride: null,
      key: (item.color || '') + '_' + (item.size || '') + '_' + idx,
    }));
    setOrderLines(lines);
    setHasData(true);
    recalculate(lines, bundleSize, excessRate);
  };

  const recalculate = (lines, bs, rate) => {
    const bundleSizeNum = parseInt(bs, 10);
    if (!bundleSizeNum || bundleSizeNum <= 0) return;
    const rateNum = parseFloat(rate) || 0;
    let totalOrdered = 0, totalCutting = 0, totalBundles = 0;
    const updated = lines.map(line => {
      const orderQty = line.orderedQty || 0;
      totalOrdered += orderQty;
      const baseCuttingQty = rateNum > 0 ? Math.ceil(orderQty * (1 + rateNum / 100)) : orderQty;
      const bundles = baseCuttingQty > 0 ? Math.ceil(baseCuttingQty / bundleSizeNum) : 0;
      const remainder = bundleSizeNum > 0 ? baseCuttingQty % bundleSizeNum : 0;
      const defaultLastQty = remainder > 0 ? remainder : (bundles > 0 ? bundleSizeNum : 0);
      const lastQty = line.lastBundleOverride != null ? line.lastBundleOverride : defaultLastQty;
      const cuttingQty = bundles > 1 ? (bundles - 1) * bundleSizeNum + lastQty : bundles === 1 ? lastQty : 0;
      totalCutting += cuttingQty;
      totalBundles += bundles;
      let bundleDisplay = '-';
      if (bundles === 1) bundleDisplay = '1×' + lastQty + '件';
      else if (bundles > 1) bundleDisplay = (bundles - 1) + '×' + bundleSizeNum + ' + 1×' + lastQty;
      return { ...line, cuttingQty, bundleCount: bundles, lastBundleQty: lastQty, defaultLastQty, bundleDisplay };
    });
    setOrderLines(updated);
    setSummary({ totalOrdered, totalCutting, totalBundles });
  };

  const onSubmit = async () => {
    if (submitting) return;
    if (!orderId) { toast.error('缺少订单信息'); return; }
    if (!orderLines.length) { toast.error('无可裁剪的尺码数据'); return; }
    const bs = parseInt(bundleSize, 10);
    if (!bs || bs <= 0) { toast.error('请输入有效的每扎件数'); return; }
    const items = [];
    orderLines.forEach(line => {
      if (line.cuttingQty <= 0 || line.bundleCount <= 0) return;
      for (let b = 0; b < line.bundleCount - 1; b++) items.push({ color: String(line.color || ''), size: String(line.size || ''), quantity: bs });
      items.push({ color: String(line.color || ''), size: String(line.size || ''), quantity: line.lastBundleQty || bs });
    });
    if (!items.length) { toast.error('无有效裁剪数量'); return; }
    setSubmitting(true);
    try {
      await api.production.generateCuttingBundles(orderId, items);
      toast.success('菲号生成成功');
      eventBus.emit('DATA_REFRESH');
      setTimeout(() => navigate(-1), 500);
    } catch (err) { toast.error('生成失败：' + (err.message || '请稍后重试')); } finally { setSubmitting(false); }
  };

  return (
    <div className="sub-page">
      {coverImage && <img src={coverImage} alt="" className="card-item-cover" />}

      <div className="card-item">
        <div className="card-item-title">{orderNo}</div>
        <div className="info-row">
          <span className="info-label">款号:</span>
          <span className="info-value">{taskInfo.styleNo || '-'}</span>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="stat-card tone-blue"><div className="stat-number">{summary.totalOrdered}</div><div className="stat-label">订单数</div></div>
        <div className="stat-card tone-green"><div className="stat-number">{summary.totalCutting}</div><div className="stat-label">裁剪数</div></div>
        <div className="stat-card tone-orange"><div className="stat-number">{summary.totalBundles}</div><div className="stat-label">扎数</div></div>
      </div>

      <div className="field-block">
        <label>每扎件数</label>
        <input className="text-input" type="number" value={bundleSize} min={1} placeholder="输入每扎件数"
          onChange={e => { setBundleSize(e.target.value); recalculate(orderLines.map(l => ({ ...l, lastBundleOverride: null })), e.target.value, excessRate); }} />
      </div>
      <div className="field-block">
        <label>损耗率(%)</label>
        <input className="text-input" type="number" value={excessRate} min={0} step={0.1}
          onChange={e => { setExcessRate(e.target.value); recalculate(orderLines.map(l => ({ ...l, lastBundleOverride: null })), bundleSize, e.target.value); }} />
      </div>

      {hasData && orderLines.map((line) => (
        <div key={line.key} className="card-item" style={{ fontSize: 'var(--font-size-sm)' }}>
          <div className="sub-page-row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>{line.color} / {line.size}</span>
            <span className="card-item-meta">订单: {line.orderedQty}件</span>
          </div>
          <div className="card-item-meta">
            裁剪: {line.cuttingQty}件 · {line.bundleDisplay}
          </div>
        </div>
      ))}

      {!hasData && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">✂️</div>
          <div className="empty-state-title">暂无尺码数据</div>
        </div>
      )}

      <button className="primary-button" onClick={onSubmit} disabled={submitting} style={{ marginTop: 16 }}>
        {submitting ? '生成中...' : '生成菲号'}
      </button>
    </div>
  );
}
