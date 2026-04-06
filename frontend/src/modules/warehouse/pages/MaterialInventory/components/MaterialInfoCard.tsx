import React from 'react';
import { Card, Tag, Descriptions } from 'antd';
import { formatMaterialSpecWidth, getBaseMaterialTypeLabel, getMaterialTypeCategory } from '@/utils/materialType';

/** 通用物料信息卡片 Props — 兼容 MaterialStockAlertItem 和 MaterialInventory */
export interface MaterialInfoCardProps {
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  color?: string;
  unit?: string;
  supplierName?: string;
  specification?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  unitPrice?: number | null;
}

/**
 * 通用物料信息展示卡片
 * 用于"下发采购指令"和"物料出库"弹窗中的物料基础信息展示。
 * 面料类型时自动展示面料属性（克重/成分/规格幅宽）。
 */
const MaterialInfoCard: React.FC<MaterialInfoCardProps> = (props) => {
  const {
    materialCode, materialName, materialType,
    color, unit, supplierName,
    specification, fabricWidth, fabricWeight, fabricComposition,
    unitPrice,
  } = props;

  const isFabric = getMaterialTypeCategory(materialType) === 'fabric';
  const typeCategory = getMaterialTypeCategory(materialType);
  const typeTagColor = typeCategory === 'fabric' ? 'blue' : typeCategory === 'lining' ? 'cyan' : 'green';

  return (
    <Card size="small" style={{ background: 'var(--color-bg-subtle)' }}>
      <Descriptions
        column={3}
        size="small"
        colon={false}
        labelStyle={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)', paddingBottom: 2 }}
        contentStyle={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', paddingBottom: 8 }}
      >
        <Descriptions.Item label="物料名称" span={3}>
          {materialName || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="物料编号">
          {materialCode || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="类型">
          {materialType
            ? <Tag color={typeTagColor} style={{ margin: 0 }}>{getBaseMaterialTypeLabel(materialType)}</Tag>
            : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="颜色">
          {color || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="供应商">
          {supplierName || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="单位">
          {unit || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="单价">
          {unitPrice != null ? `¥${unitPrice}` : '-'}
        </Descriptions.Item>
      </Descriptions>

      {isFabric && (
        <div style={{
          borderTop: '1px solid var(--neutral-border, #e8e8e8)',
          paddingTop: 8,
          marginTop: 4,
        }}>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            color: 'var(--primary-color)',
            marginBottom: 6,
          }}>
            🧵 面料属性
          </div>
          <Descriptions
            column={3}
            size="small"
            colon={false}
            labelStyle={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)', paddingBottom: 2 }}
            contentStyle={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--primary-color)', paddingBottom: 4 }}
          >
            <Descriptions.Item label="规格/幅宽">
              {formatMaterialSpecWidth(specification, fabricWidth)}
            </Descriptions.Item>
            <Descriptions.Item label="克重">
              {fabricWeight || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="成分">
              {fabricComposition || '-'}
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}
    </Card>
  );
};

export default MaterialInfoCard;
