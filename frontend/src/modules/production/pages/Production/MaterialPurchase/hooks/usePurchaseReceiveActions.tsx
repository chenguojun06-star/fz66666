/**
 * usePurchaseReceiveActions — 领取/采购/采购全部/智能领取成功回调
 * 从 usePurchaseActions 拆分而来，保持 API 路径/参数签名/返回值结构不变
 * NOTE: .tsx 扩展名因 receivePurchaseTask / handleReceiveAll 中包含 JSX (Modal.confirm content)
 */
import { Modal } from 'antd';
import { ShopOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialQuantity } from '../utils';

interface UsePurchaseReceiveActionsOptions {
  message: any;
  user: any;
  currentPurchase: MaterialPurchaseType | null;
  detailPurchases: MaterialPurchaseType[];
  fetchMaterialPurchaseList: () => Promise<void>;
  loadDetailByOrderNo: (orderNo: string) => Promise<void>;
  loadDetailByStyleNo: (styleNo: string, purchaseNo?: string) => Promise<void>;
  setSubmitLoading: (v: boolean) => void;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
  openReturnConfirm: (targets: MaterialPurchaseType[]) => Promise<void>;
}

export function usePurchaseReceiveActions({
  message,
  user,
  currentPurchase,
  detailPurchases,
  fetchMaterialPurchaseList,
  loadDetailByOrderNo,
  loadDetailByStyleNo,
  setSubmitLoading,
  ensureOrderUnlocked,
  openReturnConfirm,
}: UsePurchaseReceiveActionsOptions) {
  const receivePurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String(record?.id || '').trim();
    if (!id) { message.error('采购任务缺少ID'); return; }
    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
    if (!String(receiverName).trim()) { message.error('未填写领取人'); return; }
    const receiverId = String(user?.id || '').trim();

    let availableStock = 0;
    try {
      const orderNo = String(record?.orderNo || '').trim();
      const styleNo = String(record?.styleNo || '').trim();
      if (orderNo && orderNo !== '-') {
        const previewRes = await api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo } });
        const materials: any[] = previewRes?.data?.materials || previewRes?.materials || [];
        const matched = materials.find((m: any) => String(m.purchaseId) === id);
        if (matched) {
          availableStock = Number(matched.availableStock ?? 0);
        }
      } else if (styleNo && styleNo !== '-') {
        const previewRes = await api.get<any>('/production/purchase/smart-receive-preview', { params: { styleNo } });
        const materials: any[] = previewRes?.data?.materials || previewRes?.materials || [];
        const matched = materials.find((m: any) => String(m.purchaseId) === id);
        if (matched) {
          availableStock = Number(matched.availableStock ?? 0);
        }
      }
    } catch { /* 查询库存失败时按无库存处理 */ }

    if (availableStock > 0) {
      const pickQty = Math.min(availableStock, Number(record.purchaseQuantity || 0));
      Modal.confirm({
        width: '30vw',
        title: `确认仓库领取 - ${record.materialName || record.materialCode}`,
        icon: <ShopOutlined style={{ color: 'var(--color-primary)' }} />,
        content: (
          <div>
            <p>物料：<strong>{record.materialName || record.materialCode}</strong> {record.color ? `(${record.color})` : ''}</p>
            <p>需求数量：<strong>{record.purchaseQuantity}</strong></p>
            <p>仓库库存：<strong>{availableStock}</strong></p>
            <p>仓库领取数量：<strong style={{ color: 'var(--color-primary)' }}>{pickQty}</strong></p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>领取后将创建出库单，等待仓库确认出库</p>
          </div>
        ),
        okText: '确认领取',
        cancelText: '取消',
        onOk: async () => {
          try {
            setSubmitLoading(true);
            const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
              purchaseId: id,
              pickQty,
              receiverId,
              receiverName: String(receiverName).trim(),
            });
            if (res.code === 200) {
              message.success(`${record.materialName || record.materialCode} 已提交出库申请，等待仓库确认`);
              fetchMaterialPurchaseList();
              const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
              if (no) loadDetailByOrderNo(no);
            } else {
              message.error(res.message || '领取失败');
            }
          } catch (err: unknown) { message.error(err instanceof Error ? err.message : '领取失败'); }
          finally { setSubmitLoading(false); }
        },
      });
      return;
    }

    try {
      const mergeRes = await api.get<{ code: number; data: { currentId: string; mergeableCount: number; mergeableItems: Array<{ id: string; purchaseNo: string; materialName: string; materialCode: string; materialType: string; specifications: string; purchaseQuantity: number; unit: string; orderNo: string; styleNo: string; supplierName: string }> } }>('/production/purchase/check-mergeable', { params: { purchaseId: id } });
      const mergeableCount = mergeRes?.code === 200 ? (mergeRes.data?.mergeableCount || 0) : 0;
      const mergeableItems = mergeRes?.code === 200 ? (mergeRes.data?.mergeableItems || []) : [];
      if (mergeableCount > 0) {
        const materialInfo = String(record?.materialName || '').trim();
        Modal.confirm({
          width: '30vw',
          title: '发现当天同款面辅料采购任务',
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>当天有 <strong>{mergeableCount}</strong> 条相同面辅料（<strong>{materialInfo}</strong>）的待采购任务，是否合并采购？</p>
              <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--color-bg-subtle)', padding: '8px 12px', borderRadius: 4, fontSize: 14 }}>
                {mergeableItems.map((item, i) => (
                  <div key={item.id} style={{ marginBottom: 4, borderBottom: i < mergeableItems.length - 1 ? '1px solid #e8e8e8' : 'none', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{item.orderNo || item.styleNo || '-'}</span>{' '}
                    <span>{item.materialName}</span>{' '}
                    <span style={{ color: 'var(--color-primary)' }}>{formatMaterialQuantity(item.purchaseQuantity)}{item.unit || ''}</span>
                    {item.supplierName ? <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>{item.supplierName}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ),
          okText: '合并采购全部',
          cancelText: '仅采购当前',
          onOk: async () => {
            const allIds = [id, ...mergeableItems.map((item) => item.id)];
            try {
              setSubmitLoading(true);
              const batchRes = await api.post<{ code: number; message?: string; data: { successCount: number; skipCount: number; failCount: number; failMessages: string[] } }>('/production/purchase/batch-receive', { purchaseIds: allIds, receiverId, receiverName: String(receiverName).trim() });
              if (batchRes.code === 200) {
                const { successCount, skipCount } = batchRes.data || {};
                message.success(`已合并采购 ${successCount || 0} 条任务${skipCount ? `，跳过 ${skipCount} 条` : ''}`);
                fetchMaterialPurchaseList();
                const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
                if (no) loadDetailByOrderNo(no);
              } else { message.error(batchRes.message || '合并采购失败'); }
            } catch (err: unknown) { message.error(err instanceof Error ? err.message : '合并采购失败'); }
            finally { setSubmitLoading(false); }
          },
          onCancel: async () => {
            try {
              const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', { purchaseId: id, receiverId, receiverName: String(receiverName).trim() });
              if (res.code === 200) {
                message.success('已采购');
                fetchMaterialPurchaseList();
                const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
                if (no) loadDetailByOrderNo(no);
              } else { message.error(res.message || '采购失败'); }
            } catch (err: unknown) { message.error(err instanceof Error ? err.message : '采购失败'); }
          },
        });
        return;
      }
      Modal.confirm({
        width: '30vw',
        title: `确认采购 - ${record.materialName || record.materialCode}`,
        content: (
          <div>
            <p>物料：<strong>{record.materialName || record.materialCode}</strong> {record.color ? `(${record.color})` : ''}</p>
            <p>采购数量：<strong>{formatMaterialQuantity(record.purchaseQuantity)}{record.unit || ''}</strong></p>
            <p>供应商：{record.supplierName || '-'}</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>确认后将直接创建采购任务</p>
          </div>
        ),
        okText: '确认采购',
        cancelText: '取消',
        onOk: async () => {
          setSubmitLoading(true);
          try {
            const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', { purchaseId: id, receiverId, receiverName: String(receiverName).trim() });
            if (res.code === 200) {
              message.success('已采购');
              fetchMaterialPurchaseList();
              const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
              if (no) loadDetailByOrderNo(no);
            } else {
              message.error(res.message || '采购失败');
            }
          } catch (err: unknown) { message.error(err instanceof Error ? err.message : '采购失败'); }
          finally { setSubmitLoading(false); }
        },
      });
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '采购失败'); }
  };

  const confirmReturnPurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String(record?.id || '').trim();
    if (!id) { message.error('采购任务缺少ID'); return; }
    openReturnConfirm([record]);
  };

  const handleReceiveAll = async () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const sourceType = String(currentPurchase?.sourceType || '').trim();
    // P1-4 修复：去掉 !orderNo || orderNo === '-' 启发式判断，
    // 仅按 sourceType 判断样衣视图，避免大货订单 orderNo 临时为空时被误判
    const isSampleView = sourceType === 'sample' || sourceType === 'batch';
    if (isSampleView) {
      const pending = detailPurchases.filter((p) => String(p.status || '').toLowerCase() === 'pending' && String(p.id || '').trim());
      if (!pending.length) { message.info('没有待采购的任务'); return; }
      const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入采购人姓名') || '';
      if (!receiverName.trim()) { message.error('未填写采购人'); return; }
      const doSampleReceiveAll = async () => {
        setSubmitLoading(true);
        try {
          const styleNoParam = String(currentPurchase?.styleNo || '').trim();
          let previewMaterials: any[] = [];
          if (styleNoParam && styleNoParam !== '-') {
            try {
              const previewRes = await api.get<any>('/production/purchase/smart-receive-preview', { params: { styleNo: styleNoParam } });
              previewMaterials = previewRes?.data?.materials || previewRes?.materials || [];
            } catch { /* 预览失败按无库存处理 */ }
          }
          let outCount = 0;
          let purCount = 0;
          for (const p of pending) {
            const matched = previewMaterials.find((m: any) => String(m.purchaseId) === String(p.id));
            const stock = matched ? Number(matched.availableStock ?? 0) : 0;
            if (stock > 0) {
              const pickQty = Math.min(stock, Number(p.purchaseQuantity || 0));
              try {
                const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
                  purchaseId: p.id, pickQty, receiverId: user?.id, receiverName,
                });
                if (res.code === 200) outCount++;
                else message.warning(`${p.materialName || p.materialCode} 出库失败: ${res.message || '未知'}`);
              } catch (e: unknown) { message.warning(`${p.materialName || p.materialCode} 出库失败: ${e instanceof Error ? e.message : '未知错误'}`); }
            } else {
              try {
                const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
                  purchaseId: p.id, receiverId: user?.id, receiverName,
                });
                if (res.code === 200) purCount++;
                else message.warning(`${p.materialName || p.materialCode} 采购失败: ${res.message || '未知'}`);
              } catch (e: unknown) { message.warning(`${p.materialName || p.materialCode} 采购失败: ${e instanceof Error ? e.message : '未知错误'}`); }
            }
          }
          const parts: string[] = [];
          if (outCount > 0) parts.push(`${outCount}项出库`);
          if (purCount > 0) parts.push(`${purCount}项外采`);
          if (parts.length) message.success(`领取完成：${parts.join('，')}`);
          const styleNo = String(currentPurchase?.styleNo || '').trim();
          const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
          if (styleNo) loadDetailByStyleNo(styleNo, purchaseNo);
          fetchMaterialPurchaseList();
        } catch (e: unknown) { message.error(e instanceof Error ? e.message : '领取失败'); }
        finally { setSubmitLoading(false); }
      };
      Modal.confirm({
        width: '30vw',
        title: '确认采购全部',
        content: (
          <div>
            <p>即将采购以下 <strong>{pending.length}</strong> 项物料：</p>
            <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8, fontSize: 14 }}>
              {pending.map((p, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: i < pending.length - 1 ? '1px solid var(--color-border-light)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.materialName || p.materialCode} {p.color ? `(${p.color})` : ''}</span>
                  <span style={{ color: 'var(--color-primary)' }}>{formatMaterialQuantity(p.purchaseQuantity)}{p.unit || ''}</span>
                </div>
              ))}
            </div>
          </div>
        ),
        okText: '确认全部采购',
        cancelText: '取消',
        onOk: doSampleReceiveAll,
      });
      return;
    }
    if (!orderNo || orderNo === '-') { message.error('缺少订单号'); return; }
    setSubmitLoading(true);
    let previewPending: any[] = [];
    try {
      const res = await api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo } });
      const materials: any[] = res?.data?.materials || res?.materials || [];
      previewPending = materials.filter((m) => String(m.purchaseStatus || '').toLowerCase() === 'pending');
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '获取采购预览失败'); }
    finally { setSubmitLoading(false); }
    if (!previewPending.length) { message.info('没有待采购的物料'); return; }
    const withStock = previewPending.filter((m) => Number(m.availableStock ?? 0) > 0);
    const noStock = previewPending.filter((m) => Number(m.availableStock ?? 0) <= 0);
    const receiverName = String(user?.name || user?.username || '').trim();
    Modal.confirm({
      width: '30vw',
      title: '确认采购全部',
      content: (
        <div>
          <p>确认批量采购以下物料：</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
            有库存出库 <strong>{withStock.length}</strong> 项 + 无库存外采 <strong>{noStock.length}</strong> 项
          </p>
          <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8, fontSize: 14 }}>
            {[...withStock, ...noStock].map((m, i) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{m.materialName || m.materialCode} {m.color ? `(${m.color})` : ''}</span>
                <span style={{ color: Number(m.availableStock ?? 0) > 0 ? 'var(--color-success)' : 'var(--color-primary)' }}>
                  {Number(m.availableStock ?? 0) > 0 ? `出库 ${m.canPickQty}` : `采购 ${m.purchaseQuantity}`}{m.unit || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
      okText: '确认全部采购',
      cancelText: '取消',
      onOk: async () => {
        setSubmitLoading(true);
        try {
          let outCount = 0;
          let purCount = 0;
          for (const m of withStock) {
            try {
              await api.post('/production/purchase/warehouse-pick', { purchaseId: m.purchaseId, pickQty: m.canPickQty, receiverId: user?.id, receiverName });
              outCount++;
            } catch (e: unknown) { message.warning(`${m.materialName || m.materialCode} 出库失败: ${e instanceof Error ? e.message : '未知错误'}`); }
          }
          for (const m of noStock) {
            try {
              await api.post('/production/purchase/receive', { purchaseId: m.purchaseId, receiverId: user?.id, receiverName });
              purCount++;
            } catch (e: unknown) { message.warning(`${m.materialName || m.materialCode} 采购失败: ${e instanceof Error ? e.message : '未知错误'}`); }
          }
          const parts: string[] = [];
          if (outCount > 0) parts.push(`${outCount}项出库`);
          if (purCount > 0) parts.push(`${purCount}项外采`);
          if (parts.length) message.success(`采购完成：${parts.join('，')}`);
          fetchMaterialPurchaseList();
          if (orderNo && orderNo !== '-') loadDetailByOrderNo(orderNo);
        } catch (e: unknown) { message.error(e instanceof Error ? e.message : '采购失败'); }
        finally { setSubmitLoading(false); }
      },
    });
  };

  const handleSmartReceiveSuccess = () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    fetchMaterialPurchaseList();
    if (orderNo && orderNo !== '-') loadDetailByOrderNo(orderNo);
  };

  return {
    receivePurchaseTask,
    confirmReturnPurchaseTask,
    handleReceiveAll,
    handleSmartReceiveSuccess,
  };
}
