import React from 'react';
import { Tag, Space } from 'antd';
import type { ProductionOrder } from '@/types/production';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import { ORDER_BIZ_TYPE_MAP } from '@/constants/statusMaps';
import { safeString } from '../../utils';
import { displayAmount } from '@/utils/display';
import { renderMerchandiserCell } from '../riskBadgeRenderers';
import type { UseProductionColumnsProps } from './types';

export function buildFactoryColumns({
  onOpenRemark,
}: UseProductionColumnsProps): any[] {
  return [
    {
      title: '生产方',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 90,
      render: (v: any, record: any) => {
        const bizType = record.orderBizType as string | undefined;
        const factoryType = record.factoryType as string | undefined;
        const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
        return (
          <Space size={4} style={{ flexWrap: 'nowrap' }}>
            <FactoryTypeTag factoryType={factoryType} />
            <SupplierNameTooltip
              name={v}
              contactPerson={record.factoryContactPerson}
              contactPhone={record.factoryContactPhone}
              label="工厂"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onOpenRemark?.(record, '生产方 — ' + (v || '')); }}
            />
            {bizType && (
              <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{ORDER_BIZ_TYPE_MAP[bizType]?.text ?? '未知'}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 70,
      render: (v: any, record: ProductionOrder) => renderMerchandiserCell(v, record, onOpenRemark),
    },
    {
      title: '纸样师',
      dataIndex: 'patternMaker',
      key: 'patternMaker',
      width: 60,
      render: (v: any, record: ProductionOrder) => (
        <span
          style={{ cursor: v ? 'pointer' : 'default' }}
          onClick={() => v && onOpenRemark?.(record, '纸样师 — ' + v)}
        >{v || '-'}</span>
      ),
    },
    {
      title: '订单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '单价',
      key: 'factoryUnitPrice',
      width: 70,
      align: 'right' as const,
      render: (_: any, record: any) => {
        const v = Number(record?.factoryUnitPrice);
        return (Number.isFinite(v) && v > 0)
          ? <span style={{ fontWeight: 500 }}>{displayAmount(v)}</span>
          : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
      },
    },
    {
      title: '下单人',
      dataIndex: 'orderOperatorName',
      key: 'orderOperatorName',
      width: 60,
      render: (v: any, record: ProductionOrder) => {
        const text = safeString(v);
        return (
          <span
            style={{ cursor: text ? 'pointer' : 'default' }}
            onClick={() => text && onOpenRemark?.(record, '下单人 — ' + text)}
          >{text || '-'}</span>
        );
      },
    },
  ];
}
