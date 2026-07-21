import React, { useCallback, useEffect, useState } from 'react';
import { Card, Form, InputNumber, Input, Space, message } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMaterialQuantity } from '../utils';
import api from '@/utils/api';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

interface WarehousePickModalProps {
  open: boolean;
  target: MaterialPurchaseType | null;
  pickQty: number;
  isMobile: boolean;
  user: { id?: string | number; name?: string; username?: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const WarehousePickModal: React.FC<WarehousePickModalProps> = ({
  open, target, pickQty, isMobile, user, onClose, onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      form.setFieldsValue({ pickQty });
    }
  }, [open, target, pickQty, form]);

  const handleSubmit = useCallback(async () => {
    if (!target) return;
    const values = await form.validateFields();
    const submittedPickQty = Number(values.pickQty);
    if (submittedPickQty <= 0) {
      message.error('领取数量必须大于0');
      return;
    }
    const purchaseId = String(target.id).trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    const receiverId = String(user?.id || '').trim();
    setSubmitting(true);
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
        purchaseId,
        pickQty: submittedPickQty,
        receiverId,
        receiverName,
      });
      if (res.code === 200) {
        message.success(`${target.materialName || target.materialCode} 已提交出库申请，等待仓库确认`);
        form.resetFields();
        onSuccess();
      } else {
        message.error(res.message || '领取失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '领取失败');
    } finally {
      setSubmitting(false);
    }
  }, [target, form, user, onSuccess]);

  return (
    <ResizableModal
      open={open}
      title={`仓库领取 - ${target?.materialName || target?.materialCode}`}
      okText="确认领取"
      cancelText="取消"
      width={isMobile ? '96vw' : '40vw'}
      onCancel={() => {
        onClose();
        form.resetFields();
      }}
      okButtonProps={{ loading: submitting }}
      onOk={handleSubmit}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        {target && (
          <>
            {/* 物料详细信息卡片 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <ResizableTable
                dataSource={[target]}
                pagination={false}
                size="small"
                rowKey="id"
                emptyDescription="暂无数据"
                columns={[
                  { title: '物料编号', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: any) => v || '-' },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 140, render: (v: any) => v || '-' },
                  { title: '颜色', dataIndex: 'color', key: 'color', width: 90, render: (v: any) => v || '-' },
                  { title: '规格/幅宽', key: 'specWidth', width: 130, render: (_: any, r: any) => `${r.specifications || ''}${r.fabricWidth ? ` (${r.fabricWidth})` : ''}` || '-' },
                  { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 130, render: (v: any) => v || '-' },
                  { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: any) => Number(v) ? `¥${Number(v).toFixed(2)}` : '-' },
                ]}
              />
            </Card>

            {/* 需求/库存对比 */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 24, padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 4 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>需求数量</div>
                <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatMaterialQuantity(target.purchaseQuantity)} {target.unit || ''}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>本次领取</div>
                <div style={{ fontWeight: 600, color: 'var(--color-primary)' }} id="warehouse-pick-qty-display">-</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>剩余待采购</div>
                <div style={{ fontWeight: 600, color: 'var(--color-warning)' }} id="warehouse-pick-remain-display">-</div>
              </div>
            </div>
            <div style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 13 }}>
              领取后将创建出库单，等待仓库确认出库；剩余数量将自动转采购任务。
            </div>

            <Form.Item
              label="仓库领取数量"
              name="pickQty"
              rules={[
                { required: true, message: '请输入领取数量' },
                {
                  validator: async (_, v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) throw new Error('请输入数字');
                    if (n <= 0) throw new Error('领取数量必须大于0');
                  },
                },
              ]}
            >
              <Space.Compact style={{ width: '100%' }}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={target.purchaseQuantity}
                  step={0.01}
                  precision={2}
                  placeholder="请输入领取数量"
                  onChange={(v) => {
                    const submittedPickQty = Number(v) || 0;
                    const remain = Math.max(0, Number(target.purchaseQuantity || 0) - submittedPickQty);
                    const qtyEl = document.getElementById('warehouse-pick-qty-display');
                    const remainEl = document.getElementById('warehouse-pick-remain-display');
                    if (qtyEl) qtyEl.textContent = `${submittedPickQty} ${target.unit || ''}`;
                    if (remainEl) remainEl.textContent = `${remain} ${target.unit || ''}`;
                  }}
                />
                <Input
                  style={{ width: 80, textAlign: 'center' }}
                  value={target.unit || ''}
                  disabled
                />
              </Space.Compact>
            </Form.Item>
          </>
        )}
      </Form>
    </ResizableModal>
  );
};

export default WarehousePickModal;
