import React from 'react';
import { Space, Image } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd/es/form';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import RowActions from '@/components/common/RowActions';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatMaterialSpecWidth, getMaterialTypeCategory } from '@/utils/materialType';
import type { UserInfo } from '@/utils/AuthContext';
import type { MaterialInventory } from '../types';

interface UseMaterialInventoryColumnsProps {
  user: UserInfo | null;
  openInstructionFromRecord: (record: MaterialInventory) => void;
  handleInbound: (record: MaterialInventory) => void;
  rollForm: FormInstance;
  rollModal: { open: (data: { inboundId: string; materialCode: string; materialName: string }) => void };
  handleOutbound: (record: MaterialInventory) => void;
  handlePrintOutbound: (record: MaterialInventory) => void;
  handleViewDetail: (record: MaterialInventory) => void;
  handleEditSafetyStock: (record: MaterialInventory) => void;
}

const compactInfoRowStyle: React.CSSProperties = {
  display: 'flex',
  fontSize: 'var(--font-size-sm)',
  lineHeight: '22px',
  minHeight: '22px',
};

const compactInfoLabelStyle: React.CSSProperties = {
  color: 'var(--neutral-text-disabled)',
  width: '72px',
  textAlign: 'right',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const normalizeUnit = (value?: string) => String(value || '').trim().toLowerCase();
const isMeterUnit = (value?: string) => {
  const unit = normalizeUnit(value);
  return unit === '米' || unit === 'm' || unit === 'meter' || unit === 'meters';
};
const isKilogramUnit = (value?: string) => {
  const unit = normalizeUnit(value);
  return unit === 'kg' || unit === '公斤' || unit === '千克' || unit === 'kilogram' || unit === 'kilograms';
};

export function useMaterialInventoryColumns({
  user,
  openInstructionFromRecord,
  handleInbound,
  rollForm,
  rollModal,
  handleOutbound,
  handlePrintOutbound,
  handleViewDetail,
  handleEditSafetyStock,
}: UseMaterialInventoryColumnsProps): ColumnsType<MaterialInventory> {
  return [
    {
      title: '图片',
      key: 'image',
      width: 72,
      fixed: 'left',
      align: 'center',
      render: (_, record) => (
        <div style={{ width: 48, minHeight: 28, borderRadius: 4, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {record.materialImage ? (
            <Image
              src={getFullAuthedFileUrl(record.materialImage)}
              alt="物料"
              width={48}
              style={{ height: 'auto', display: 'block' }}
              preview={false}
            />
          ) : (
            <span style={{ color: '#ccc', fontSize: 12, height: 48, display: 'flex', alignItems: 'center' }}>无图</span>
          )}
        </div>
      ),
    },
    {
      title: '物料信息',
      key: 'materialInfo',
      width: 280,
      fixed: 'left',
      render: (_, record) => (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>编号：</span>
            <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.materialCode || '-'}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>名称：</span>
            <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.materialName || '-'}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px', alignItems: 'center' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>分类：</span>
            <span style={{ margin: '0 0 0 8px' }}>
              <MaterialTypeTag value={record.materialType} />
            </span>
          </div>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>颜色：</span>
            <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.color || '-'}</span>
          </div>
        </Space>
      ),
    },
    {
      title: '面料属性',
      key: 'fabricProperties',
      width: 200,
      render: (_, record) => {
        if (getMaterialTypeCategory(record.materialType) !== 'fabric') {
          return (
            <div style={{ textAlign: 'center', color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-xs)' }}>
              -
            </div>
          );
        }

        return (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>规格/幅宽：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }}>{formatMaterialSpecWidth(record.specification, record.fabricWidth)}</span>
            </div>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>克重：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.fabricWeight || '-'}</span>
            </div>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>成分：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }} title={record.fabricComposition || '-'}>
                {record.fabricComposition || '-'}
              </span>
            </div>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>单位：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.unit || '-'}</span>
            </div>
          </Space>
        );
      },
    },
    {
      title: '库存状态',
      key: 'stock',
      width: 300,
      render: (_, record) => {
        const availableQty = record.availableQty ?? 0;
        const inTransitQty = record.inTransitQty ?? 0;
        const lockedQty = record.lockedQty ?? 0;
        const safetyStock = record.safetyStock ?? 0;
        const conversionRate = Number(record.conversionRate ?? 0);
        const referenceKg = isKilogramUnit(record.unit)
          ? Number(availableQty.toFixed(2))
          : isMeterUnit(record.unit) && conversionRate > 0
            ? Number((availableQty / conversionRate).toFixed(2))
            : null;
        const isLow = availableQty < safetyStock;
        return (
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <div className="stock-grid">
              <div>
                <div className="stock-label">可用库存</div>
                <div className={`stock-value ${isLow ? 'stock-value--warn' : 'stock-value--ok'}`}>
                  {availableQty.toLocaleString()}
                  {isLow && <WarningOutlined style={{ marginLeft: 4, fontSize: "var(--font-size-base)" }} />}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
              <div>
                <div className="stock-label">在途</div>
                <div className="stock-value stock-value--info">
                  {inTransitQty.toLocaleString()}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
              <div>
                <div className="stock-label">锁定</div>
                <div className="stock-value stock-value--lock">
                  {lockedQty.toLocaleString()}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
            </div>
            <div style={{
              fontSize: "var(--font-size-sm)",
              color: 'var(--neutral-text-secondary)',
              paddingTop: 8,
              borderTop: '1px solid #f0f0f0',
              fontWeight: 500
            }}>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>安全库存:</span> {safetyStock} {record.unit}
              <span style={{ margin: '0 8px', color: 'var(--neutral-border)' }}>|</span>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>库位:</span> {record.warehouseLocation || '-'}
            </div>
            <div style={{
              fontSize: "var(--font-size-sm)",
              color: 'var(--neutral-text-secondary)',
              fontWeight: 500
            }}>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>参考公斤数:</span> {referenceKg == null ? '-' : `${referenceKg} kg`}
              <span style={{ margin: '0 8px', color: 'var(--neutral-border)' }}>|</span>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>换算:</span> {conversionRate > 0 ? `${conversionRate} 米/公斤` : '-'}
            </div>
            {isLow && (
              <div style={{
                marginTop: 6,
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: "var(--font-size-sm)",
                color: '#fa8c16',
              }}>
                 建议补货 <strong>{Math.max(0, safetyStock * 2 - availableQty - inTransitQty).toLocaleString()}</strong> {record.unit}
              </div>
            )}
          </Space>
        );
      },
    },
    {
      title: '金额信息',
      key: 'price',
      width: 180,
      render: (_, record) => (
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>单价</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--neutral-text)' }}>
              {canViewPrice(user) ? `¥${(record.unitPrice ?? 0).toFixed(2)}` : '***'}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>/{record.unit}</div>
          </div>
          <div style={{
            paddingTop: 8,
            borderTop: '1px solid #f0f0f0'
          }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>库存总值</div>
            <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: 'var(--primary-color)' }}>
              {canViewPrice(user) ? `¥${Number(record.totalValue ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '***'}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '供应商',
      key: 'supplier',
      width: 150,
      render: (_, record) => (
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
          <SupplierNameTooltip
            name={record.supplierName}
            contactPerson={(record as any).supplierContactPerson}
            contactPhone={(record as any).supplierContactPhone}
          />
        </div>
      ),
    },
    {
      title: '出入库记录',
      key: 'records',
      width: 200,
      render: (_, record) => (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ padding: '4px 8px', background: '#f0f9ff' }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--primary-color)', marginBottom: 2 }}> 最后入库</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>{record.lastInboundDate}</div>
            {record.lastInboundBy && (
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastInboundBy}</div>
            )}
          </div>
          <div style={{ padding: '4px 8px', background: 'rgba(250, 140, 22, 0.1)' }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--warning-color-dark)', marginBottom: 2 }}> 最后出库</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>{record.lastOutboundDate}</div>
            {record.lastOutboundBy && (
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastOutboundBy}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: '备注',
      key: 'remark',
      width: 200,
      render: (_, record) => (
        <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', lineHeight: 1.5 }}>
          {record.remark || '-'}
        </div>
      ),
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'instruction',
              label: '采购指令',
              onClick: () => openInstructionFromRecord(record)
            },
            {
              key: 'inbound',
              label: '入库',
              primary: true,
              onClick: () => handleInbound(record)
            },
            {
              key: 'rollLabel',
              label: '料卷标签',
              onClick: () => {
                rollForm.setFieldsValue({ rollCount: 1, quantityPerRoll: undefined, unit: '件' });
                rollModal.open({ inboundId: '', materialCode: record.materialCode, materialName: record.materialName });
              }
            },
            {
              key: 'outbound',
              label: '出库',
              onClick: () => handleOutbound(record)
            },
            {
              key: 'print',
              label: '打印出库单',
              onClick: () => handlePrintOutbound(record)
            },
            {
              key: 'detail',
              label: '详情',
              onClick: () => handleViewDetail(record)
            },
            {
              key: 'safetyStock',
              label: '安全库存',
              onClick: () => handleEditSafetyStock(record)
            }
          ]}
        />
      ),
    },
  ];
}
