import { Tag, Space, InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import { StyleCoverThumb } from '@/components/StyleAssets';

// SKU明细接口
export interface SKUDetail {
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  costPrice?: number;
  salesPrice?: number;
  outboundQty?: number;
  selected?: boolean;
}

export interface FinishedInventory {
  id: string;
  orderId?: string;
  orderNo: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orderBizType?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  styleId?: string;
  styleNo: string;
  styleName: string;
  styleImage?: string;
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  lastInboundDate: string;
  qualityInspectionNo?: string;
  lastInboundBy?: string;
  lastOutboundDate?: string;
  lastOutstockNo?: string;
  lastOutboundBy?: string;
  totalInboundQty?: number;
  costPrice?: number;
  salesPrice?: number;
  colors?: string[];
  sizes?: string[];
}

export function getMainColumns(handlers: {
  handleOutbound: (record: FinishedInventory) => void;
  handleViewInboundHistory: (record: FinishedInventory) => void;
}): ColumnsType<FinishedInventory> {
  return [
    {
      title: '图片',
      dataIndex: 'styleImage',
      width: 72,
      fixed: 'left',
      align: 'center',
      render: (_, record) => (
        <StyleCoverThumb
          src={record.styleImage || null}
          styleNo={record.styleNo}
          size={48}
          borderRadius={4}
        />
      ),
    },
    {
      title: '成品信息',
      width: 280,
      fixed: 'left',
      render: (_, record) => (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Space size={8} align="center">
            <strong style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--neutral-text)' }}>{record.styleNo}</strong>
            <Tag color="blue" style={{ fontWeight: 600 }}>{record.orderNo}</Tag>
          </Space>
          <div style={{ fontSize: "var(--font-size-md)", color: 'var(--neutral-text)', fontWeight: 600, lineHeight: 1.4 }}>
            {record.styleName}
          </div>
          {record.factoryName || record.orgPath || record.parentOrgUnitName || record.factoryType ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                工厂：
                {record.factoryType === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
                {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
                {record.factoryName || '-'}
                {record.orderBizType && (() => {
                  const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
                  return <Tag color={colorMap[record.orderBizType] ?? 'default'} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>{record.orderBizType}</Tag>;
                })()}
              </div>
              {record.orgPath || record.parentOrgUnitName ? (
                <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
                  组织：{record.orgPath || record.parentOrgUnitName}
                </div>
              ) : null}
            </div>
          ) : null}
          {record.qualityInspectionNo && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: 4,
              borderTop: '1px solid #f0f0f0'
            }}>
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>质检入库号:</span>{' '}
                <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{record.qualityInspectionNo}</span>
              </div>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: '颜色 & 尺码',
      width: 200,
      render: (_, record) => (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>颜色</div>
            <Space size={[4, 4]} wrap>
              {record.colors && record.colors.length > 0 ? (
                record.colors.map((color, index) => (
                  <Tag
                    key={index}
                    color={color === record.color ? 'blue' : 'default'}
                    style={{ fontWeight: color === record.color ? 700 : 500 }}
                  >
                    {color}
                  </Tag>
                ))
              ) : (
                <Tag color="blue" style={{ fontWeight: 700 }}>{record.color}</Tag>
              )}
            </Space>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>尺码</div>
            <Space size={[4, 4]} wrap>
              {record.sizes && record.sizes.length > 0 ? (
                record.sizes.map((size, index) => (
                  <Tag
                    key={index}
                    color={size === record.size ? 'green' : 'default'}
                    style={{ fontWeight: size === record.size ? 700 : 500 }}
                  >
                    {size}
                  </Tag>
                ))
              ) : (
                <Tag color="green" style={{ fontWeight: 700 }}>{record.size}</Tag>
              )}
            </Space>
          </div>
        </Space>
      ),
    },
    {
      title: '库存状态',
      width: 260,
      render: (_, record) => (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%'
        }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>可用</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-success)' }}>
              {record.availableQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>锁定</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-warning)' }}>
              {record.lockedQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>次品</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: record.defectQty > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {record.defectQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
        </div>
      ),
    },
    {
      title: '单价',
      width: 130,
      render: (_, record) => (
        <div style={{ lineHeight: '22px' }}>
          {record.salesPrice != null ? (
            <div>
              <span style={{ fontSize: 11, color: 'var(--neutral-text-disabled)' }}>单价 </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-danger)' }}>¥{Number(record.salesPrice).toFixed(2)}</span>
            </div>
          ) : null}
          {record.costPrice != null ? (
            <div>
              <span style={{ fontSize: 11, color: 'var(--neutral-text-disabled)' }}>成本 </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-text-secondary)' }}>¥{Number(record.costPrice).toFixed(2)}</span>
            </div>
          ) : null}
          {record.salesPrice != null && record.costPrice != null ? (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-disabled)' }}>毛利 </span>
              <span style={{ fontSize: 11, color: Number(record.salesPrice) > Number(record.costPrice) ? 'var(--color-success)' : 'var(--color-danger)' }}>
                ¥{(Number(record.salesPrice) - Number(record.costPrice)).toFixed(2)}
              </span>
            </div>
          ) : null}
          {record.salesPrice == null && record.costPrice == null ? (
            <span style={{ fontSize: 12, color: 'var(--neutral-text-disabled)' }}>-</span>
          ) : null}
        </div>
      ),
    },
    {
      title: '出入库记录',
      width: 260,
      render: (_, record) => (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库时间:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastInboundDate ? String(record.lastInboundDate).slice(0, 16).replace('T', ' ') : '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库号:</span>{' '}
            <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{record.qualityInspectionNo || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>操作人:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastInboundBy || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库数量:</span>{' '}
            <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{record.totalInboundQty ?? record.availableQty ?? '-'}</span>
            {(record.totalInboundQty != null || record.availableQty != null) && <span style={{ color: 'var(--neutral-text-disabled)', marginLeft: 2 }}>件</span>}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500, paddingTop: 4, borderTop: '1px dashed #f0f0f0' }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>最后出库:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastOutboundDate ? String(record.lastOutboundDate).slice(0, 16).replace('T', ' ') : '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>出库单号:</span>{' '}
            <span style={{ color: 'var(--warning-color-dark)', fontWeight: 600 }}>{record.lastOutstockNo || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>出库人:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastOutboundBy || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>库位:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.warehouseLocation || '-'}</span>
          </div>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'outbound',
              label: '出库',
              primary: true,
              onClick: () => handlers.handleOutbound(record)
            },
            {
              key: 'history',
              label: '入库记录',
              onClick: () => handlers.handleViewInboundHistory(record)
            }
          ]}
        />
      ),
    },
  ];
}

