import React from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import { OrderLineWarehousingRow } from '../../types';

interface Props {
  rows: OrderLineWarehousingRow[];
  loading: boolean;
}

const OrderLinesTable: React.FC<Props> = ({ rows, loading }) => (
  <div style={{ padding: '8px 0' }}>
    <ResizableTable<OrderLineWarehousingRow>
      storageKey="order-lines-warehousing-table"
      rowKey="key" loading={loading}
      pagination={false} dataSource={rows}
      resizableColumns={false}
      scroll={{ x: 820 }}
      style={{ fontSize: 12 }}
      columns={[
        { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150, ellipsis: true },
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
        { title: '颜色', dataIndex: 'color', key: 'color', width: 100 },
        { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
        { title: '下单数', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
        {
          title: '已入库', dataIndex: 'warehousedQuantity', key: 'wh', width: 90, align: 'right' as const,
          render: (v: number) => <span style={{ color: v > 0 ? 'var(--color-success)' : undefined }}>{v}</span>,
        },
        {
          title: '不合格数', dataIndex: 'unqualifiedQuantity', key: 'uq', width: 90, align: 'right' as const,
          render: (v: number) => v > 0 ? <span style={{ color: 'var(--color-danger)' }}>{v}</span> : <span>0</span>,
        },
        {
          title: '待处理', dataIndex: 'unwarehousedQuantity', key: 'unwh', width: 90, align: 'right' as const,
          render: (v: number) => <span style={{ color: v > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>{v}</span>,
        },
      ]}
      summary={(pageData) => {
        const totals = pageData.reduce(
          (acc, r) => ({
            quantity: acc.quantity + r.quantity,
            warehousedQuantity: acc.warehousedQuantity + r.warehousedQuantity,
            unqualifiedQuantity: acc.unqualifiedQuantity + (r.unqualifiedQuantity || 0),
            unwarehousedQuantity: acc.unwarehousedQuantity + r.unwarehousedQuantity,
          }),
          { quantity: 0, warehousedQuantity: 0, unqualifiedQuantity: 0, unwarehousedQuantity: 0 },
        );
        return (
          <ResizableTable.Summary>
            <ResizableTable.Summary.Row>
              <ResizableTable.Summary.Cell index={0}><strong>合计</strong></ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={1} />
              <ResizableTable.Summary.Cell index={2} />
              <ResizableTable.Summary.Cell index={3} />
              <ResizableTable.Summary.Cell index={4} align="right"><strong>{totals.quantity}</strong></ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={5} align="right">
                <strong style={{ color: 'var(--color-success)' }}>{totals.warehousedQuantity}</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={6} align="right">
                <strong style={{ color: totals.unqualifiedQuantity > 0 ? 'var(--color-danger)' : undefined }}>
                  {totals.unqualifiedQuantity}
                </strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={7} align="right">
                <strong style={{ color: totals.unwarehousedQuantity > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {totals.unwarehousedQuantity}
                </strong>
              </ResizableTable.Summary.Cell>
            </ResizableTable.Summary.Row>
          </ResizableTable.Summary>
        );
      }}
    />
  </div>
);

export default OrderLinesTable;
