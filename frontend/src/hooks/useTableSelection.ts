import { useState, Key } from 'react';

/**
 * 表格选择配置
 */
export interface TableSelectionConfig<T = any> {
  selectedRowKeys: Key[];
  selectedRows: T[];
  onChange: (selectedRowKeys: Key[], selectedRows: T[]) => void;
  onClear: () => void;
}

/**
 * 通用表格选择管理 Hook
 *
 * @template T - 行数据类型
 *
 * @example
 * const { selectedRowKeys, selectedRows, rowSelection, clearSelection } = useTableSelection<ProductionOrder>();
 *
 * <ResizableTable
 *   rowSelection={rowSelection}
 *   dataSource={list}
 * />
 *
 * <Button onClick={() => handleBatchDelete(selectedRows)}>
 *   批量删除({selectedRowKeys.length})
 * </Button>
 */
export const useTableSelection = <T = any>() => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<T[]>([]);

  /**
   * 选择变化时的回调
   */
  const onChange = (keys: Key[], rows: T[]) => {
    setSelectedRowKeys(keys);
    setSelectedRows(rows);
  };

  /**
   * 清空选择
   */
  const clearSelection = () => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
  };

  /**
   * 设置选中项
   */
  const setSelection = (keys: Key[], rows: T[]) => {
    setSelectedRowKeys(keys);
    setSelectedRows(rows);
  };

  /**
   * Ant Design Table 的 rowSelection 配置对象
   */
  const rowSelection = {
    selectedRowKeys,
    onChange,
  };

  return {
    selectedRowKeys,    // 选中的key数组
    selectedRows,       // 选中的行数据数组
    rowSelection,       // Table组件的rowSelection配置
    clearSelection,     // 清空选择
    setSelection,       // 设置选中项
  };
};
