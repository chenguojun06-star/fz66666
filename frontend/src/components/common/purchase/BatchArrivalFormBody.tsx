import React, { useState } from 'react';
import { Alert, Form, Input, InputNumber, Radio, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';
import WarehouseLocationSelect from '@/components/common/WarehouseLocationSelect';
import type { BatchActionRow } from './PurchaseActionBar';

/** 批量登记到货的行（在统一判定字段基础上带展示信息） */
export interface BatchArrivalRow extends BatchActionRow {
  materialName?: string;
  materialCode?: string;
  color?: string;
  unit?: string;
}

interface Props {
  form: FormInstance;
  rows: BatchArrivalRow[];
}

interface RowValue {
  purchaseId?: string;
  arrivedQuantity?: number;
  movementAction?: string;
}

/**
 * 批量登记到货的表单体（D-890/D-891）。
 *
 * 与单条「登记到货」弹窗（PurchaseActionModals.InboundModal）完全同口径：
 * 每行可选「到货去向」= 入库到物料仓库 / 直采使用（不进仓库）；
 * 只要有任一行入库，就需选物料仓库 + 库位（MATERIAL 仓库级联，照抄单条范式）。
 *
 * D-891 修复：
 * 1) 必须自带 <Form form={form}> 包裹——Modal.confirm 是独立 React 根，
 *    没有 Form 元素时 form 实例不挂载，Radio 受控但写不回值 → 点不动。
 * 2) 顶部加「统一选择」去向，一次应用到全部行（行内仍可单独改）。
 * 3) 到货数量不设上限——采购数量只是推荐值，实际到货可多可少（用户多次强调）。
 */
const BatchArrivalFormBody: React.FC<Props> = ({ form, rows }) => {
  const { selectOptions: materialWarehouseOptions } = useWarehouseAreaOptions('MATERIAL');
  const [areaId, setAreaId] = useState<string | undefined>(undefined);
  const items = Form.useWatch<RowValue[]>('items', form) || [];
  const hasInbound = rows.some((_, idx) => (items[idx]?.movementAction || 'inbound') === 'inbound');
  const { locations: materialLocations, loading: locationLoading } =
    useWarehouseLocationByArea('MATERIAL', hasInbound ? areaId : undefined);

  // D-894：统一选择的初始值与行初始值同源——沿用上一次的去向选择，不再写死「入库」
  const defaultAction = localStorage.getItem('purchase.confirmComplete.lastMovementAction') === 'direct_use' ? 'direct_use' : 'inbound';

  // D-891：统一选择——把去向一次性应用到所有行（保留各行已填数量）
  const applyAllMovementAction = (action: string) => {
    const cur = (form.getFieldValue('items') || []) as RowValue[];
    form.setFieldsValue({
      items: rows.map((_, idx) => ({ ...cur[idx], movementAction: action })),
    });
  };

  return (
    <Form form={form} layout="vertical" className="u-mt-8">
      <Alert
        type="info"
        showIcon
        message="「入库」自动生成入库单并更新库存；「直采使用」不进仓库，只记采购直用流水。到货数量按实际填写，可多于或少于采购数量。"
        style={{ marginBottom: 12 }}
      />
      <div className="u-d-flex u-ai-center u-gap-12" style={{ marginBottom: 8 }}>
        <span className="u-fw-600">到货去向（统一选择，行内可单独改）：</span>
        <Radio.Group defaultValue={defaultAction} onChange={(e) => applyAllMovementAction(e.target.value)}>
          <Radio value="inbound">全部入库</Radio>
          <Radio value="direct_use">全部直采使用</Radio>
        </Radio.Group>
      </div>
      <div className="u-ov-auto" style={{ maxHeight: '42vh', paddingRight: 4 }}>
        {rows.map((r, idx) => (
          <div
            key={String(r.id || idx)}
            style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border-light)' }}
          >
            <div className="u-d-flex u-ai-flex-start" style={{ justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div className="u-fs-13 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>
                  {r.materialName || r.materialCode}{r.color ? ` · ${r.color}` : ''}
                </div>
                <div className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>
                  采购 {Number(r.purchaseQuantity || 0)}{r.unit || ''} · 已到 {Number(r.arrivedQuantity || 0)}{r.unit || ''} · 待到货 {Math.max(0, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0)).toFixed(2)}{r.unit || ''}
                </div>
              </div>
              <Form.Item
                name={['items', idx, 'arrivedQuantity']}
                label="本次到货数量"
                style={{ marginBottom: 0, minWidth: 200 }}
                rules={[
                  { required: true, message: '请输入本次到货数量' },
                  {
                    validator: async (_, v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n)) throw new Error('请输入数字');
                      if (n <= 0) throw new Error('到货数量必须大于0');
                    },
                  },
                ]}
              >
                <InputNumber
                  min={0.01}
                  step={0.01}
                  precision={2}
                  style={{ width: 180 }}
                  addonAfter={r.unit || undefined}
                />
              </Form.Item>
            </div>
            <Form.Item name={['items', idx, 'purchaseId']} hidden style={{ margin: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item name={['items', idx, 'movementAction']} style={{ margin: '6px 0 0' }}>
              <Radio.Group>
                <Radio value="inbound">入库到物料仓库</Radio>
                <Radio value="direct_use">直采使用（不进仓库）</Radio>
              </Radio.Group>
            </Form.Item>
          </div>
        ))}
      </div>
      {hasInbound ? (
        <div style={{ marginTop: 12 }}>
          <Form.Item label="物料仓库" required style={{ marginBottom: 8 }}>
            <Select
              placeholder="请选择物料仓库"
              value={areaId}
              onChange={(v) => {
                setAreaId(v);
                form.setFieldsValue({ warehouseLocation: '' });
              }}
              allowClear
              options={materialWarehouseOptions}
            />
          </Form.Item>
          {materialWarehouseOptions.length === 0 && (
            <Alert
              type="warning"
              showIcon
              message="还没有物料仓库，请先到「库位地图」新建仓库并划分库位"
              style={{ marginBottom: 8 }}
            />
          )}
          <Form.Item
            name="warehouseLocation"
            label="库位"
            rules={[{ required: true, message: '请选择库位' }]}
            style={{ marginBottom: 8 }}
          >
            <WarehouseLocationSelect
              warehouseType="MATERIAL"
              locations={materialLocations}
              placeholder={areaId ? '请选择库位' : '请先选择物料仓库'}
              loading={locationLoading}
              disabled={!areaId}
            />
          </Form.Item>
        </div>
      ) : (
        <Alert
          type="info"
          showIcon
          message="全部为直采使用：不进仓库、不增加库存，系统按行记采购直用流水"
          style={{ margin: '12px 0' }}
        />
      )}
      <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
        <Input.TextArea rows={2} placeholder="可选备注" />
      </Form.Item>
    </Form>
  );
};

export default BatchArrivalFormBody;
