import React, { memo, useCallback } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

/**
 * 优化的表格组件
 * 使用React.memo避免不必要的重渲染
 * 
 * @example
 * <OptimizedTable
 *   dataSource={data}
 *   columns={columns}
 *   rowKey="id"
 *   onRowClick={handleRowClick}
 * />
 */
interface OptimizedTableProps<T> extends TableProps<T> {
  onRowClick?: (record: T, index: number) => void;
}

function OptimizedTableComponent<T extends Record<string, any>>({
  onRowClick,
  onRow,
  ...props
}: OptimizedTableProps<T>) {
  // 合并onRow事件
  const handleOnRow = useCallback((record: T, index: number) => {
    const baseOnRow = onRow?.(record, index) || {};
    
    return {
      ...baseOnRow,
      onClick: (e: React.MouseEvent) => {
        baseOnRow.onClick?.(e);
        onRowClick?.(record, index);
      }
    };
  }, [onRow, onRowClick]);

  return (
    <Table<T>
      {...props}
      onRow={handleOnRow}
      pagination={{
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
        ...props.pagination
      }}
    />
  );
}

// 使用React.memo进行浅比较，避免不必要的重渲染
export const OptimizedTable = memo(OptimizedTableComponent) as <T extends Record<string, any>>(
  props: OptimizedTableProps<T>
) => React.ReactElement;

/**
 * 虚拟表格组件
 * 用于大数据量表格的渲染优化
 * 
 * @example
 * <VirtualTable
 *   dataSource={largeData}
 *   columns={columns}
 *   scroll={{ y: 400 }}
 *   rowHeight={50}
 * />
 */
interface VirtualTableProps<T> extends Omit<TableProps<T>, 'scroll'> {
  rowHeight: number;
  scroll: { y: number; x?: number };
}

export function VirtualTable<T extends Record<string, any>>({
  dataSource = [],
  rowHeight,
  scroll,
  ...props
}: VirtualTableProps<T>) {
  // 这里可以集成react-window或react-virtualized
  // 简化版本，实际使用时需要更复杂的实现
  
  return (
    <Table<T>
      {...props}
      dataSource={dataSource}
      scroll={scroll}
      pagination={false}
      virtual
      // Ant Design 4.0+ 支持virtual属性
    />
  );
}
