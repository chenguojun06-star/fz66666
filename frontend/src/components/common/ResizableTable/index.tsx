import React from 'react';
import { Table, ConfigProvider, Button } from 'antd';
import type { TableProps } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useResizableTableData } from './useResizableTableData';
import { useTableExport } from './useTableExport';
import ExportModal from './ExportModal';

type ResizableTableProps<T extends object> = TableProps<T> & {
  storageKey?: string;
  /** @deprecated 无操作，保留仅兼容旧调用 */
  resizableColumns?: boolean;
  /** @deprecated 无操作，保留仅兼容旧调用 */
  autoScrollY?: boolean;
  allowFixedColumns?: boolean;
  reorderableColumns?: boolean;
  stickyFooter?: boolean;
  stickyHeader?: boolean | { offsetHeader?: number };
  /** 是否显示序号列（默认 true） */
  showIndex?: boolean;
  /** 是否自动根据屏幕宽度切换表格 size（默认 true） */
  responsiveSize?: boolean;
  /** 空状态描述文本 */
  emptyDescription?: string;
  /** 空状态主操作按钮文本 */
  emptyActionText?: string;
  /** 空状态主操作按钮点击事件 */
  onEmptyAction?: () => void;
  /** 空状态副操作按钮文本 */
  emptySecondaryActionText?: string;
  /** 空状态副操作按钮点击事件 */
  onEmptySecondaryAction?: () => void;
  /** 是否显示导出按钮（默认 false） */
  showExport?: boolean;
  /** 导出文件名（默认 '导出数据.xlsx'） */
  exportFilename?: string;
};

const ResizableTable = <T extends object>(props: ResizableTableProps<T>) => {
  const {
    columns,
    components,
    scroll,
    tableLayout,
    pagination: paginationProp,
    storageKey: storageKeyProp,
    allowFixedColumns = true,
    reorderableColumns = true,
    stickyFooter: stickyFooterProp,
    stickyHeader: stickyHeaderProp,
    showIndex = true,
    responsiveSize = true,
    className,
    rowKey,
    size: sizeProp,
    emptyDescription,
    emptyActionText,
    onEmptyAction,
    emptySecondaryActionText,
    onEmptySecondaryAction,
    locale: localeProp,
    dataSource,
    showExport = false,
    exportFilename = '导出数据.xlsx',
    ...rest
  } = props;

  const {
    mergedLocale,
    shellRef,
    responsiveTableSize,
    mergedPagination,
    finalColumns,
    dndSensors,
    sortableColumnIds,
    handleDragEnd,
    getTablePopupContainer,
    mergedScroll,
    mergedComponents,
    wrapperClassName,
  } = useResizableTableData<T>({
    columns,
    components,
    scroll,
    tableLayout,
    pagination: paginationProp,
    storageKeyProp,
    allowFixedColumns,
    reorderableColumns,
    stickyFooterProp,
    stickyHeaderProp,
    showIndex,
    responsiveSize,
    className,
    sizeProp,
    rowKey,
    emptyDescription,
    emptyActionText,
    onEmptyAction,
    emptySecondaryActionText,
    onEmptySecondaryAction,
    localeProp,
  });

  const {
    exportModalVisible,
    setExportModalVisible,
    selectedExportColumns,
    setSelectedExportColumns,
    exporting,
    exportableColumns,
    handleExportClick,
    handleExportConfirm,
  } = useTableExport<T>({
    columns,
    dataSource,
    exportFilename,
  });

  const tableContent = (
    <div className={wrapperClassName} ref={shellRef}>
      {showExport && (
        <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportClick}
            size="small"
            disabled={!dataSource || dataSource.length === 0}
          >
            导出Excel
          </Button>
        </div>
      )}
      <ConfigProvider getPopupContainer={getTablePopupContainer}>
        <Table
          {...rest}
          rowKey={rowKey}
          className={`${className || ''} resizable-table` || 'resizable-table'}
          columns={finalColumns as TableProps<T>['columns']}
          components={mergedComponents}
          scroll={mergedScroll as TableProps<T>['scroll']}
          tableLayout={tableLayout || 'fixed'}
          size={responsiveTableSize}
          style={{ wordBreak: 'break-all' }}
          pagination={mergedPagination as TableProps<T>['pagination']}
          sticky={stickyHeaderProp === true ? { offsetHeader: 0 } : (stickyHeaderProp || undefined)}
          locale={mergedLocale}
          dataSource={dataSource}
        />
      </ConfigProvider>
    </div>
  );

  const exportModalNode = showExport && exportModalVisible ? (
    <ExportModal
      visible={exportModalVisible}
      exporting={exporting}
      selectedColumns={selectedExportColumns}
      exportableColumns={exportableColumns}
      recordCount={dataSource?.length || 0}
      onCancel={() => setExportModalVisible(false)}
      onOk={handleExportConfirm}
      onSelectedColumnsChange={(values) => setSelectedExportColumns(values)}
    />
  ) : null;

  if (reorderableColumns && sortableColumnIds.length > 0) {
    return (
      <>
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
            {tableContent}
          </SortableContext>
        </DndContext>
        {exportModalNode}
      </>
    );
  }

  return (
    <>
      {tableContent}
      {exportModalNode}
    </>
  );
};

const ResizableTableWithSummary = Object.assign(ResizableTable, {
  Summary: Table.Summary,
});

export default ResizableTableWithSummary;
