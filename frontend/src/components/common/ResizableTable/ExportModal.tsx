import React from 'react';
import { Modal, Checkbox } from 'antd';

interface ExportModalProps {
  visible: boolean;
  exporting: boolean;
  selectedColumns: string[];
  exportableColumns: any[];
  recordCount: number;
  onCancel: () => void;
  onOk: () => void;
  onSelectedColumnsChange: (values: string[]) => void;
}

const ExportModal: React.FC<ExportModalProps> = ({
  visible,
  exporting,
  selectedColumns,
  exportableColumns,
  recordCount,
  onCancel,
  onOk,
  onSelectedColumnsChange,
}) => {
  return (
    <Modal
      title="选择导出列"
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={exporting}
      width={600}
    >
      <Checkbox.Group
        value={selectedColumns}
        onChange={(values) => onSelectedColumnsChange(values as string[])}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {exportableColumns.map(col => (
          <Checkbox
            key={String(col.key || col.dataIndex || '')}
            value={String(col.key || col.dataIndex || '')}
          >
            {typeof col.title === 'string' ? col.title : String(col.title || '')}
          </Checkbox>
        ))}
      </Checkbox.Group>
      <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 12 }}>
        提示：导出当前页数据，共 {recordCount} 条记录
      </div>
    </Modal>
  );
};

export default ExportModal;
