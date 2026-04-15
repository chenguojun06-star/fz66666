import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { getUserInfo } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import { eventBus } from '@/utils/eventBus';

const MATERIAL_TYPE_MAP = {
  fabricA: '主面料', fabricB: '辅面料', liningA: '里料', liningB: '夹里', liningC: '衬布/粘合衬',
  accessoryA: '拉链', accessoryB: '纽扣', accessoryC: '配件',
};

export default function ProcurementTaskDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orderNo, setOrderNo] = useState('');
  const [styleNo, setStyleNo] = useState('');
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [materialPurchases, setMaterialPurchases] = useState([]);
  const [remark, setRemark] = useState('');
  const [hasInput, setHasInput] = useState(false);
  const [canConfirmProcurement, setCanConfirmProcurement] = useState(false);
  const [overallArrivalRate, setOverallArrivalRate] = useState(-1);

  useEffect(() => {
    const on = decodeURIComponent(searchParams.get('orderNo') || '');
    const sn = decodeURIComponent(searchParams.get('styleNo') || '');
    setOrderNo(on); setStyleNo(sn);
    if (on) loadDetail(on);
  }, []);

  const loadDetail = async (no) => {
    setLoading(true);
    try {
      const res = await api.production.getMaterialPurchases({ orderNo: no });
      const list = normalizeToArray(res);
      let totalPurchased = 0, totalArrived = 0;
      const mps = list.map(item => {
        const status = normalizeStatus(item.status);
        const purchaseQty = Number(item.purchaseQuantity || 0);
        const arrivedQty = Number(item.arrivedQuantity || 0);
        totalPurchased += purchaseQty;
        totalArrived += arrivedQty;
        let statusTagClass = 'status-tag-warning';
        if (status === 'completed') statusTagClass = 'status-tag-success';
        else if (status === 'received' || status === 'partial') statusTagClass = 'status-tag-info';
        return {
          ...item, materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || '',
          statusText: getStatusText(status), statusTagClass,
          isActionable: status !== 'completed' && status !== 'cancelled',
          needsReceive: !status || status === 'pending',
          inputQuantity: '', arrivalRate: purchaseQty > 0 ? Math.round(arrivedQty / purchaseQty * 100) : 0,
        };
      });
      const oid = (mps[0] && (mps[0].orderId || mps[0].order_id)) || '';
      const oar = totalPurchased > 0 ? Math.round(totalArrived / totalPurchased * 100) : 0;
      setOrderId(oid); setMaterialPurchases(mps); setOverallArrivalRate(oar);
      setCanConfirmProcurement(oar >= 50);
    } catch (e) { toast.error('加载失败'); } finally { setLoading(false); }
  };

  const normalizeToArray = (res) => { if (Array.isArray(res)) return res; if (res?.records) return res.records; if (res?.data) return res.data; return []; };
  const normalizeStatus = (s) => String(s || '').trim().toLowerCase();
  const getStatusText = (s) => ({ pending: '待采购', received: '已领取', partial: '部分到货', completed: '全部到货', cancelled: '已取消' }[s] || '待采购');

  const onReceiveAll = async () => {
    const userInfo = getUserInfo() || {};
    const pendingItems = materialPurchases.filter(item => item.needsReceive);
    if (!pendingItems.length) { toast.success('所有物料均已采购'); return; }
    try {
      await Promise.all(pendingItems.map(item => api.production.receivePurchase({
        purchaseId: item.id || item.purchaseId,
        receiverId: String(userInfo.id || userInfo.userId || ''),
        receiverName: String(userInfo.name || userInfo.username || ''),
      })));
      toast.success(`已采购 ${pendingItems.length} 项`);
      loadDetail(orderNo);
    } catch (e) { toast.error(e.message || '采购失败'); }
  };

  const onSubmit = async () => {
    const hasAny = materialPurchases.some(m => m.inputQuantity && Number(m.inputQuantity) > 0);
    if (!hasAny) { toast.error('请至少填写一种物料的到货数量'); return; }
    setSubmitting(true);
    try {
      const updates = materialPurchases.filter(m => Number(m.inputQuantity) > 0).map(m => ({
        id: m.id || m.purchaseId, arrivedQuantity: (Number(m.arrivedQuantity) || 0) + Number(m.inputQuantity), remark: remark || '',
      }));
      await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));
      eventBus.emit('DATA_REFRESH');
      toast.success('到货登记成功');
      setTimeout(() => navigate(-1), 800);
    } catch (e) { toast.error(e.message || '提交失败'); } finally { setSubmitting(false); }
  };

  return (
    <div className="sub-page">
      <div className="card-item">
        <div className="card-item-title">{orderNo}</div>
        <div className="info-row">
          <span className="info-label">款号:</span>
          <span className="info-value">{styleNo}</span>
          <span className="info-label">到货率:</span>
          <span className="info-value-bold">{overallArrivalRate}%</span>
        </div>
      </div>

      <div className="sub-page-row-stretch" style={{ marginBottom: 12 }}>
        <button className="primary-button" onClick={onReceiveAll}>一键领取</button>
        {canConfirmProcurement && (
          <button className="secondary-button" onClick={async () => {
            try {
              await api.production.confirmProcurementComplete({ id: orderId, orderNo, remark });
              toast.success('采购阶段已完成');
              eventBus.emit('DATA_REFRESH');
              setTimeout(() => navigate(-1), 1000);
            } catch (e) { toast.error(e.message || '确认失败'); }
          }}>确认完成</button>
        )}
      </div>

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : materialPurchases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">暂无物料数据</div>
        </div>
      ) : (
        <div className="list-stack">
          {materialPurchases.map((item, idx) => (
            <div key={item.id || idx} className="card-item">
              <div className="card-item-header">
                <div>
                  <div className="card-item-title" style={{ fontSize: 'var(--font-size-sm)' }}>{item.materialTypeCN} · {item.materialName || '-'}</div>
                  <div className="card-item-meta">
                    需求: {item.purchaseQuantity || 0} · 已到: {item.arrivedQuantity || 0} · 到货率: {item.arrivalRate}%
                  </div>
                </div>
                <span className={`status-tag ${item.statusTagClass}`}>{item.statusText}</span>
              </div>
              {item.isActionable && (
                <div className="sub-page-row" style={{ marginTop: 8 }}>
                  <span className="info-label">到货:</span>
                  <input className="sku-input" type="number" value={item.inputQuantity} min={0}
                    onChange={e => {
                      const newMps = [...materialPurchases];
                      newMps[idx] = { ...newMps[idx], inputQuantity: e.target.value };
                      setMaterialPurchases(newMps);
                      setHasInput(newMps.some(m => m.inputQuantity && Number(m.inputQuantity) > 0));
                    }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasInput && (
        <>
          <div className="field-block" style={{ marginTop: 12 }}>
            <label>备注</label>
            <input className="text-input" value={remark} onChange={e => setRemark(e.target.value)} placeholder="备注（选填）" />
          </div>
          <button className="primary-button" onClick={onSubmit} disabled={submitting}>
            {submitting ? '提交中...' : '提交到货登记'}
          </button>
        </>
      )}
    </div>
  );
}
