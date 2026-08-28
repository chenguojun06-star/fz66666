/**
 * BOM 物料表区块
 * 提取自 index.tsx
 */
import React from 'react';
import { Image } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface BomTableSectionProps {
  bom: any[];
  showPrice: boolean;
}

const BomTableSection: React.FC<BomTableSectionProps> = ({ bom, showPrice }) => {
  if (!bom || bom.length === 0) return null;
  return (
    <ResizableTable
      storageKey="print-bom"
      className="print-table"
      dataSource={bom}
      rowKey="id"
      showIndex={false}
      pagination={false}
      bordered
      columns={[
        { title: '图片', dataIndex: 'imageUrls', key: 'image', width: 70,
          render: (v: string) => {
            const imgs: string[] = (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
            if (!imgs.length) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {imgs.map((url: string) => (
                  <Image key={url} src={getFullAuthedFileUrl(url)} style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 3, border: '1px solid var(--color-border-light)' }} preview={{ cover: <span>预览</span> }} />
                ))}
              </div>
            );
          }
        },
        { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 80,
          render: (v: unknown) => getMaterialTypeLabel(v) },
        { title: '部位', dataIndex: 'partName', key: 'partName', width: 70, render: (v: unknown) => (v ? String(v) : '-') },
        { title: '子部位', dataIndex: 'subPartName', key: 'subPartName', width: 70, render: (v: unknown) => (v ? String(v) : '-') },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 110 },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 120 },
        { title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 110,
          render: (v: unknown) => (v ? String(v) : '-') },
        { title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 55, render: (v: unknown) => (v ? String(v) : '-') },
        { title: '颜色', dataIndex: 'color', key: 'color', width: 65, render: (v: unknown) => (v ? String(v) : '-') },
        { title: '规格/幅宽', dataIndex: 'specification', key: 'specification', width: 70, render: (v: unknown) => (v ? String(v) : '-') },
        { title: '开发采购用量', dataIndex: 'devUsageAmount', key: 'devUsageAmount', width: 80, align: 'right' as const,
          render: (v: unknown) => (Number(v) > 0 ? Number(v).toFixed(2) : '-') },
        { title: '单件用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 70, align: 'right' as const,
          render: (v: unknown) => (Number(v) > 0 ? Number(v).toFixed(2) : '-') },
        ...(showPrice ? [
          { title: '损耗率%', dataIndex: 'lossRate', key: 'lossRate', width: 60, align: 'right' as const,
            render: (v: unknown) => `${(Number(v) || 0).toFixed(1)}%` },
          { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 70, align: 'right' as const,
            render: (v: number) => (Number(v) ? formatMoney(Number(v)) : '-') },
          { title: '小计', dataIndex: 'totalPrice', key: 'totalPrice', width: 80, align: 'right' as const,
            render: (v: unknown, record: any) => {
              const usage = Number(record.usageAmount) || 0;
              const loss = Number(record.lossRate) || 0;
              const price = Number(record.unitPrice) || 0;
              const fallback = usage * (1 + loss / 100) * price;
              const raw = record.totalPrice;
              const n = raw !== undefined && raw !== null && String(raw).trim() !== '' ? Number(raw) : fallback;
              return formatMoney(Number.isFinite(n) ? n : fallback);
            } },
          { title: '单位', dataIndex: 'unit', key: 'unit', width: 45, render: (v: unknown) => (v ? String(v) : '-') },
          { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 80, render: (v: unknown) => (v ? String(v) : '-') },
        ] : []),
        { title: '备注', dataIndex: 'remark', key: 'remark', width: 120,
          render: (v: unknown) => {
            const lines = String(v ?? '').split('\n').filter(Boolean);
            const human = lines.filter((line) => !/^\[\d{4}-\d{2}-\d{2} /.test(line.trim()));
            return human.length ? human.join('\n') : '-';
          } },
      ]}
    />
  );
};

export default BomTableSection;
