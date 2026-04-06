import React from 'react';
import { Card, Row, Col } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { StyleBom } from '@/types/style';
import { toNumberSafe } from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';

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

const QuotationBomSection: React.FC<Props> = ({ bomList, bomColorCosts, materialCost }) => {
  const bomColumns: ColumnsType<StyleBom> = [
    {
      title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100,
      render: (v: unknown) => getMaterialTypeLabel(v as string) || '-',
    },
    {
      title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '规格/幅宽', dataIndex: 'specification', key: 'specification', width: 140, ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '单位', dataIndex: 'unit', key: 'unit', width: 70,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 90, align: 'right',
      render: (v: unknown) => <span>{toNumberSafe(v).toFixed(2)}</span>,
    },
    {
      title: '开发采购用量', dataIndex: 'devUsageAmount', key: 'devUsageAmount', width: 110, align: 'right',
      render: (v: unknown) => {
        const n = toNumberSafe(v);
        return n > 0 ? n.toFixed(2) : '-';
      },
    },
    {
      title: '损耗率%', dataIndex: 'lossRate', key: 'lossRate', width: 90, align: 'right',
      render: (v: unknown) => toNumberSafe(v).toFixed(1),
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right',
      render: (v: unknown) => `¥${toNumberSafe(v).toFixed(2)}`,
    },
    {
      title: '总价', dataIndex: 'totalPrice', key: 'totalPrice', width: 100, align: 'right',
      render: (_: unknown, record: StyleBom) => {
        const rawTotal = (record as any).totalPrice;
        const hasTotalPrice = rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '';
        let total: number;
        if (hasTotalPrice) {
          total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
          if (!Number.isFinite(total)) {
            const usage = toNumberSafe((record as any).usageAmount);
            const loss = toNumberSafe((record as any).lossRate);
            const price = toNumberSafe((record as any).unitPrice);
            total = usage * (1 + loss / 100) * price;
          }
        } else {
          const usage = toNumberSafe((record as any).usageAmount);
          const loss = toNumberSafe((record as any).lossRate);
          const price = toNumberSafe((record as any).unitPrice);
          total = usage * (1 + loss / 100) * price;
        }
        return (
          <span style={{ fontWeight: 600 }}>
            ¥{total.toFixed(2)}
          </span>
        );
      },
    },
  ];

  return (
    <Card
      title={
        <span style={{ fontSize: '15px', fontWeight: 600 }}>
          物料明细（BOM）
          <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginLeft: 8 }}>
            共 {bomList.length} 项
          </span>
        </span>
      }

      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '8px' } }}
    >
      {bomColorCosts.colors.length > 1 && (
        <div style={{ marginBottom: 8, padding: '8px 12px', background: 'var(--color-bg-subtle)', borderRadius: 6 }}>
          <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 4 }}>
            各颜色物料成本（单件）：
          </div>
          <Row gutter={16}>
            {bomColorCosts.colors.map((color) => (
              <Col key={color}>
                <span style={{ fontSize: '13px' }}>{color}：</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-color)' }}>
                  ¥{(bomColorCosts.costByColor[color] || 0).toFixed(2)}
                </span>
              </Col>
            ))}
            <Col>
              <span style={{ fontSize: '13px' }}>平均：</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-color)' }}>
                ¥{bomColorCosts.avgCost.toFixed(2)}
              </span>
            </Col>
          </Row>
        </div>
      )}
      <ResizableTable
        storageKey="style-quotation-bom"
        size="middle"
        columns={bomColumns}
        dataSource={bomList}
        rowKey={(r) => String((r as any)?.id || Math.random())}
        pagination={false}
        scroll={{ x: 1100 }}
      />
      <div style={{ textAlign: 'right', padding: '6px 12px', borderTop: '1px solid var(--color-border-secondary)', fontWeight: 600, fontSize: 14, color: 'var(--primary-color)' }}>
        物料成本：¥{materialCost.toFixed(2)}
        {bomColorCosts.colors.length > 1 && (
          <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginLeft: 6 }}>
            （{bomColorCosts.colors.length} 色平均）
          </span>
        )}
      </div>
    </Card>
  );
};

export default QuotationBomSection;
