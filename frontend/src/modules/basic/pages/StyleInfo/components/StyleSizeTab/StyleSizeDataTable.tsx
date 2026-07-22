import React from 'react';
import { Table } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { DisplayRow } from '../styleSize/shared';

interface StyleSizeDataTableProps {
  loading: boolean;
  displayRows: DisplayRow[];
  columns: any[];
  editMode: boolean;
  readOnly: boolean | undefined;
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
}

const StyleSizeDataTable: React.FC<StyleSizeDataTableProps> = ({
  loading,
  displayRows,
  columns,
  editMode,
  readOnly,
  selectedRowKeys,
  setSelectedRowKeys,
}) => {
  return (
    <ResizableTable
      className="style-size-table"
      bordered
      dataSource={displayRows}
      columns={columns as any}
      pagination={false}
      loading={loading}
      emptyDescription="暂无数据"
      rowKey="key"
      scroll={{ x: 'max-content' }}
      rowClassName={(_record, rowIndex) => {
        const row = displayRows[rowIndex];
        if (!row) return '';
        const classes = [`style-size-group-${row.groupToneMeta.key}`];
        if (row.isGroupStart) classes.push('style-size-group-start');
        return classes.join(' ');
      }}
      rowSelection={
        editMode && !readOnly
          ? {
              selectedRowKeys,
              onChange: (newSelectedRowKeys: React.Key[]) => setSelectedRowKeys(newSelectedRowKeys),
              selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
            }
          : undefined
      }
    />
  );
};

export default StyleSizeDataTable;
