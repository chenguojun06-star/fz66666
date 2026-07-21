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
        { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100,
          render: (v: unknown) => getMaterialTypeLabel(v) },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 150 },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
        { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const },
        ...(showPrice ? [{ title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, align: 'right' as const,
          render: (v: number) => v ? formatMoney(Number(v)) : '-' }] : []),
        { title: '备注', dataIndex: 'remark', key: 'remark' },
        { title: '图片', dataIndex: 'imageUrls', key: 'image', width: 90,
          render: (v: string) => {
            const imgs: string[] = (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
            if (!imgs.length) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {imgs.map((url: string) => (
                  <Image key={url} src={getFullAuthedFileUrl(url)} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 3, border: '1px solid #eee' }} preview={{ cover: <span>预览</span> }} />
                ))}
              </div>
            );
          }
        },
      ]}
    />
  );
};

export default BomTableSection;
