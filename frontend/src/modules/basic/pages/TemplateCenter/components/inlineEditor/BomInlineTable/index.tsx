import React from 'react';
import { Button } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { useBomInlineTableData } from './useBomInlineTableData';
import { buildBomColumns } from './columns';
import type { BomInlineTableProps } from './types';

const BomInlineTable: React.FC<BomInlineTableProps> = ({ value, onChange, readOnly = false, compact = false }) => {
  const { tableData, updateRow, deleteRow, addRow } = useBomInlineTableData({ value, onChange });
  const columns = buildBomColumns({ readOnly, compact, updateRow, deleteRow });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: compact ? 8 : 12 }}>
        {readOnly ? null : <Button onClick={addRow}>新增物料</Button>}
      </div>
      <ResizableTable
        storageKey="maintenance-inline-bom-editor"
        bordered
        pagination={false}
        reorderableColumns={false}
        scroll={{ x: 'max-content' }}
        rowKey="__rowKey"
        columns={columns}
        dataSource={tableData}
        emptyDescription="暂无物料数据"
      />
    </div>
  );
};

export default BomInlineTable;
