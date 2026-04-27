import React from 'react';
import { Button, Tag, Tooltip, Divider, Empty, Space } from 'antd';
import { ShopOutlined, SendOutlined, ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import PageStatCards, { StatCard } from '@/components/common/PageStatCards';
import InoutRecommendBanner from './InoutRecommendBanner';
import type { SmartReceiveModalProps } from './smartReceiveTypes';
import { useSmartReceiveData } from './hooks/useSmartReceiveData';
import { useSmartReceiveActions } from './hooks/useSmartReceiveActions';
import { useSmartReceiveColumns } from './hooks/useSmartReceiveColumns';

const SmartReceiveModal: React.FC<SmartReceiveModalProps> = ({
  open, orderNo, onCancel, onSuccess, isSupervisorOrAbove, userId, userName,
}) => {
  const { loading, materials, pickingRecords, pendingCount, loadPreview, updatePickQty } = useSmartReceiveData(orderNo, open);
  const { actionLoading, handleWarehousePick, handlePurchaseOnly, handleCancelPicking, handleBatchPurchaseAll, handleForcePurchaseAll, handleSmartReceiveAll } = useSmartReceiveActions(loadPreview, onSuccess, userId as any, userName);
  const { materialColumns, pickingColumns } = useSmartReceiveColumns({ actionLoading, isSupervisorOrAbove, updatePickQty, handleWarehousePick, handlePurchaseOnly, handleCancelPicking });

  const pendingMaterials = materials.filter((m) => m.purchaseStatus === 'pending');
  const noStockCount = pendingMaterials.filter((m) => m.availableStock <= 0).length;
  const partialStockCount = pendingMaterials.filter((m) => m.availableStock > 0 && m.availableStock < m.requiredQty).length;
  const fullStockCount = pendingMaterials.filter((m) => m.availableStock >= m.requiredQty).length;
  const activePickings = pickingRecords.filter((p) => p.status !== 'cancelled');

  const stockStatusText = pendingMaterials.length === 0
    ? '全部已处理'
    : fullStockCount === pendingMaterials.length ? '全部充足'
    : noStockCount === pendingMaterials.length ? '全部缺货'
    : noStockCount > 0 && partialStockCount > 0 ? `${noStockCount}项缺货 ${partialStockCount}项部分有货`
    : noStockCount > 0 ? `${noStockCount}项缺货`
    : `${partialStockCount}项部分有货`;

  const stockStatusColor = pendingMaterials.length === 0 || fullStockCount === pendingMaterials.length
    ? 'var(--color-success)'
    : noStockCount === pendingMaterials.length ? 'var(--color-danger)'
    : 'var(--color-warning)';

  return (
    <ResizableModal
      title={<Space><ShopOutlined /><span>智能领取 - {orderNo}</span></Space>}
      open={open}
      onCancel={onCancel}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.6)}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="batchPurchase" icon={<SendOutlined />} loading={actionLoading._batchPurchase} disabled={pendingMaterials.filter((m) => m.availableStock <= 0).length === 0} onClick={() => handleBatchPurchaseAll(materials)} style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>一键采购全部{noStockCount > 0 ? `（${noStockCount}项）` : ''}</Button>,
        <Tooltip key="forcePurchase" title={pendingMaterials.filter((m) => m.availableStock > 0).length === 0 ? '当前所有待处理物料均无可用库存，无需跳过库存' : ''}>
          <Button icon={<ExclamationCircleOutlined />} loading={!!actionLoading._forcePurchase} disabled={pendingMaterials.filter((m) => m.availableStock > 0).length === 0 || !!actionLoading._forcePurchase} onClick={() => handleForcePurchaseAll(materials)} style={{ color: '#fa8c16', borderColor: '#fa8c16' }}>忽略库存全部外采（{pendingMaterials.length}项）</Button>
        </Tooltip>,
        <Tooltip key="smartAll" title={pendingMaterials.length > 0 && noStockCount === pendingMaterials.length ? `全部 ${noStockCount} 项物料库存为零，请先点"一键采购全部"完成采购入库后再领取` : ''}>
          <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading._all} disabled={pendingMaterials.length === 0 || noStockCount === pendingMaterials.length || actionLoading._all} onClick={() => handleSmartReceiveAll(orderNo, pendingCount)}>一键智能领取</Button>
        </Tooltip>,
      ]}
    >
      <InoutRecommendBanner pendingCount={pendingMaterials.length} noStockCount={noStockCount} partialStockCount={partialStockCount} visible={open} />

      <PageStatCards
        cards={[
          { key: 'total', items: [{ label: '面辅料需求', value: materials.length, unit: '项', color: 'var(--color-text-primary)' }, { label: '待处理', value: pendingCount, unit: '项', color: pendingCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' }] },
          { key: 'stock', items: { label: '库存状态', value: stockStatusText, color: stockStatusColor }, activeColor: stockStatusColor },
          { key: 'picking', items: { label: '已出库记录', value: activePickings.length, unit: '单', color: 'var(--color-primary)' } },
        ] as StatCard[]}
        activeKey="stock"
      />

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}> 面辅料需求明细</span>
        {pendingCount === 0 && materials.length > 0 && <Tag color="green" style={{ marginLeft: 8 }}>全部已处理</Tag>}
      </div>

      {materials.length > 0 ? (
        <ResizableTable
          storageKey="smart-receive-materials" dataSource={materials} columns={materialColumns}
          rowKey="purchaseId" size="small" pagination={false} loading={loading}
          scroll={{ x: 900 }} style={{ marginBottom: 20 }}
          rowClassName={(record: any) => { if (record.purchaseStatus !== 'pending') return 'row-done'; if (record.availableStock <= 0) return 'row-no-stock'; if (record.availableStock < record.requiredQty) return 'row-partial'; return ''; }}
        />
      ) : (
        <Empty description={loading ? '加载中...' : '该订单暂无面辅料需求记录'} style={{ marginBottom: 20, padding: '20px 0' }} />
      )}

      {pickingRecords.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}> 出库单记录</span>
            {isSupervisorOrAbove && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>（主管以上可撤销）</span>}
          </div>
          <ResizableTable
            storageKey="smart-receive-picking" dataSource={pickingRecords} columns={pickingColumns}
            rowKey="pickingId" size="small" pagination={false} scroll={{ x: 600 }}
            rowClassName={(record: any) => (record.status === 'cancelled' ? 'row-cancelled' : '')}
          />
        </>
      )}

      <style>{`
        .row-no-stock { background: #fff2f0 !important; }
        .row-partial { background: #fffbe6 !important; }
        .row-done { background: #f6f6f6 !important; }
        .row-cancelled { opacity: 0.5; }
        .row-no-stock:hover td, .row-partial:hover td, .row-done:hover td { background: inherit !important; }
      `}</style>
    </ResizableModal>
  );
};

export default SmartReceiveModal;
