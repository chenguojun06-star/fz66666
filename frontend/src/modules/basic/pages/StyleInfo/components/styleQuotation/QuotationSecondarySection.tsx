import React from 'react';
import { toNumberSafe } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';

interface Props {
  secondaryProcessList: any[];
}

const QuotationSecondarySection: React.FC<Props> = ({ secondaryProcessList }) => {
  if (secondaryProcessList.length === 0) return null;

  const secondaryTotal = secondaryProcessList.reduce(
    (s, i) => s + (Number(i.unitPrice) || 0),
    0,
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 15, fontWeight: 600, padding: '8px 0 6px',
        borderBottom: '1px solid var(--color-border-light, #f0f0f0)', marginBottom: 12, color: 'var(--color-text-primary, #1a1a1a)',
      }}>
        二次工艺
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8, fontWeight: 400 }}>
          共 {secondaryProcessList.length} 项
        </span>
      </div>

      <ResizableTable
        rowKey={(record: any) => record.id || String(Math.random())}
        pagination={false}
        size="small"
        dataSource={secondaryProcessList}
        columns={[
          { title: '序号', width: 60, align: 'center' as const, render: (_: any, __: any, idx: number) => toNumberSafe(secondaryProcessList[idx]?.sortOrder) || idx + 1 },
          { title: '工艺名称', dataIndex: 'processName', width: 130, render: (v: string) => String(v || '').trim() || '-' },
          { title: '工艺描述', dataIndex: 'description', width: 200, render: (v: string) => String(v || '').trim() || '-' },
          { title: '领取人', dataIndex: 'assignee', width: 90, render: (v: string) => String(v || '').trim() || '-' },
          { title: '完成时间', dataIndex: 'completedTime', width: 160, render: (v: any) => v ? String(v) : '-' },
          { title: '单价', dataIndex: 'unitPrice', width: 100, align: 'right' as const, render: (_: any, r: any) => <strong>¥{toNumberSafe(r.unitPrice).toFixed(2)}</strong> },
        ]}
      />

      <div style={{
        display: 'flex', justifyContent: 'flex-end', padding: '6px 10px',
        border: '1px solid var(--color-border, #e8e8e8)', borderTop: '1px solid var(--color-border, #e8e8e8)',
        background: 'var(--color-bg-container)', fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)',
      }}>
        小计：{formatMoney(secondaryTotal)}
      </div>
    </div>
  );
};

export default QuotationSecondarySection;