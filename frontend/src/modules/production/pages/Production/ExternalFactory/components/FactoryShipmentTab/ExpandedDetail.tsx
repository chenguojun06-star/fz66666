import React from 'react';
import type { ExpandedDetailProps } from './types';

/**
 * 发货记录展开行明细：颜色 / 尺码 / 数量
 */
const ExpandedDetail: React.FC<ExpandedDetailProps> = ({ details, loading }) => {
  if (loading) {
    return <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>加载中...</span>;
  }
  if (details.length === 0) {
    return <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>无明细</span>;
  }
  return (
    <table style={{ fontSize: 14, borderCollapse: 'collapse' as const }}>
      <thead>
        <tr>
          <th style={{ padding: '2px 12px', borderBottom: '1px solid #eee' }}>颜色</th>
          <th style={{ padding: '2px 12px', borderBottom: '1px solid #eee' }}>尺码</th>
          <th style={{ padding: '2px 12px', borderBottom: '1px solid #eee' }}>数量</th>
        </tr>
      </thead>
      <tbody>
        {details.map(d => (
          <tr key={d.id}>
            <td style={{ padding: '2px 12px' }}>{d.color}</td>
            <td style={{ padding: '2px 12px' }}>{d.sizeName}</td>
            <td style={{ padding: '2px 12px' }}>{d.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default ExpandedDetail;
