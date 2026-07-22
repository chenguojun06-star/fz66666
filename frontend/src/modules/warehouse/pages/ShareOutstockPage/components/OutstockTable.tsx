import React from 'react';
import { formatMoney } from '@/utils/format';
import { formatDateTime, paymentLabel } from '../utils';
import {
  tableWrapperStyle,
  tableStyle,
  thStyle,
  tdStyle,
  trEvenStyle,
} from '../styles';
import type { OutstockItem } from '../types';

interface OutstockTableProps {
  items: OutstockItem[];
}

const OutstockTable: React.FC<OutstockTableProps> = ({ items }) => (
  <div style={tableWrapperStyle}>
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>出库单号</th>
          <th style={thStyle}>订单号</th>
          <th style={thStyle}>款号</th>
          <th style={thStyle}>颜色/尺码</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>数量</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>单价</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>金额</th>
          <th style={thStyle}>物流</th>
          <th style={thStyle}>出库时间</th>
          <th style={thStyle}>收款状态</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const pay = paymentLabel(item.paymentStatus);
          return (
            <tr key={`${item.outstockNo}-${idx}`} style={idx % 2 === 0 ? trEvenStyle : undefined}>
              <td style={tdStyle}>{item.outstockNo || '—'}</td>
              <td style={tdStyle}>{item.orderNo || '—'}</td>
              <td style={tdStyle}>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.styleNo || '—'}</div>
                {item.styleName && <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{item.styleName}</div>}
              </td>
              <td style={tdStyle}>{item.color} / {item.size}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{item.outstockQuantity}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                {item.salesPrice != null ? formatMoney(item.salesPrice) : '—'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                {item.totalAmount != null ? formatMoney(item.totalAmount) : '—'}
              </td>
              <td style={tdStyle}>
                {item.expressCompany || item.trackingNo ? (
                  <div>
                    {item.expressCompany && <div style={{ fontSize: 14 }}>{item.expressCompany}</div>}
                    {item.trackingNo && <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{item.trackingNo}</div>}
                  </div>
                ) : '—'}
              </td>
              <td style={tdStyle}>{formatDateTime(item.outstockTime)}</td>
              <td style={tdStyle}>
                <span style={{ color: pay.color, fontWeight: 600, fontSize: 14 }}>● {pay.text}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default OutstockTable;
