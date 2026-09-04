/**
 * BOM 物料表区块
 * 提取自 index.tsx
 *
 * D-29x：原用 ResizableTable 且每列固定 width，总列宽超过打印/预览容器宽度，
 * 无横向滚动导致右侧列（供应商、备注等）被直接裁剪不显示。
 * 改用原生 antd Table + tableLayout="fixed"：各列均分容器宽度、单元格允许换行，
 * 保证物料清单全部列平铺可见，不受容器宽窄影响。
 */
import React from 'react';
import { Table, Image } from 'antd';
import { formatMoney } from '@/utils/format';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface BomTableSectionProps {
  bom: any[];
  showPrice: boolean;
}

const BomTableSection: React.FC<BomTableSectionProps> = ({ bom, showPrice }) => {
  if (!bom || bom.length === 0) return null;

  const columns: any[] = [
    { title: '图片', dataIndex: 'imageUrls', key: 'image', width: 60,
      render: (v: string) => {
        const imgs: string[] = (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
        if (!imgs.length) return null;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {imgs.map((url: string) => (
              <Image key={url} src={getFullAuthedFileUrl(url)} style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 3, border: '1px solid var(--color-border-light)' }} preview={false} />
            ))}
          </div>
        );
      },
    },
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType',
      render: (v: unknown) => getMaterialTypeLabel(v) },
    { title: '部位', dataIndex: 'partName', key: 'partName', render: (v: unknown) => (v ? String(v) : '-') },
    { title: '子部位', dataIndex: 'subPartName', key: 'subPartName', render: (v: unknown) => (v ? String(v) : '-') },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName' },
    { title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition',
      render: (v: unknown) => (v ? String(v) : '-') },
    { title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', render: (v: unknown) => (v ? String(v) : '-') },
    { title: '颜色', dataIndex: 'color', key: 'color', render: (v: unknown) => (v ? String(v) : '-') },
    { title: '规格/幅宽', dataIndex: 'specification', key: 'specification', render: (v: unknown) => (v ? String(v) : '-') },
    { title: '开发采购用量', dataIndex: 'devUsageAmount', key: 'devUsageAmount', align: 'right' as const,
      render: (v: unknown) => (Number(v) > 0 ? Number(v).toFixed(2) : '-') },
    { title: '单件用量', dataIndex: 'usageAmount', key: 'usageAmount', align: 'right' as const,
      render: (v: unknown) => (Number(v) > 0 ? Number(v).toFixed(2) : '-') },
    ...(showPrice ? [
      { title: '损耗率%', dataIndex: 'lossRate', key: 'lossRate', align: 'right' as const,
        render: (v: unknown) => `${(Number(v) || 0).toFixed(1)}%` },
      { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', align: 'right' as const,
        render: (v: number) => (Number(v) ? formatMoney(Number(v)) : '-') },
      { title: '小计', dataIndex: 'totalPrice', key: 'totalPrice', align: 'right' as const,
        render: (v: unknown, record: any) => {
          const usage = Number(record.usageAmount) || 0;
          const loss = Number(record.lossRate) || 0;
          const price = Number(record.unitPrice) || 0;
          const fallback = usage * (1 + loss / 100) * price;
          const raw = record.totalPrice;
          const n = raw !== undefined && raw !== null && String(raw).trim() !== '' ? Number(raw) : fallback;
          return formatMoney(Number.isFinite(n) ? n : fallback);
        } },
      { title: '单位', dataIndex: 'unit', key: 'unit', render: (v: unknown) => (v ? String(v) : '-') },
      { title: '供应商', dataIndex: 'supplier', key: 'supplier', render: (v: unknown) => (v ? String(v) : '-') },
    ] : []),
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: unknown) => String(v ?? '').trim() ? String(v) : '-' },
  ];

  return (
    <Table
      className="print-bom-table"
      dataSource={bom}
      rowKey="id"
      pagination={false}
      bordered
      size="small"
      tableLayout="fixed"
      columns={columns}
    />
  );
};

export default BomTableSection;