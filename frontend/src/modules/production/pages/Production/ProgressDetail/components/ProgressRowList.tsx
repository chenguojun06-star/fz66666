import React from 'react';
import { Empty, Spin } from 'antd';
import StandardPagination from '@/components/common/StandardPagination';
import { ProductionOrder } from '@/types/production';
import { getProgressColorStatus } from '@/utils/progressColor';
import { isOrderFrozenByStatus } from '@/utils/api';

/** 与卡片视图 getStatus 完全一致的 variant 计算 */
function getRowVariant(record: ProductionOrder): 'normal' | 'warning' | 'danger' | 'scrapped' {
  const s = String(record.status || '').trim().toLowerCase();
  if (s === 'completed' || s === 'closed') return 'normal';
  if (isOrderFrozenByStatus(record)) return 'scrapped';
  return getProgressColorStatus(record.plannedEndDate, record.status);
}

interface ProgressRowListProps {
  dataSource: ProductionOrder[];
  columns: any[];
  loading?: boolean;
  focusedOrderId?: string;
  getRowDomKey?: (record: ProductionOrder) => string;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    pageSizeOptions: string[];
    onChange: (page: number, pageSize: number) => void;
  };
}

/**
 * 工序跟进 — 行卡片列表（样衣开发风格，替代 ResizableTable）
 */
const ProgressRowList: React.FC<ProgressRowListProps> = ({
  dataSource,
  columns,
  loading,
  focusedOrderId,
  getRowDomKey,
  pagination,
}) => {
  const orderSummaryCol = columns.find((c: any) => c.key === 'orderSummary');
  const progressNodesCol = columns.find((c: any) => c.key === 'progressNodes');

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!dataSource.length) {
    return <Empty description="暂无订单数据" style={{ padding: '60px 0' }} />;
  }

  return (
    <div className="progress-row-list">
      {dataSource.map((record) => {
        const rowKey = String(record.id || record.orderNo);
        const variant = getRowVariant(record);
        const isFocused = focusedOrderId && getRowDomKey ? getRowDomKey(record) === focusedOrderId : false;
        const cls = `progress-row progress-row--${variant}${isFocused ? ' progress-row--focus' : ''}`;
        return (
          <div key={rowKey} className={cls}>
            <div className="progress-row__cover">
              {orderSummaryCol?.render?.(null, record, 0)}
            </div>
            <div className="progress-row__body">
              {progressNodesCol?.render?.(null, record, 0)}
            </div>
          </div>
        );
      })}

      <StandardPagination
        current={pagination.current}
        pageSize={pagination.pageSize}
        total={pagination.total}
        showQuickJumper={false}
        wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
        onChange={pagination.onChange}
      />
    </div>
  );
};

export default ProgressRowList;
