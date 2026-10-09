import { Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMoney } from '@/utils/format';
import { formatMaterialQuantityWithUnit, formatReferenceKilograms, subtractMaterialQuantity } from '../utils';
import { RECONCILIATION_STATUS_MAP } from './MaterialTable.helpers';
import type { UseMaterialColumnsParams } from './materialColumnsTypes';

/**
 * 数量与价格列：采购数量/参考公斤数/到货数量/待到数量/单价/对账状态/结算金额
 */
export const buildQuantityPriceColumns = (_params: UseMaterialColumnsParams): ColumnsType<MaterialPurchaseType> => {
  return [
    {
      // D-513 正名：这是「计划采购量」，实际到货以「到货数量」为准。
      // 原先叫「采购数量」与「到货数量」并列，容易被理解成实际采购量，
      // 而物料对账曾误按此列取值（少算货款），故明确为「预采购数」。
      title: '预采购数',
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
      key: 'pendingArrivalQuantity',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const remaining = subtractMaterialQuantity(record?.purchaseQuantity, record?.arrivedQuantity);
        return formatMaterialQuantityWithUnit(remaining, record.unit);
      },
    },
    {
      title: '使用量',
      dataIndex: 'usedQuantity',
      key: 'usedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => formatMaterialQuantityWithUnit(v ?? 0, record.unit),
    },
    {
      /*
       * D-513 正名：原叫「库存余量」，但它算的是 `本单到货 − 本单已领料出库`，
       * 与右侧「库存/领取」列（物料库存台账的可用库存）是**两个维度**，
       * 并排放着会让人以为自相矛盾（本例：本单剩余 353 米 vs 台账 无库存）。
       * 正名为「剩余待领」并给出悬浮说明，消除歧义。
       */
      title: '剩余待领',
      key: 'stockRemainingQuantity',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const arrived = record?.arrivedQuantity ?? 0;
        const used = record?.usedQuantity ?? 0;
        const remaining = Math.max(0, arrived - used);
        return (
          <Tooltip
            title={`本单剩余待领 = 到货数量 ${arrived}${record.unit || ''} − 已领料出库 ${used}${record.unit || ''}。
与「仓库库存/领取」列不同：那列看的是物料库存台账的可用库存。`}
          >
            <span>{formatMaterialQuantityWithUnit(remaining, record.unit)}</span>
          </Tooltip>
        );
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
