import { useState } from 'react';
import { App, Input, Modal, Divider } from 'antd';
import { ShopOutlined, SendOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import type { MaterialItem, PickingRecord } from '../smartReceiveTypes';
import { getMaterialTypeName } from '../smartReceiveHelpers';

export const useSmartReceiveActions = (
  loadPreview: () => void,
  onSuccess: () => void,
  userId?: number,
  userName?: string,
) => {
  const { message } = App.useApp();
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const handleWarehousePick = (item: MaterialItem) => {
    const pickQty = item.userPickQty || 0;
    if (pickQty <= 0) { message.warning('请输入领取数量'); return; }
    if (pickQty > item.availableStock) { message.error(`库存不足，最多可领取 ${item.availableStock}`); return; }
    const remainQty = item.requiredQty - pickQty;
    const confirmMsg = remainQty > 0 ? `从仓库领取 ${pickQty}，剩余 ${remainQty} 将自动生成采购单` : `从仓库领取 ${pickQty}，全部满足`;

    Modal.confirm({
      width: '30vw', title: `确认仓库领取 - ${item.materialName}`, icon: <ShopOutlined style={{ color: 'var(--color-primary)' }} />,
      content: (<div><p>物料：<strong>{item.materialName}</strong> {item.color ? `(${item.color})` : ''}</p><p>需求数量：<strong>{item.requiredQty}</strong></p><p>仓库库存：<strong>{item.availableStock}</strong></p><p style={{ color: remainQty > 0 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 600 }}>{confirmMsg}</p></div>),
      okText: '确认领取', cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, [item.purchaseId]: true }));
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', { purchaseId: item.purchaseId, pickQty, receiverId: userId, receiverName: userName });
          if (res.code === 200) { message.success(`${item.materialName} 仓库领取成功，已出库 ${pickQty}${remainQty > 0 ? `，剩余 ${remainQty} 待采购` : ''}`); loadPreview(); onSuccess(); }
          else { message.error(res.message || '领取失败'); }
        } catch (e: unknown) { message.error(e instanceof Error ? e.message : '领取失败'); }
        finally { setActionLoading((prev) => ({ ...prev, [item.purchaseId]: false })); }
      },
    });
  };

  const handlePurchaseOnly = (item: MaterialItem) => {
    Modal.confirm({
      width: '30vw', title: `确认采购 - ${item.materialName}`, icon: <SendOutlined style={{ color: 'var(--color-primary)' }} />,
      content: (<div><p>物料编号：<strong>{item.materialCode}</strong></p><p>物料名称：<strong>{item.materialName}</strong>（{getMaterialTypeName(item.materialType)}）</p><p>需求数量：<strong>{item.requiredQty} {item.unit}</strong></p><p>仓库库存：<span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>0（无库存）</span></p><Divider style={{ margin: '8px 0' }} /><p style={{ color: 'var(--color-primary)', fontWeight: 600 }}>确认后将标记为"采购中"，请联系供应商进行采购。</p></div>),
      okText: '确认采购', cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, [item.purchaseId]: true }));
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', { purchaseId: item.purchaseId, receiverId: userId, receiverName: userName });
          if (res.code === 200) { message.success(`${item.materialName} 已确认采购，请联系供应商`); loadPreview(); onSuccess(); }
          else { message.error(res.message || '操作失败'); }
        } catch (e: unknown) { message.error(e instanceof Error ? e.message : '操作失败'); }
        finally { setActionLoading((prev) => ({ ...prev, [item.purchaseId]: false })); }
      },
    });
  };

  const handleCancelPicking = (record: PickingRecord) => {
    let reason = '';
    Modal.confirm({
      width: '30vw', title: '撤销出库单', icon: <ExclamationCircleOutlined />,
      content: (<div><p>出库单号：<strong>{record.pickingNo}</strong></p><p>领料人：{record.pickerName}</p><p style={{ marginBottom: 8 }}>撤销后将回退库存并恢复采购任务状态。</p><Input.TextArea id="revokeReason" placeholder="请填写撤销原因（必填）" rows={3} onChange={(e) => { reason = e.target.value; }} /></div>),
      okText: '确认撤销', okButtonProps: { danger: true, type: 'default' }, cancelText: '取消',
      onOk: async () => {
        if (!reason.trim()) { message.error('请填写撤销原因'); throw new Error('请填写撤销原因'); }
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/cancel-picking', { pickingId: record.pickingId, reason: reason.trim() });
          if (res.code === 200) { message.success('出库单撤销成功，库存已回退'); loadPreview(); onSuccess(); }
          else { message.error(res.message || '撤销失败'); }
        } catch (e: unknown) { message.error(e instanceof Error ? e.message : '撤销失败'); }
      },
    });
  };

  const handleBatchPurchaseAll = (materials: MaterialItem[]) => {
    const needPurchaseItems = materials.filter((m) => m.purchaseStatus === 'pending' && m.availableStock <= 0);
    if (needPurchaseItems.length === 0) { message.info('没有需要采购的物料'); return; }

    Modal.confirm({
      width: '30vw', title: '确认批量采购', icon: <SendOutlined style={{ color: 'var(--color-primary)' }} />,
      content: (<div><p>以下 <strong>{needPurchaseItems.length}</strong> 项物料将标记为"采购中"：</p><div style={{ maxHeight: 200, overflow: 'auto', margin: '8px 0', padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 4 }}>{needPurchaseItems.map((item) => (<div key={item.purchaseId} style={{ fontSize: 13, padding: '2px 0' }}>• {item.materialName}（{item.materialCode}）— {item.requiredQty} {item.unit}</div>))}</div><Divider style={{ margin: '8px 0' }} /><p style={{ color: 'var(--color-primary)', fontWeight: 600 }}>确认后请联系供应商进行采购。</p></div>),
      okText: `确认采购 ${needPurchaseItems.length} 项`, cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, _batchPurchase: true }));
        let successCount = 0; let failCount = 0;
        try {
          for (const item of needPurchaseItems) {
            try {
              const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', { purchaseId: item.purchaseId, receiverId: userId, receiverName: userName });
              if (res.code === 200) successCount++; else failCount++;
            } catch { failCount++; }
          }
          if (successCount > 0) message.success(`已确认采购 ${successCount} 项${failCount > 0 ? `，${failCount} 项失败` : ''}`);
          else message.error('批量采购全部失败');
          loadPreview(); onSuccess();
        } finally { setActionLoading((prev) => ({ ...prev, _batchPurchase: false })); }
      },
    });
  };

  const handleForcePurchaseAll = (materials: MaterialItem[]) => {
    const allPendingItems = materials.filter((m) => m.purchaseStatus === 'pending');
    if (allPendingItems.length === 0) { message.info('没有待处理的采购任务'); return; }
    const hasStockCount = allPendingItems.filter((m) => m.availableStock > 0).length;
    Modal.confirm({
      width: '30vw', title: '确认跳过库存全部外采', icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      content: (<div>{hasStockCount > 0 && <p style={{ color: '#fa8c16', fontWeight: 600 }}>有 {hasStockCount} 项物料存在可用库存，确认后将跳过仓库直接外采。</p>}<p>以下 <strong>{allPendingItems.length}</strong> 项物料将全部标记为"采购中"：</p><div style={{ maxHeight: 200, overflow: 'auto', margin: '8px 0', padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 4 }}>{allPendingItems.map((item) => (<div key={item.purchaseId} style={{ fontSize: 13, padding: '2px 0' }}>• {item.materialName}（{item.materialCode}）— {item.requiredQty} {item.unit}{item.availableStock > 0 && <span style={{ color: '#fa8c16', marginLeft: 4, fontSize: 12 }}>有库存</span>}</div>))}</div><Divider style={{ margin: '8px 0' }} /><p style={{ color: '#fa8c16', fontWeight: 600 }}>确认后请联系供应商进行采购，不使用仓库库存。</p></div>),
      okText: `确认外采 ${allPendingItems.length} 项`, cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, _forcePurchase: true }));
        let successCount = 0; let failCount = 0;
        try {
          for (const item of allPendingItems) {
            try { const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', { purchaseId: item.purchaseId, receiverId: userId, receiverName: userName }); if (res.code === 200) successCount++; else failCount++; } catch { failCount++; }
          }
          if (failCount === 0) message.success(`全部外采完成：${successCount} 项已标记为采购中`);
          else message.warning(`外采完成：${successCount} 项成功，${failCount} 项失败`);
          loadPreview(); onSuccess();
        } finally { setActionLoading((prev) => ({ ...prev, _forcePurchase: false })); }
      },
    });
  };

  const handleSmartReceiveAll = (orderNo: string, pendingCount: number) => {
    if (pendingCount === 0) { message.info('没有待处理的采购任务'); return; }
    setActionLoading((prev) => ({ ...prev, _all: true }));
    api.post<{ code: number; message?: string; data: Record<string, unknown> }>('/production/purchase/smart-receive-all', { orderNo, receiverId: userId, receiverName: userName })
      .then((res) => {
        if (res.code === 200) {
          const data = res.data || {};
          const outCount = Number(data.outboundCount || 0);
          const purCount = Number(data.purchaseCount || 0);
          if (outCount > 0 && purCount === 0) message.success(`已提交 ${outCount} 项出库申请，等待仓库确认出库`);
          else if (outCount > 0 && purCount > 0) message.info(`${outCount} 项已提交出库申请；${purCount} 项库存不足，需先完成采购入库后再领取`);
          else message.warning(`${purCount} 项物料库存不足，请先完成采购入库后再领取`);
          loadPreview(); onSuccess();
        } else { message.error(res.message || '智能领取失败'); }
      })
      .catch((e: unknown) => { message.error(e instanceof Error ? e.message : '智能领取失败'); })
      .finally(() => { setActionLoading((prev) => ({ ...prev, _all: false })); });
  };

  return { actionLoading, handleWarehousePick, handlePurchaseOnly, handleCancelPicking, handleBatchPurchaseAll, handleForcePurchaseAll, handleSmartReceiveAll };
};