export function getSkuColumns(handlers: {
  handleSKUQtyChange: (index: number, val: number | null) => void;
}): ColumnsType<SKUDetail> {
  return [
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      align: 'center',
      render: (color: string) => (
        <Tag color="blue">{color}</Tag>
      ),
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      align: 'center',
      render: (size: string) => (
        <Tag color="green">{size}</Tag>
      ),
    },
    {
      title: 'SKU编码',
      dataIndex: 'sku',
      key: 'sku',
      width: 180,
    },
    {
      title: '仓库位置',
      dataIndex: 'warehouseLocation',
      key: 'warehouseLocation',
      width: 100,
      align: 'center',
    },
    {
      title: '可用库存',
      dataIndex: 'availableQty',
      key: 'availableQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '锁定库存',
      dataIndex: 'lockedQty',
      key: 'lockedQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '次品库存',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '成本价',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 90,
      align: 'center',
      render: (v: number) => v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      key: 'salesPrice',
      width: 90,
      align: 'center',
      render: (v: number) => v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '出库数量',
      dataIndex: 'outboundQty',
      key: 'outboundQty',
      width: 120,
      align: 'center',
      render: (value: number, record: SKUDetail, index: number) => (
        <InputNumber
          min={0}
          max={record.availableQty}
          value={value}
          onChange={(val) => handlers.handleSKUQtyChange(index, val)}
          style={{ width: '100%' }}
          placeholder="0"
        />
      ),
    },
  ];
}
