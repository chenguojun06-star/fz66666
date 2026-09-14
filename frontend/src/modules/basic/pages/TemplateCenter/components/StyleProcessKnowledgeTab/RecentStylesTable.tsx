import React from 'react';
import { Tooltip } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { ProcessKnowledgeStyleRecord } from '@/services/intelligence/intelligenceApi';
import { formatMoney } from '@/utils/format';

const RecentStylesTable: React.FC<{ records: ProcessKnowledgeStyleRecord[] }> = ({ records }) => {
  const cols: ColumnsType<ProcessKnowledgeStyleRecord> = [
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    {
      title: '单价（元）',
      dataIndex: 'price',
      width: 120,
      render: (v, r) => {
        if (v == null) return '-';
        if (r.abnormal) {
          return (
            <Tooltip title={r.abnormalType === 'HIGH' ? '价格偏高（偏离均价30%以上）' : '价格偏低（偏离均价30%以上）'}>
              <span style={{ color: r.abnormalType === 'HIGH' ? 'var(--color-error)' : 'var(--color-warning)', fontWeight: 600 }}>
                <WarningOutlined style={{ marginRight: 4 }} />
                {formatMoney(v)}
              </span>
            </Tooltip>
          );
        }
        return formatMoney(v);
      },
    },
    { title: '扫码时间', dataIndex: 'createTime', width: 140, render: (v) => v || '-' },
  ];
  return (
    <ResizableTable
      columns={cols}
      dataSource={records}
      rowKey={(r) => r.styleNo + r.createTime}
      pagination={false}
      emptyDescription="暂无工序数据"
      style={{ margin: '0 24px' }}
    />
  );
};

export default RecentStylesTable;
