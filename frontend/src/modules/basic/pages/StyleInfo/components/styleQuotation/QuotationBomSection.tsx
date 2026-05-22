import React from 'react';
import type { StyleBom } from '@/types/style';
import { toNumberSafe } from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';
import ResizableTable from '@/components/common/ResizableTable';

export interface BomColorCosts {
  costByColor: Record<string, number>;
  avgCost: number;
  maxCost: number;
  colors: string[];
}

interface Props {
  bomList: StyleBom[];
  bomColorCosts: BomColorCosts;
  materialCost: number;
}

function calcRowTotal(record: any): number {
  const rawTotal = record.totalPrice;
  if (rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '') {
    const n = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
    if (Number.isFinite(n)) return n;
  }
  const usage = toNumberSafe(record.usageAmount);
  const loss = toNumberSafe(record.lossRate);
  const price = toNumberSafe(record.unitPrice);
  return usage * (1 + loss / 100) * price;
}

const QuotationBomSection: React.FC<Props> = ({ bomList, bomColorCosts, materialCost }) => {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        padding: '8px 0 6px',
        borderBottom: '1px solid var(--color-border-light, #f0f0f0)',
        marginBottom: 12,
        color: 'var(--color-text-primary, #1a1a1a)',
      }}>
        物料明细（BOM）
        <span style={{ fontSize: 12, color: '#666', marginLeft: 8, fontWeight: 400 }}>
          共 {bomList.length} 项
        </span>
      </div>

      {bomColorCosts.colors.length > 1 && (
        <div style={{
          display: 'flex', gap: 16, padding: '6px 10px', fontSize: 13, lineHeight: '20px',
          background: '#fafafa', border: '1px solid #e8e8e8', borderBottom: 'none',
        }}>
          <span style={{ color: '#666' }}>各颜色物料成本（单件）：</span>
          {bomColorCosts.colors.map(color => (
            <span key={color}>
              {color}：<strong>¥{(bomColorCosts.costByColor[color] || 0).toFixed(2)}</strong>
            </span>
          ))}
        </div>
      )}

      <ResizableTable
        rowKey={(record: any) => record.id || String(Math.random())}
        pagination={false}
        size="small"
        dataSource={bomList}
        columns={[
          { title: '物料类型', dataIndex: 'materialType', width: 70, render: (v: string) => getMaterialTypeLabel(v) || '-' },
          { title: '物料编码', dataIndex: 'materialCode', width: 100, render: (v: string) => String(v || '').trim() || '-' },
          { title: '物料名称', dataIndex: 'materialName', width: 110, render: (v: string) => String(v || '').trim() || '-' },
          { title: '规格/幅宽', dataIndex: 'specification', width: 90, render: (v: string) => String(v || '').trim() || '-' },
          { title: '单位', dataIndex: 'unit', width: 50, render: (v: string) => String(v || '').trim() || '-' },
          { title: '用量', dataIndex: 'usageAmount', width: 70, align: 'right' as const, render: (_: any, r: any) => toNumberSafe(r.usageAmount).toFixed(2) },
          { title: '开发采购用量', dataIndex: 'devUsageAmount', width: 100, align: 'right' as const, render: (_: any, r: any) => toNumberSafe(r.devUsageAmount) > 0 ? toNumberSafe(r.devUsageAmount).toFixed(2) : '-' },
          { title: '损耗率%', dataIndex: 'lossRate', width: 80, align: 'right' as const, render: (_: any, r: any) => toNumberSafe(r.lossRate).toFixed(1) },
          { title: '单价', dataIndex: 'unitPrice', width: 80, align: 'right' as const, render: (_: any, r: any) => `¥${toNumberSafe(r.unitPrice).toFixed(2)}` },
          { title: '总价', dataIndex: 'totalPrice', width: 90, align: 'right' as const, render: (_: any, r: any) => <strong>¥{calcRowTotal(r).toFixed(2)}</strong> },
        ]}
      />

      <div style={{
        display: 'flex', justifyContent: 'flex-end', padding: '6px 10px',
        border: '1px solid var(--color-border, #e8e8e8)', borderTop: '1px solid var(--color-border, #e8e8e8)',
        background: '#fafafa', fontWeight: 600, fontSize: 14, color: '#1a1a1a',
      }}>
        物料成本：¥{materialCost.toFixed(2)}
      </div>
    </div>
  );
};

export default QuotationBomSection;