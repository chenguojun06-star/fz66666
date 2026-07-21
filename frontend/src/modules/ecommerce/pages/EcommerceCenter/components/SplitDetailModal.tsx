import React from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';

export interface SplitDetailRow {
  orderNo: string;
  skuCode: string;
  warehouse: string;
  qty: number;
  reason: string;
}

export interface SplitDetailModalProps {
  open: boolean;
  splits: SplitDetailRow[];
  onClose: () => void;
}

const SplitDetailModal: React.FC<SplitDetailModalProps> = ({ open, splits, onClose }) => (
  <ResizableModal title="拆单记录" open={open} onCancel={onClose} footer={null} width="40vw">
    <ResizableTable<SplitDetailRow> dataSource={splits} rowKey="orderNo" size="small" pagination={false}
      columns={[
        { title: '拆单号', dataIndex: 'orderNo' },
        { title: 'SKU编码', dataIndex: 'skuCode' },
        { title: '仓库', dataIndex: 'warehouse' },
        { title: '数量', dataIndex: 'qty' },
        { title: '原因', dataIndex: 'reason' },
      ]}
      emptyDescription="暂无数据"
    />
  </ResizableModal>
);

export default SplitDetailModal;
