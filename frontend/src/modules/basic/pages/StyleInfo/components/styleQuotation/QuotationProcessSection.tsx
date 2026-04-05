import React from 'react';
import { Card } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { StyleProcess } from '@/types/style';
import { toNumberSafe } from '@/utils/api';

interface Props {
  processList: StyleProcess[];
}

const QuotationProcessSection: React.FC<Props> = ({ processList }) => {
  const processTotal = processList.reduce((s, i) => s + (Number((i as any).price) || 0), 0);

  const processColumns: ColumnsType<StyleProcess> = [
    {
      title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 70, align: 'center',
      render: (v: unknown) => toNumberSafe(v) || '-',
    },
    {
      title: '工序名称', dataIndex: 'processName', key: 'processName', width: 140,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '工序描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '单价', dataIndex: 'price', key: 'price', width: 100, align: 'right',
      render: (v: unknown) => (
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
          ¥{toNumberSafe(v).toFixed(2)}
        </span>
      ),
    },
  ];

  return (
    <Card
      title={
        <span style={{ fontSize: '15px', fontWeight: 600 }}>
          工序明细
          <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginLeft: 8 }}>
            共 {processList.length} 项
          </span>
        </span>
      }
      extra={
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-success)' }}>
          工序小计：¥{processTotal.toFixed(2)}
        </span>
      }
      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '8px' } }}
    >
      <ResizableTable
        storageKey="style-quotation-process"
        size="middle"
        columns={processColumns}
        dataSource={processList}
        rowKey={(r) => String((r as any)?.id || Math.random())}
        pagination={false}
        scroll={{ x: 700 }}
        summary={() => (
          <ResizableTable.Summary fixed>
            <ResizableTable.Summary.Row>
              <ResizableTable.Summary.Cell index={0} colSpan={3} align="right">
                <strong>工序小计：</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={3} align="right">
                <strong style={{ color: 'var(--color-success)', fontSize: '15px' }}>
                  ¥{processTotal.toFixed(2)}
                </strong>
              </ResizableTable.Summary.Cell>
            </ResizableTable.Summary.Row>
          </ResizableTable.Summary>
        )}
      />
    </Card>
  );
};

export default QuotationProcessSection;
