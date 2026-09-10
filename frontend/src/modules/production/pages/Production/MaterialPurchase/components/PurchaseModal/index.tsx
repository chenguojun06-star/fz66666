import React, { useMemo } from 'react';
import { Button, Dropdown, Drawer, Space, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import PurchaseDetailView from './PurchaseDetailView';
import PurchaseCreateForm from './PurchaseCreateForm';
import PurchasePreviewView from './PurchasePreviewView';

interface PurchaseModalProps {
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
  onCancel: () => void;
  isMobile: boolean;
  submitLoading: boolean;

  // Data for View Mode
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailLoading: boolean;
  detailSizePairs: Array<{ size: string; quantity: number }>;
  detailFrozen: boolean;

  // Data for Preview Mode
  previewList: MaterialPurchaseType[];
  previewOrderId: string;

  // Handlers & Utils
  isSupervisorOrAbove: boolean;
  form: FormInstance;
  user: any;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onReceive: (record: MaterialPurchaseType) => void;
  onConfirmReturn: (record: MaterialPurchaseType) => void;
  onReturnReset: (record: MaterialPurchaseType) => void;
  onQualityIssue: (record: MaterialPurchaseType) => void;
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  onConfirmComplete: () => void;
  confirmCompleteSubmitting: boolean;
  isSamplePurchase: boolean;
  onGeneratePurchaseSheet: (autoPrint: boolean) => void;
  onDownloadPurchaseSheet: () => void;
  onSaveCreate: () => void;
  onSavePreview: () => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onWarehousePick?: (record: MaterialPurchaseType, pickQty: number) => void;
  onRefresh?: () => void;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({
  visible,
  dialogMode,
  onCancel,
  isMobile,
  submitLoading,
  currentPurchase,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  detailLoading,
  detailSizePairs,
  detailFrozen,
  previewList,
  previewOrderId: _previewOrderId,
  isSupervisorOrAbove,
  form,
  user: _user,
  sortField,
  sortOrder,
  onSort,
  onReceive,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  onReceiveAll,
  onBatchReturn,
  onConfirmComplete,
  confirmCompleteSubmitting,
  isSamplePurchase,
  onGeneratePurchaseSheet,
  onDownloadPurchaseSheet,
  onSaveCreate,
  onSavePreview,
  isOrderFrozenForRecord,
  onWarehousePick,
  onRefresh,
}) => {
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    (detailOrderLines || []).forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [detailOrderLines]);

  // 详情模式：确认完成 / 采购单生成 / 关闭 移入弹窗顶部（header extra），不再占用底部 footer
  const getViewHeader = () => {
    return (
      <Space wrap>
        <Button
          key="confirmComplete"
          disabled={!detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM) || detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}
          loading={confirmCompleteSubmitting}
          onClick={onConfirmComplete}
        >
          确认完成
        </Button>
        <Dropdown
          key="sheet"
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'print',
                label: '打印采购单',
                onClick: () => onGeneratePurchaseSheet(true),
              },
              {
                key: 'download',
                label: '下载采购单',
                onClick: () => onDownloadPurchaseSheet(),
              },
            ],
          }}
        >
          {/* D-333：打印/下载是只读操作，回料确认后仍应可用——只在没有采购数据时禁用 */}
          {/* D-360c：原「采购单生成」无箭头且不提打印下载，用户找不到入口——改可发现的显式标签 */}
          <Tooltip title="点击选择打印或下载采购单">
            <Button disabled={detailLoading || !detailPurchases.length}>
              打印/下载采购单 <DownOutlined />
            </Button>
          </Tooltip>
        </Dropdown>
        <Button key="close" type="primary" onClick={onCancel}>
          关闭
        </Button>
      </Space>
    );
  };

  const getFooter = () => {
    // 详情模式按钮已上移，底部 footer 不再渲染
    if (dialogMode === 'view') {
      return null;
    }

    if (dialogMode === 'preview') {
      return [
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitLoading}
          onClick={onSavePreview}
        >
          保存生成
        </Button>
      ];
    }

    // Create Mode
    return [
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="submit" type="primary" onClick={onSaveCreate} loading={submitLoading}>
        保存
      </Button>
    ];
  };

  return (
    <Drawer
      title={dialogMode === 'preview' ? '采购清单预览' : dialogMode === 'create' ? '新增采购单' : '采购单详情'}
      open={visible}
      onClose={onCancel}
      placement="right"
      extra={dialogMode === 'view' ? getViewHeader() : undefined}
      styles={{
        wrapper: { width: isMobile ? '96vw' : '85%' },
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
        footer: { padding: '12px 16px' },
      }}
      maskClosable={false}
      footer={getFooter()}
    >
      <div style={{ padding: '16px', flex: 1, overflow: 'auto' }}>
        {dialogMode === 'preview' ? (
          <PurchasePreviewView previewList={previewList} isMobile={isMobile} />
        ) : dialogMode === 'view' ? (
          <PurchaseDetailView
            currentPurchase={currentPurchase}
            detailOrder={detailOrder}
            detailOrderLines={detailOrderLines}
            detailPurchases={detailPurchases}
            detailLoading={detailLoading}
            detailSizePairs={detailSizePairs}
            detailFrozen={detailFrozen}
            isMobile={isMobile}
            isSupervisorOrAbove={isSupervisorOrAbove}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
            onReceive={onReceive}
            onConfirmReturn={onConfirmReturn}
            onReturnReset={onReturnReset}
            onQualityIssue={onQualityIssue}
            onReceiveAll={onReceiveAll}
            onBatchReturn={onBatchReturn}
            onConfirmComplete={onConfirmComplete}
            confirmCompleteSubmitting={confirmCompleteSubmitting}
            isSamplePurchase={isSamplePurchase}
            isOrderFrozenForRecord={isOrderFrozenForRecord}
            onWarehousePick={onWarehousePick}
            onRefresh={onRefresh}
          />
        ) : (
          <PurchaseCreateForm form={form} orderColors={orderColors} />
        )}
      </div>
    </Drawer>
  );
};

export default PurchaseModal;
