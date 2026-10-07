import React from 'react';
import { Alert, InputNumber, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EditableSku } from '../types';

const { Text } = Typography;

interface Props {
  skus: EditableSku[];
  setSkus: React.Dispatch<React.SetStateAction<EditableSku[]>>;
}

/**
 * SKU 售价 / 库存编辑区（D-768）。
 * 只提交用户改过的行；库存提交「目标值」，由后端换算增减量并写操作日志。
 */
const SkuPriceStockSection: React.FC<Props> = ({ skus, setSkus }) => {
  const patch = (skuId: number, field: 'salesPrice' | 'stockQuantity', value: number | null) => {
    setSkus((prev) => prev.map((s) => (s.skuId === skuId ? { ...s, [field]: value, dirty: true } : s)));
  };

  const columns: ColumnsType<EditableSku> = [
    { title: '颜色', dataIndex: 'color', width: 110, render: (v: string) => <Tag>{v}</Tag> },
    { title: '尺码', dataIndex: 'size', width: 110 },
    {
      title: 'SKU编码',
      dataIndex: 'skuCode',
      width: 190,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: '售价（¥）',
      dataIndex: 'salesPrice',
      width: 150,
      render: (v: number | null, r) => (
        <InputNumber
          min={0}
          precision={2}
          style={{ width: 128 }}
          value={v ?? undefined}
          placeholder="未设置"
          onChange={(nv) => patch(r.skuId, 'salesPrice', nv ?? null)}
        />
      ),
    },
    {
      title: '可售库存',
      dataIndex: 'stockQuantity',
      width: 140,
      render: (v: number | null, r) => (
        <InputNumber
          min={0}
          precision={0}
          style={{ width: 118 }}
          value={v ?? undefined}
          onChange={(nv) => patch(r.skuId, 'stockQuantity', nv ?? 0)}
        />
      ),
    },
    {
      title: '本次改动',
      width: 100,
      render: (_, r) => (r.dirty ? <Tag color="orange">待保存</Tag> : <Text type="secondary">—</Text>),
    },
  ];

  const noPrice = skus.filter((s) => s.salesPrice == null || Number(s.salesPrice) <= 0).length;
  const dirtyCount = skus.filter((s) => s.dirty).length;

  return (
    <div className="shop-listing__section">
      <Alert
        type="warning"
        showIcon
        className="shop-listing__alert"
        message="手工改库存不会生成出入库单据"
        description="这里的库存调整只改 SKU 可售数量，不走出入库台账（会记录一条操作日志）。正规的库存变动请走「仓库 → 入库 / 出库」。"
      />
      {noPrice > 0 ? (
        <Alert
          type="info"
          showIcon
          className="shop-listing__alert"
          message={`有 ${noPrice} 个 SKU 没有售价`}
          description="没有售价的 SKU 在店铺里显示 ¥—，并且顾客无法下单。请先补齐售价。"
        />
      ) : null}

      <Table<EditableSku>
        rowKey="skuId"
        size="small"
        columns={columns}
        dataSource={skus}
        pagination={false}
        scroll={{ y: 320 }}
        locale={{ emptyText: '该款式还没有 SKU，请先在「款式资料」维护颜色尺码' }}
      />
      <Text type="secondary" className="shop-listing__hint">
        共 {skus.length} 个 SKU{skus.length ? `（售价 + 库存）` : ''}
        {dirtyCount ? `，本次有 ${dirtyCount} 行改动待保存` : ''}
      </Text>
    </div>
  );
};

export default SkuPriceStockSection;