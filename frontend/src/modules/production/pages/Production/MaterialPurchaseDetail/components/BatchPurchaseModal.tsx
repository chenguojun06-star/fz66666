import React, { useEffect, useMemo, useState } from 'react';
import { Form, InputNumber } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { formatMaterialQuantity } from '@/modules/production/pages/Production/MaterialPurchase/utils';

export interface BatchPurchaseItem {
  id: string;
  materialType?: string;
  materialName: string;
  materialCode: string;
  specifications?: string;
  color?: string;
  unit?: string;
  unitPrice?: number;
  supplierName?: string;
  /** 需求（默认采购）数量 */
  requiredQty: number;
}

interface BatchPurchaseModalProps {
  open: boolean;
  title?: string;
  items: BatchPurchaseItem[];
  submitting?: boolean;
  onCancel: () => void;
  /** 确认采购，参数为每项编辑后的采购数量（id -> quantity） */
  onConfirm: (quantities: Record<string, number>) => Promise<void> | void;
}

/**
 * 批量采购确认弹窗（样衣采购管理 / 大货物料采购共用）。
 *
 * 修复点（D-104）：
 * - 信息补全：物料编码、规格、颜色、单价、供应商全部展示（旧弹窗仅"物料名 · 颜色"，颜色为空显示"-"）
 * - 数量可编辑：采购数量默认为需求数量，可按实际采购量调整（旧弹窗纯文本只读）
 */
const BatchPurchaseModal: React.FC<BatchPurchaseModalProps> = ({
  open,
  title = '批量采购',
  items,
  submitting = false,
  onCancel,
  onConfirm,
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, number> = {};
      items.forEach((it) => { init[it.id] = Number(it.requiredQty) || 0; });
      setQuantities(init);
    }
  }, [open, items]);

  const totalAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(quantities[it.id]) || 0) * (Number(it.unitPrice) || 0), 0),
    [items, quantities],
  );

  const columns = useMemo(() => [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      width: 90,
      render: (v: string) => getMaterialTypeLabel(v) || '-',
    },
    {
      title: '物料名称 / 编号',
      dataIndex: 'materialName',
      width: 190,
      render: (_: string, r: BatchPurchaseItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.materialName || '无'}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{r.materialCode || '-'}</div>
        </div>
      ),
    },
    {
      title: '规格 / 颜色',
      dataIndex: 'specifications',
      width: 120,
      render: (_: string, r: BatchPurchaseItem) => (
        <span>{[r.specifications, r.color].filter(Boolean).join(' / ') || '-'}</span>
      ),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (v: number) => (v != null ? `¥${Number(v).toFixed(2)}` : '-'),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      width: 130,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '需求数量',
      dataIndex: 'requiredQty',
      width: 100,
      align: 'right' as const,
      render: (v: number, r: BatchPurchaseItem) => <span>{formatMaterialQuantity(v)}{r.unit ? ` ${r.unit}` : ''}</span>,
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQty',
      width: 140,
      render: (_: unknown, r: BatchPurchaseItem) => (
        <Form.Item
          noStyle
          name={['batchQty', r.id]}
          initialValue={Number(r.requiredQty) || 0}
          rules={[{ required: true, message: '请输入采购数量' }]}
        >
          <InputNumber
            id={`batch-purchase-qty-${r.id}`}
            aria-label={`${r.materialName || r.materialCode} 采购数量`}
            style={{ width: '100%' }}
            min={0}
            precision={2}
            addonAfter={r.unit || undefined}
            onChange={(v) => setQuantities((prev) => ({ ...prev, [r.id]: Number(v) || 0 }))}
          />
        </Form.Item>
      ),
    },
  ], []);

  return (
    <ResizableModal
      open={open}
      title={`${title}（共 ${items.length} 项）`}
      width={960}
      destroyOnHidden
      confirmLoading={submitting}
      onOk={async () => {
        const invalid = items.some((it) => !(Number(quantities[it.id]) > 0));
        if (invalid) return;
        await onConfirm(quantities);
      }}
      onCancel={onCancel}
      okText="确认批量采购"
      cancelText="取消"
    >
      <Form component={false}>
        <ResizableTable
          storageKey="batch-purchase-modal-table"
          size="small"
          columns={columns as never}
          dataSource={items}
          rowKey="id"
          pagination={false}
          scroll={{ x: 850, y: 360 }}
        />
      </Form>
      <div style={{ marginTop: 12, textAlign: 'right', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        合计金额：<span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>¥{totalAmount.toFixed(2)}</span>
      </div>
    </ResizableModal>
  );
};

export default BatchPurchaseModal;
