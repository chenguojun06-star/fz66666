/**
 * 工序表区块
 * 提取自 index.tsx
 */
import React from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';

interface ProcessTableSectionProps {
  process: any[];
  showPrice: boolean;
}

const ProcessTableSection: React.FC<ProcessTableSectionProps> = ({ process, showPrice }) => {
  if (!process || process.length === 0) return null;
  return (
    <ResizableTable
      storageKey="print-process"
      className="print-table"
      dataSource={process}
      rowKey="id"
      showIndex={false}
      pagination={false}
      bordered
      columns={[
        { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
        { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 150 },
        { title: '工序编码', dataIndex: 'processCode', key: 'processCode', width: 100, render: (code: string) => {
          // 仅展示短编号（如 01/02），过滤英文 snake_case code
          const c = String(code || '').trim();
          if (!c) return '-';
          return /^[A-Za-z0-9]{1,4}$/.test(c) ? c : '-';
        } },
        { title: '工时(秒)', dataIndex: 'standardTime', key: 'standardTime', width: 80, align: 'right' as const },
        ...(showPrice ? [{ title: '单价', dataIndex: 'price', key: 'price', width: 80, align: 'right' as const,
          render: (v: number) => v ? formatMoney(Number(v)) : '-' }] : []),
        { title: '备注', dataIndex: 'remark', key: 'remark' },
      ]}
    />
  );
};

export default ProcessTableSection;
