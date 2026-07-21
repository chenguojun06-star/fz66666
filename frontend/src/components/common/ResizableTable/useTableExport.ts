import React from 'react';
import { useState } from 'react';
import type { ColumnType } from 'antd/es/table';
import { message } from 'antd';
import { exportTableToExcel } from '@/utils/exportExcel';

interface UseTableExportParams<T> {
  columns: any;
  dataSource: readonly T[] | undefined;
  exportFilename: string;
}

export const useTableExport = <T extends object>({
  columns,
  dataSource,
  exportFilename,
}: UseTableExportParams<T>) => {
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const exportableColumns = React.useMemo(() => {
    if (!columns) return [];
    return (columns as any[]).filter(col => {
      const key = col.key || col.dataIndex;
      if (typeof key === 'string') {
        return key !== '__index__' && !key.toLowerCase().includes('action') && !key.toLowerCase().includes('操作');
      }
      return true;
    });
  }, [columns]);

  const handleExportClick = React.useCallback(() => {
    if (!dataSource || dataSource.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    // 默认导出所有列
    const allKeys = exportableColumns.map(col => String(col.key || col.dataIndex || ''));
    setSelectedExportColumns(allKeys);
    setExportModalVisible(true);
  }, [dataSource, exportableColumns]);

  const handleExportConfirm = React.useCallback(async () => {
    if (!dataSource || dataSource.length === 0 || !columns) {
      setExportModalVisible(false);
      return;
    }
    setExporting(true);
    try {
      await exportTableToExcel(
        [...dataSource] as T[],
        columns as ColumnType<T>[],
        exportFilename,
        selectedExportColumns
      );
      message.success('导出成功');
      setExportModalVisible(false);
    } catch (error) {
      message.error('导出失败，请重试');
      console.error('导出Excel失败:', error);
    } finally {
      setExporting(false);
    }
  }, [dataSource, columns, exportFilename, selectedExportColumns]);

  return {
    exportModalVisible,
    setExportModalVisible,
    selectedExportColumns,
    setSelectedExportColumns,
    exporting,
    exportableColumns,
    handleExportClick,
    handleExportConfirm,
  };
};

export default useTableExport;
