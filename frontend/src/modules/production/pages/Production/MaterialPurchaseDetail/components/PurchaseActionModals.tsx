import React, { useEffect, useState } from 'react';
import { Form, InputNumber, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ModalContentLayout from '@/components/common/ModalContentLayout';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';
import { formatMaterialQuantityWithUnit } from '../../MaterialPurchase/utils';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialPurchase } from '@/types/production';

export interface ReceiveModalProps {
  visible: boolean;
  record: MaterialPurchase | null;
  form: FormInstance;
  loading: boolean;
  onOk: () => void;
  onCancel: () => void;
}

export const ReceiveModal: React.FC<ReceiveModalProps> = ({ visible, record, form, loading, onOk, onCancel }) => (
  <ResizableModal
    title={record && String(record.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.PENDING ? '领取到货' : '追加到货'}
    open={visible}
    onOk={onOk}
    onCancel={onCancel}
    confirmLoading={loading}
    width="40vw"
  >
    {record && (
      <ModalContentLayout.HeaderCard>
        <ModalContentLayout.FieldRow gap={16}>
          <ModalContentLayout.Field label="物料名称" value={record.materialName} />
          <ModalContentLayout.Field label="物料编码" value={record.materialCode} />
          <ModalContentLayout.Field label="颜色/规格" value={`${record.color || '-'} / ${(record as any).specifications || '-'}`} />
          <ModalContentLayout.Field label="采购数量" value={formatMaterialQuantityWithUnit(record.purchaseQuantity, record.unit)} />
          <ModalContentLayout.Field label="已到货" value={formatMaterialQuantityWithUnit(record.arrivedQuantity, record.unit)} />
          <ModalContentLayout.Field label="待到货" value={formatMaterialQuantityWithUnit(Math.max(0, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0)), record.unit)} />
        </ModalContentLayout.FieldRow>
      </ModalContentLayout.HeaderCard>
    )}
    <Form form={form} layout="vertical">
      <Form.Item name="quantity" label="本次到货数量" rules={[{ required: true, message: '请输入数量' }]}>
        <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} addonAfter={record?.unit} />
      </Form.Item>
    </Form>
  </ResizableModal>
);

export interface InboundModalProps {
  visible: boolean;
  record: MaterialPurchase | null;
  form: FormInstance;
  onOk: () => void;
  onCancel: () => void;
}

export const InboundModal: React.FC<InboundModalProps> = ({ visible, record, form, onOk, onCancel }) => {
  // D-366：库位必须来自物料仓库布局（与「物料入库」页同源），不再手输字符串
  const { selectOptions: materialWarehouseOptions } = useWarehouseAreaOptions('MATERIAL');
  const [areaId, setAreaId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setAreaId(undefined);
      form.setFieldsValue({ warehouseLocation: '' });
    }
  }, [visible, form]);

  return (
    <ResizableModal
      title="到货入库"
      open={visible}
      onOk={onOk}
      onCancel={onCancel}
      width="40vw"
    >
      {record && (
        <ModalContentLayout.HeaderCard>
          <ModalContentLayout.FieldRow gap={16}>
            <ModalContentLayout.Field label="物料名称" value={record.materialName} />
            <ModalContentLayout.Field label="物料编码" value={record.materialCode} />
            {/* 物料只有颜色/规格，没有码数——原先误用 record.size 导致拼接出一串订单码数 */}
            <ModalContentLayout.Field label="颜色/规格" value={`${record.color || '-'} / ${(record as any).specifications || '-'}`} />
            <ModalContentLayout.Field label="采购数量" value={formatMaterialQuantityWithUnit(record.purchaseQuantity, record.unit)} />
            {/* arrivedQuantity 语义是「已到货」，不是「已入库」，标签必须如实 */}
            <ModalContentLayout.Field label="已到货" value={formatMaterialQuantityWithUnit(record.arrivedQuantity, record.unit)} />
            <ModalContentLayout.Field label="待到货" value={formatMaterialQuantityWithUnit(Math.max(0, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0)), record.unit)} />
          </ModalContentLayout.FieldRow>
        </ModalContentLayout.HeaderCard>
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="arrivedQuantity" label="本次到货数量" rules={[{ required: true, message: '请输入数量' }]}>
          <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} addonAfter={record?.unit} />
        </Form.Item>
        <Form.Item label="物料仓库" required>
          <Select
            placeholder="请选择物料仓库"
            options={materialWarehouseOptions}
            value={areaId}
            onChange={(v) => {
              setAreaId(v);
              form.setFieldsValue({ warehouseLocation: '' });
            }}
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="warehouseLocation"
          label="库位"
          rules={[{ required: true, message: '请选择库位' }]}
        >
          <WarehouseLocationAutoComplete
            warehouseType="MATERIAL"
            areaId={areaId}
            placeholder="请选择库位"
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="可选备注" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export interface ReturnConfirmModalProps {
  visible: boolean;
  record: MaterialPurchase | null;
  form: FormInstance;
  loading: boolean;
  onOk: () => void;
  onCancel: () => void;
}

export const ReturnConfirmModal: React.FC<ReturnConfirmModalProps> = ({ visible, record, form, loading, onOk, onCancel }) => (
  <ResizableModal
    title="回料确认"
    open={visible}
    onOk={onOk}
    onCancel={onCancel}
    confirmLoading={loading}
    width="40vw"
  >
    {record && (
      <ModalContentLayout.HeaderCard>
        <ModalContentLayout.FieldRow gap={16}>
          <ModalContentLayout.Field label="物料名称" value={record.materialName} />
          <ModalContentLayout.Field label="物料编码" value={record.materialCode} />
          <ModalContentLayout.Field label="颜色/规格" value={`${record.color || '-'} / ${(record as any).specifications || '-'}`} />
          <ModalContentLayout.Field label="采购数量" value={formatMaterialQuantityWithUnit(record.purchaseQuantity, record.unit)} />
          <ModalContentLayout.Field label="已到货" value={formatMaterialQuantityWithUnit(record.arrivedQuantity, record.unit)} />
        </ModalContentLayout.FieldRow>
      </ModalContentLayout.HeaderCard>
    )}
    <Form form={form} layout="vertical">
      <Form.Item name="quantity" label="实际回料数量" rules={[{ required: true, message: '请输入实际回料数量' }]}>
        <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} addonAfter={record?.unit} />
      </Form.Item>
    </Form>
  </ResizableModal>
);
