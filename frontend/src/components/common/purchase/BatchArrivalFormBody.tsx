import React, { useState } from 'react';
import { Alert, Form, Input, InputNumber, Radio, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';
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

/**
 * 批量登记到货的表单体（D-890）。
 *
 * 与单条「登记到货」弹窗（PurchaseActionModals.InboundModal）完全同口径：
 * 每行可选「到货去向」= 入库到物料仓库 / 直采使用（不进仓库）；
 * 只要有任一行入库，就需选物料仓库 + 库位（MATERIAL 仓库级联，照抄单条范式）。
 */
const BatchArrivalFormBody: React.FC<Props> = ({ form, rows }) => {
  const { selectOptions: materialWarehouseOptions } = useWarehouseAreaOptions('MATERIAL');
  const [areaId, setAreaId] = useState<string | undefined>(undefined);
  const items = Form.useWatch<{ movementAction?: string }[]>('items', form) || [];
  const hasInbound = rows.some((_, idx) => (items[idx]?.movementAction || 'inbound') === 'inbound');
  const { selectOptions: materialLocationOptions, loading: locationLoading } =
    useWarehouseLocationByArea('MATERIAL', hasInbound ? areaId : undefined);

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        请确认每项本次到货数量与去向：「入库」自动生成入库单并更新库存；「直采使用」不进仓库，只记采购直用流水。
      </p>
      <div className="u-ov-auto" style={{ maxHeight: 280 }}>
        {rows.map((r, idx) => (
          <div
            key={String(r.id || idx)}
            style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}
          >
            <div className="u-fs-13" style={{ color: 'var(--color-text-primary)' }}>
              {r.materialName || r.materialCode}{r.color ? ` · ${r.color}` : ''}
            </div>
            <div className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>
              采购 {Number(r.purchaseQuantity || 0)}{r.unit || ''} · 已到 {Number(r.arrivedQuantity || 0)}{r.unit || ''}
            </div>
            <Form.Item name={['items', idx, 'purchaseId']} hidden style={{ margin: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item name={['items', idx, 'movementAction']} style={{ margin: '4px 0' }}>
              <Radio.Group>
                <Radio value="inbound">入库到物料仓库</Radio>
                <Radio value="direct_use">直采使用（不进仓库）</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              name={['items', idx, 'arrivedQuantity']}
              style={{ margin: 0 }}
              rules={[
                { required: true, message: '请输入本次到货数量' },
                {
                  validator: async (_, v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) throw new Error('请输入数字');
                    if (n <= 0) throw new Error('到货数量必须大于0');
                    const remain = Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0);
                    if (remain > 0 && n > remain) throw new Error(`不能超过待收数量 ${remain}`);
                  },
                },
              ]}
            >
              <InputNumber
                min={0.01}
                step={0.01}
                precision={2}
                style={{ width: 200 }}
                addonAfter={r.unit || undefined}
              />
            </Form.Item>
          </div>
        ))}
      </div>
      {hasInbound ? (
        <div style={{ marginTop: 8 }}>
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
            <Select
              placeholder={areaId ? '请选择库位' : '请先选择物料仓库'}
              loading={locationLoading}
              disabled={!areaId}
              allowClear
              showSearch
              options={materialLocationOptions}
            />
          </Form.Item>
        </div>
      ) : (
        <Alert
          type="info"
          showIcon
          message="全部为直采使用：不进仓库、不增加库存，系统按行记采购直用流水"
          style={{ margin: '8px 0' }}
        />
      )}
      <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
        <Input.TextArea rows={2} placeholder="可选备注" />
      </Form.Item>
    </div>
  );
};

export default BatchArrivalFormBody;
