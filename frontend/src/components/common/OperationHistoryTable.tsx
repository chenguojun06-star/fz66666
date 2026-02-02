import React from 'react';
import type { OperationHistoryRow } from '@/utils/operationHistory';

export type { OperationHistoryRow };

interface OperationHistoryTableProps {
  rows: OperationHistoryRow[];
  emptyText?: string;
  renderOperator?: (row: OperationHistoryRow) => React.ReactNode;
}

const OperationHistoryTable: React.FC<OperationHistoryTableProps> = ({
  rows,
  emptyText = '暂无记录',
  renderOperator,
}) => {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#374151', fontWeight: 600, width: '70px' }}>类型</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#374151', fontWeight: 600, width: '90px' }}>父节点</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#374151', fontWeight: 600 }}>子工序</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#374151', fontWeight: 600, width: '120px' }}>操作人</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px', color: '#374151', fontWeight: 600, width: '90px' }}>数量</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#374151', fontWeight: 600, width: '140px' }}>时间</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#374151', fontWeight: 600 }}>备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={`${row.type}_${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#374151' }}>{row.type}</td>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#374151' }}>{row.stageName}</td>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#374151' }}>{row.processName || '-'}</td>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#374151' }}>
                  {renderOperator ? renderOperator(row) : (row.operatorName || '-')}
                </td>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#374151', textAlign: 'right' }}>{row.quantity}</td>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#6b7280' }}>{row.time}</td>
                <td style={{ padding: '6px 12px', fontSize: '12px', color: '#6b7280' }}>{row.remark || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default OperationHistoryTable;
