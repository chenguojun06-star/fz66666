import React from 'react';
import { Button, Checkbox, Modal, Space, Table } from 'antd';
import { ShareAltOutlined } from '@ant-design/icons';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { ColumnsType } from 'antd/es/table';
import type { ColorCard, ColorCardItem } from '../types';

// ===== 生成物料预览弹窗（从 index.tsx 抽取） =====
interface PreviewModalProps {
  open: boolean;
  previewCard: ColorCard | null;
  previewItems: ColorCardItem[];
  selectedItems: Set<number>;
  previewColumns: ColumnsType<ColorCardItem>;
  onConfirmGenerate: () => Promise<void>;
  onSelectAll: (selectAll: boolean) => void;
  onCancel: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  open, previewCard, previewItems, selectedItems, previewColumns,
  onConfirmGenerate, onSelectAll, onCancel,
}) => {
  return (
    <Modal
      title={<Space><ShareAltOutlined /> 生成物料预览 - {previewCard?.colorCardName}</Space>}
      open={open}
      onCancel={onCancel}
      width={700}
      footer={[
        <Button key="close" onClick={onCancel}>取消</Button>,
        <Button key="generate" type="primary" onClick={onConfirmGenerate}
          disabled={selectedItems.size === 0}>
          确认生成 {selectedItems.size} 条物料
        </Button>,
      ]}
    >
      {previewCard && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
          <Space split={<span style={{ color: '#ccc' }}>|</span>}>
            <span>编号：<b>{previewCard.colorCardCode}</b></span>
            <span>类型：<b>{getMaterialTypeLabel(previewCard.materialType)}</b></span>
            <span>供应商：<b>{previewCard.supplierName || '-'}</b></span>
          </Space>
        </div>
      )}
      <Table
        columns={previewColumns}
        dataSource={previewItems}
        rowKey={(_, i) => String(i)}
        size="small"
        pagination={false}
        scroll={{ y: 400 }}
        footer={() => (
          <Space>
            <Checkbox
              checked={selectedItems.size === previewItems.length && previewItems.length > 0}
              indeterminate={selectedItems.size > 0 && selectedItems.size < previewItems.length}
              onChange={(e) => onSelectAll(e.target.checked)}
            >
              全选 ({selectedItems.size}/{previewItems.length})
            </Checkbox>
            <span style={{ color: '#888' }}>勾选的颜色将被生成到物料资料库</span>
          </Space>
        )}
      />
    </Modal>
  );
};

export default PreviewModal;
