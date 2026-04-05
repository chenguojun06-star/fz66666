import React from 'react';
import { Card } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { StyleProcess } from '@/types/style';
import { toNumberSafe } from '@/utils/api';

interface Props {
  secondaryProcessList: any[];
  processList: StyleProcess[];
  processCost: number;
}

const QuotationSecondarySection: React.FC<Props> = ({
  secondaryProcessList,
  processList,
  processCost,
}) => {
  if (secondaryProcessList.length === 0) return null;

  const secondaryTotal = secondaryProcessList.reduce(
    (s, i) => s + (Number(i.unitPrice) || 0),
    0,
  );
  const processSubtotal = processList.reduce(
    (s, i) => s + (Number((i as any).price) || 0),
    0,
  );

  const columns: ColumnsType<any> = [
    {
      title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 70, align: 'center',
      render: (v: unknown, _: any, index: number) => toNumberSafe(v) || index + 1,
    },
    {
      title: '工艺名称', dataIndex: 'processName', key: 'processName', width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '工艺描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '领取人', dataIndex: 'assignee', key: 'assignee', width: 100,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '完成时间', dataIndex: 'completedTime', key: 'completedTime', width: 160,
      render: (v: unknown) => (v ? String(v) : '-'),
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right',
      render: (v: unknown) => (
        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
          ¥{toNumberSafe(v).toFixed(2)}
        </span>
      ),
    },
  ];

  // processCost prop 透传，用于卡片 extra 展示；实际求和用 processSubtotal+secondaryTotal
  void processCost;

  return (
    <Card
      title={
        <span style={{ fontSize: '15px', fontWeight: 600 }}>
          二次工艺
          <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginLeft: 8 }}>
            共 {secondaryProcessList.length} 项
          </span>
        </span>
      }
      extra={
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-warning)' }}>
          小计：¥{secondaryTotal.toFixed(2)}
        </span>
      }
      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '8px' } }}
    >
      <ResizableTable
        storageKey="style-quotation-secondary"
        size="middle"
        columns={columns}
        dataSource={secondaryProcessList}
        rowKey={(r) => String(r?.id || Math.random())}
        pagination={false}
        scroll={{ x: 960 }}
        summary={() => (
          <ResizableTable.Summary fixed>
            <ResizableTable.Summary.Row>
              <ResizableTable.Summary.Cell index={0} colSpan={5} align="right">
                <strong>二次工艺小计：</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={5} align="right">
                <strong style={{ color: 'var(--color-warning)', fontSize: '15px' }}>
                  ¥{secondaryTotal.toFixed(2)}
                </strong>
              </ResizableTable.Summary.Cell>
            </ResizableTable.Summary.Row>
            <ResizableTable.Summary.Row>
              <ResizableTable.Summary.Cell index={0} colSpan={5} align="right">
                <strong>工序总费用（含二次工艺）：</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={5} align="right">
                <strong style={{ color: 'var(--color-success)', fontSize: '15px' }}>
                  ¥{(processSubtotal + secondaryTotal).toFixed(2)}
                </strong>
              </ResizableTable.Summary.Cell>
            </ResizableTable.Summary.Row>
          </ResizableTable.Summary>
        )}
      />
    </Card>
  );
};

export default QuotationSecondarySection;
