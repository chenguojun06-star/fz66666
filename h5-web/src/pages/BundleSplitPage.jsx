import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import { isAdminOrSupervisor } from '@/utils/permission';
import Icon from '@/components/Icon';

export default function BundleSplitPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);
  const [orderNo, setOrderNo] = useState('');
  const [bundles, setBundles] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [splitQty, setSplitQty] = useState('');
  const [workers, setWorkers] = useState([]);
  const [workerIdx, setWorkerIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needSearch, setNeedSearch] = useState(true);
  const [searchOrderNo, setSearchOrderNo] = useState('');
  const [priceSearchInput, setPriceSearchInput] = useState('');
  const [processes, setProcesses] = useState([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [selectedProcessIdx, setSelectedProcessIdx] = useState(-1);
  const [adjustPrice, setAdjustPrice] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustHistory, setAdjustHistory] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const on = decodeURIComponent(searchParams.get('orderNo') || '');
    setIsAdmin(isAdminOrSupervisor());
    if (on) { setOrderNo(on); setNeedSearch(false); fetchBundles(on); }
    loadWorkers();
  }, []);

  const fetchBundles = async (no) => {
    if (!no) return;
    setLoading(true);
    try {
      const res = await api.production.listBundles(no);
      const raw = res?.data?.records || res?.data || res || [];
      setBundles(Array.isArray(raw) ? raw : []);
      if (!raw.length) toast.info('该订单暂无菲号');
    } catch (e) { toast.error('加载失败'); } finally { setLoading(false); }
  };

  const loadWorkers = async () => {
    try {
      const factoryId = useAuthStore.getState().user?.factoryId || '';
      if (!factoryId) return;
      const res = await api.factoryWorker.list(factoryId);
      setWorkers(Array.isArray(res) ? res : (res?.data || []));
    } catch (e) { /* ignore */ }
  };

  const submitSplit = async () => {
    const bundle = bundles[selectedIdx];
    if (!bundle) { toast.error('请先选择菲号'); return; }
    const qty = parseInt(splitQty, 10);
    if (!qty || qty <= 0) { toast.error('请输入转出数量'); return; }
    if (qty >= (bundle.quantity || 0)) { toast.error('转出数量需小于总数'); return; }
    const worker = workers[workerIdx];
    if (!worker) { toast.error('请选择接手工人'); return; }
    setSubmitting(true);
    try {
      await api.production.splitTransfer({
        bundleId: bundle.id, qrCode: bundle.qrCode || '',
        orderNo: bundle.productionOrderNo || orderNo, bundleNo: bundle.bundleNo,
        completedQuantity: (bundle.quantity || 0) - qty, transferQuantity: qty,
        toWorkerId: worker.id, toWorkerName: worker.workerName, reason: '',
      });
      toast.success('拆分成功');
      setSubmitting(false); setSelectedIdx(-1); setSplitQty(''); setWorkerIdx(-1);
      fetchBundles(orderNo);
    } catch (e) { toast.error('拆分失败'); setSubmitting(false); }
  };

  const doPriceSearch = async () => {
    const no = priceSearchInput.trim();
    if (!no) { toast.error('请输入订单号'); return; }
    setPriceLoading(true);
    setSelectedProcessIdx(-1); setAdjustPrice(''); setAdjustReason('');
    try {
      const res = await api.production.queryOrderProcesses(no);
      setProcesses(Array.isArray(res?.data || res) ? (res?.data || res) : []);
    } catch (e) { toast.error('加载工序失败'); } finally { setPriceLoading(false); }
    try {
      const res = await api.production.priceAdjustHistory(no);
      setAdjustHistory(Array.isArray(res?.data || res) ? (res?.data || res).slice(0, 20) : []);
    } catch (e) { /* ignore */ }
  };

  const submitAdjust = async () => {
    if (!isAdmin) { toast.error('仅管理员可调整单价'); return; }
    const proc = processes[selectedProcessIdx];
    if (!proc) { toast.error('请先选择工序'); return; }
    const price = parseFloat(adjustPrice);
    if (isNaN(price) || price < 0) { toast.error('请输入有效单价'); return; }
    if (!adjustReason.trim()) { toast.error('请填写调整原因'); return; }
    setAdjustSubmitting(true);
    try {
      await api.production.adjustProcessPrice({ orderNo: priceSearchInput.trim(), processName: proc.processName, newPrice: price, reason: adjustReason.trim() });
      toast.success('调整成功');
      setAdjustSubmitting(false); setSelectedProcessIdx(-1); setAdjustPrice(''); setAdjustReason('');
      doPriceSearch();
    } catch (e) { toast.error(e.message || '调整失败'); setAdjustSubmitting(false); }
  };

  return (
    <div className="sub-page">
      <div className="sub-page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <span className="sub-page-title">菲号拆解</span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className={`filter-btn${activeTab === 0 ? ' active' : ''}`}
          onClick={() => setActiveTab(0)} style={{ flex: 1 }}>菲号拆分</button>
        {isAdmin && (
          <button className={`filter-btn${activeTab === 1 ? ' active' : ''}`}
            onClick={() => setActiveTab(1)} style={{ flex: 1 }}>单价调整</button>
        )}
      </div>

      {activeTab === 0 ? (
        <>
          {needSearch ? (
            <div className="card-item">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>搜索订单</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="text-input" value={searchOrderNo}
                  onChange={e => setSearchOrderNo(e.target.value)}
                  placeholder="输入订单号"
                  onKeyDown={e => e.key === 'Enter' && fetchBundles(searchOrderNo.trim())}
                  style={{ flex: 1, minWidth: 0, height: 40, fontSize: 14 }} />
                <button className="filter-btn active" style={{ height: 40, padding: '0 16px', flexShrink: 0 }}
                  onClick={() => { setOrderNo(searchOrderNo.trim()); setNeedSearch(false); fetchBundles(searchOrderNo.trim()); }}>搜索</button>
              </div>
            </div>
          ) : (
            <div className="card-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>订单: {orderNo}</span>
              <button className="filter-btn" style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => { setNeedSearch(true); setOrderNo(''); setBundles([]); setSelectedIdx(-1); }}>切换</button>
            </div>
          )}

          {loading ? (
            <div className="loading-state">加载中...</div>
          ) : bundles.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bundles.map((b, idx) => (
                <div key={b.id || idx} className="card-item"
                  style={{ border: selectedIdx === idx ? '2px solid var(--color-primary)' : undefined, cursor: 'pointer', padding: 12 }}
                  onClick={() => setSelectedIdx(selectedIdx === idx ? -1 : idx)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{b.bundleNo || b.bundleLabel || '-'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{b.quantity || 0}件</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {b.color || '-'} / {b.size || '-'}
                  </div>
                </div>
              ))}
            </div>
          ) : !needSearch ? (
            <div className="empty-state">
              <div className="empty-text">暂无菲号数据</div>
            </div>
          ) : null}

          {selectedIdx >= 0 && (
            <div className="card-item">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>拆分操作</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>转出数量</label>
                <input className="text-input" type="number" value={splitQty} min={1}
                  onChange={e => setSplitQty(e.target.value)} placeholder="输入转出数量"
                  style={{ width: '100%', height: 40, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>接手工人</label>
                <select className="text-input" value={workerIdx} onChange={e => setWorkerIdx(Number(e.target.value))}
                  style={{ width: '100%', height: 40, fontSize: 14 }}>
                  <option value={-1}>请选择</option>
                  {workers.map((w, i) => <option key={i} value={i}>{w.workerName || w.name || '-'}</option>)}
                </select>
              </div>
              <button className="filter-btn active" style={{ width: '100%', height: 44, fontSize: 15 }}
                onClick={submitSplit} disabled={submitting}>
                {submitting ? '提交中...' : '确认拆分'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card-item">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>搜索订单</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="text-input" value={priceSearchInput}
                onChange={e => setPriceSearchInput(e.target.value)} placeholder="输入订单号"
                onKeyDown={e => e.key === 'Enter' && doPriceSearch()}
                style={{ flex: 1, minWidth: 0, height: 40, fontSize: 14 }} />
              <button className="filter-btn active" style={{ height: 40, padding: '0 16px', flexShrink: 0 }}
                onClick={doPriceSearch}>搜索</button>
            </div>
          </div>

          {priceLoading ? (
            <div className="loading-state">加载中...</div>
          ) : processes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {processes.map((p, idx) => (
                <div key={idx} className="card-item"
                  style={{ border: selectedProcessIdx === idx ? '2px solid var(--color-primary)' : undefined, cursor: 'pointer', padding: 12 }}
                  onClick={() => { setSelectedProcessIdx(selectedProcessIdx === idx ? -1 : idx); setAdjustPrice(String(p.unitPrice || '')); setAdjustReason(''); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.processName || '-'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>¥{p.unitPrice || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {selectedProcessIdx >= 0 && (
            <div className="card-item">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>调整单价</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>新单价</label>
                <input className="text-input" type="number" value={adjustPrice} min={0} step={0.01}
                  onChange={e => setAdjustPrice(e.target.value)}
                  style={{ width: '100%', height: 40, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>调整原因</label>
                <textarea className="text-input" value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)} rows={2} placeholder="请输入调整原因"
                  style={{ width: '100%', fontSize: 14 }} />
              </div>
              <button className="filter-btn active" style={{ width: '100%', height: 44, fontSize: 15 }}
                onClick={submitAdjust} disabled={adjustSubmitting}>
                {adjustSubmitting ? '提交中...' : '确认调整'}
              </button>
            </div>
          )}

          {adjustHistory.length > 0 && (
            <div className="card-item">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>调整记录</div>
              {adjustHistory.map((h, i) => (
                <div key={i} style={{ fontSize: 12, padding: '8px 0', borderBottom: i < adjustHistory.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
                  <div style={{ fontWeight: 600 }}>{h.processName || '-'}: ¥{h.oldPrice || 0} → ¥{h.newPrice || 0}</div>
                  <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>原因：{h.reason || '-'} · {h.operatorName || '-'}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
