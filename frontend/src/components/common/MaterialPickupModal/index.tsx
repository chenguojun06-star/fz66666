import React, { useEffect } from 'react';
import { Modal, Form, InputNumber, Input, Descriptions, Tag, App } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';

export interface MaterialPickupRecord {
  materialId?: string;
  materialCode: string;
  materialName: string;
  color?: string;
  size?: string;
  unit?: string;
  /** 默认领取数量（来自BOM用量或采购数量） */
  defaultQuantity?: number;
  /** 可用库存数量 */
  availableStock?: number;
  /** 库存状态 */
  stockStatus?: string;
}

export interface MaterialPickupModalProps {
  open: boolean;
  record: MaterialPickupRecord | null;
  /** 领取场景 */
  usageType: 'PATTERN' | 'SAMPLE' | 'BULK';
  /** 款式ID */
  styleId?: string | number;
  /** 款号 */
  styleNo?: string;
  /** 订单ID（大货采购场景） */
  orderId?: string;
  /** 订单号（大货采购场景） */
  orderNo?: string;
  /** 工厂类型：INTERNAL / EXTERNAL */
  factoryType?: string;
  onCancel: () => void;
  onSuccess?: () => void;
}

const USAGE_LABELS: Record<string, string> = {
  PATTERN: '纸样开发',
  SAMPLE: '样衣采购',
  BULK: '大货生产',
};

/**
 * 通用物料领取弹窗 — 可编辑数量
 *
 * 三个环节统一使用：纸样开发(PATTERN) / 样衣采购(SAMPLE) / 大货采购(BULK)
 */
const MaterialPickupModal: React.FC<MaterialPickupModalProps> = ({
  open,
  record,
  usageType,
  styleId,
  styleNo,
  orderId,
  orderNo,
  factoryType,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { user } = useUser();
  const [loading, setLoading] = React.useState(false);

  const usageLabel = USAGE_LABELS[usageType] || '物料领取';
  const defaultQty = record?.defaultQuantity ?? 0;
  const maxQty = record?.availableStock ?? undefined;

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({
        quantity: record.defaultQuantity ?? 1,
        remark: '',
      });
    }
  }, [open, record, form]);

  const handleOk = async () => {
    if (!record) return;
    try {
      const values = await form.validateFields();
      const qty = Number(values.quantity);
      if (!qty || qty <= 0) {
        message.error('领取数量必须大于 0');
        return;
      }
      if (maxQty != null && qty > maxQty) {
        message.warning(`领取数量不能超过可用库存 ${maxQty}${record.unit || ''}`);
        return;
      }
      // 前置拦截：后端 /picking/pending 要求至少一个归属锚点（orderId/styleNo），
      // 缺失时直接提示，避免提交后才收到 400
      if (!styleNo && !orderNo && !orderId) {
        message.error('缺少归属款号/订单号，无法领取，请刷新页面后重试');
        return;
      }

      setLoading(true);
      await api.post('/production/picking/pending', {
        picking: {
          styleId: String(styleId || ''),
          styleNo: styleNo || '',
          orderNo: orderNo || '',
          orderId: String(orderId || ''),
          pickerId: String(user?.id || ''),
          pickerName: String(user?.name || user?.username || ''),
          pickupType: factoryType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
          usageType,
          remark: values.remark ? `${usageLabel}领取: ${values.remark}` : `${usageLabel}领取`,
        },
        items: [{
          materialId: record.materialId,
          materialCode: record.materialCode,
          materialName: record.materialName,
          color: record.color ?? '',
          size: record.size ?? '',
          quantity: qty,
          unit: record.unit ?? '',
        }],
      });
      message.success('领取成功，将在「面辅料出入库 → 待出库领料」中显示');
      onSuccess?.();
      onCancel();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('validateFields')) return;
      message.error(`领取失败：${error instanceof Error ? error.message : '请求错误'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!record) return null;

  return (
    <Modal
      title={`${usageLabel} · 领取面辅料`}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="确认领取"
      cancelText="取消"
      width={460}
      destroyOnClose
    >
      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="物料编码">{record.materialCode}</Descriptions.Item>
        <Descriptions.Item label="物料名称">{record.materialName}</Descriptions.Item>
        {record.color && <Descriptions.Item label="颜色">{record.color}</Descriptions.Item>}
        {record.size && <Descriptions.Item label="尺码">{record.size}</Descriptions.Item>}
        <Descriptions.Item label="可用库存">
          {maxQty != null ? (
            <Tag color={record.stockStatus === 'sufficient' ? 'success' : 'warning'}>
              {maxQty}{record.unit || ''}
            </Tag>
          ) : '未知'}
        </Descriptions.Item>
        <Descriptions.Item label="建议用量">
          {defaultQty}{record.unit || ''}
        </Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical">
        <Form.Item
          name="quantity"
          label="领取数量"
          rules={[{ required: true, message: '请输入领取数量' }]}
        >
          <InputNumber
            min={0.01}
            max={maxQty}
            step={0.1}
            precision={2}
            style={{ width: '100%' }}
            addonAfter={record.unit || ''}
          />
        </Form.Item>
        <Form.Item name="remark" label="备注（可选）">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="如有特殊说明请填写" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default MaterialPickupModal;
