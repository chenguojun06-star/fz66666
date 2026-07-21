import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMoney } from '@/utils/format';
import { formatMaterialQuantityWithUnit, formatReferenceKilograms, subtractMaterialQuantity } from '../utils';
import { RECONCILIATION_STATUS_MAP } from './MaterialTable.helpers';
import type { UseMaterialColumnsParams } from './useMaterialColumns';

/**
 * 数量与价格列：采购数量/参考公斤数/到货数量/待到数量/单价/对账状态/结算金额
 */
export const buildQuantityPriceColumns = (_params: UseMaterialColumnsParams): ColumnsType<MaterialPurchaseType> => {
  return [
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => formatMaterialQuantityWithUnit(v, record.unit),
    },
    {
      title: '参考公斤数',
      key: 'referenceKilograms',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, record: MaterialPurchaseType) =>
        formatReferenceKilograms(record.purchaseQuantity, record.conversionRate, record.unit),
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => formatMaterialQuantityWithUnit(v, record.unit),
    },
    {
      title: '待到数量',
      key: 'remainingQuantity',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const remaining = subtractMaterialQuantity(record?.purchaseQuantity, record?.arrivedQuantity);
        return formatMaterialQuantityWithUnit(remaining, record.unit);
      },
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v: number) => Number.isFinite(Number(v)) ? formatMoney(Number(v)) : '-',
    },
    {
      title: '对账状态',
      dataIndex: 'reconciliationStatus',
      key: 'reconciliationStatus',
      width: 100,
      render: (_: any, record: MaterialPurchaseType) => {
        const status = (record as any).reconciliationStatus;
        if (!status) return <span style={{ color: 'var(--color-text-tertiary)' }}>未对账</span>;
        const cfg = RECONCILIATION_STATUS_MAP[status];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : <span>未知</span>;
      },
    },
    {
      title: '结算金额',
      dataIndex: 'settlementAmount',
      key: 'settlementAmount',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const amount = (record as any).settlementAmount;
        return Number.isFinite(Number(amount)) ? formatMoney(Number(amount)) : '-';
      },
    },
  ];
};
