import React, { useEffect, useState } from 'react';
import { Alert, Form, InputNumber, Input, Radio, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ModalContentLayout from '@/components/common/ModalContentLayout';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';
import { formatMaterialQuantityWithUnit } from '../../MaterialPurchase/utils';
import type { MaterialPurchase } from '@/types/production';

const { Option } = Select;

export interface ReceiveModalProps {
  visible: boolean;
  record: MaterialPurchase | null;
  form: FormInstance;
  loading: boolean;
  onOk: () => void;
  onCancel: () => void;
}

/**
 * D-366b：领取 = 只认领任务，不登记到货（到货是下一步「登记到货」）。
 * 旧实现把"本次到货数量"提交给 /purchase/receive，而后端该字段语义是
 * 「编辑采购数量」(D-104)，导致界面说的与后端做的不是一回事。
 */
export const ReceiveModal: React.FC<ReceiveModalProps> = ({ visible, record, loading, onOk, onCancel }) => (
  <ResizableModal
    title="领取采购"
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
    <Alert
      type="info"
      showIcon
      message="领取后即可开始采购"
      description="物料实际到货时，请在该行点「登记到货」，选择「入库到物料仓库」（需选仓库与库位）或「直采使用」（不进仓库，直接记直用流水）。"
    />
  </ResizableModal>
);

export interface InboundModalProps {
  visible: boolean;
  record: MaterialPurchase | null;
  form: FormInstance;
  onOk: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const InboundModal: React.FC<InboundModalProps> = ({ visible, record, form, onOk, onCancel, loading }) => {
  // D-366b：仓库/库位选择完全照抄「样衣入库」范式（Select + options + 空态提示），
  // 上一轮用的 AutoComplete 在无数据时点击无任何反馈，用户以为坏了。
  const { selectOptions: materialWarehouseOptions } = useWarehouseAreaOptions('MATERIAL');
  const [areaId, setAreaId] = useState<string | undefined>(undefined);
  const movementAction = Form.useWatch('movementAction', form) || 'inbound';
  const { selectOptions: materialLocationOptions, loading: locationLoading } =
    useWarehouseLocationByArea('MATERIAL', movementAction === 'inbound' ? areaId : undefined);

  useEffect(() => {
    if (visible) {
      setAreaId(undefined);
      form.setFieldsValue({ movementAction: 'inbound', warehouseLocation: '' });
    }
  }, [visible, form]);

  return (
    <ResizableModal
      title="登记到货"
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
        <Form.Item
          name="arrivedQuantity"
          label="本次到货数量"
          rules={[{ required: true, message: '请输入到货数量' }]}
          extra="物料到货/入库数量目前按整数登记；小数到货需数据模型升级后开放"
        >
          <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} addonAfter={record?.unit} />
        </Form.Item>
        {/* D-366b：用户拍板——到货时必须选去向 */}
        <Form.Item name="movementAction" label="到货去向" rules={[{ required: true, message: '请选择到货去向' }]}>
          <Radio.Group>
            <Radio value="inbound">入库到物料仓库</Radio>
            <Radio value="direct_use">直采使用（不进仓库）</Radio>
          </Radio.Group>
        </Form.Item>
        {movementAction === 'inbound' ? (
          <>
            <Form.Item label="物料仓库" required>
              <Select
                placeholder="请选择物料仓库"
                value={areaId}
                onChange={(v) => {
                  setAreaId(v);
                  form.setFieldsValue({ warehouseLocation: '' });
                }}
                allowClear
                notFoundContent="暂无物料仓库，请前往「仓库管理 → 库位地图」创建"
              >
                {materialWarehouseOptions.length > 0
                  ? materialWarehouseOptions.map((opt) => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))
                  : <Option value="" disabled>暂无物料仓库，请前往库位地图创建</Option>}
              </Select>
            </Form.Item>
            <Form.Item
              name="warehouseLocation"
              label="库位"
              rules={[{ required: true, message: '请选择库位' }]}
            >
              <Select
                placeholder={areaId ? '请选择库位' : '请先选择物料仓库'}
                allowClear
                showSearch
                loading={locationLoading}
                disabled={!areaId}
                notFoundContent={locationLoading ? '加载中...' : areaId ? '该仓库暂无库位' : '请先选择物料仓库'}
                filterOption={(input, option) => String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())}
              >
                {materialLocationOptions.map((opt) => (
                  <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </>
        ) : (
          <Alert
            type="info"
            showIcon
            message="直采使用：物料不进仓库"
            description="到货数量只登记到货，不增加库存；系统会记一条采购直用流水，适合到货即上线使用的场景。"
            style={{ marginBottom: 12 }}
          />
        )}
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
