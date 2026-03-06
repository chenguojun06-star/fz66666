import React, { useState, useEffect } from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';

interface PickingDetailModalProps {
  visible: boolean;
  pickingId: string | null;
  onCancel: () => void;
}

const PickingDetailModal: React.FC<PickingDetailModalProps> = ({ visible, pickingId, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (visible && pickingId) {
      setLoading(true);
      api.get(`/production/picking/${pickingId}/items`)
        .then((res: any) => {
          if (res.code === 200) {
            setItems(res.data);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setItems([]);
    }
  }, [visible, pickingId]);

  const columns = [
    { title: '物料编码', dataIndex: 'materialCode' },
    { title: '物料名称', dataIndex: 'materialName' },
    { title: '颜色', dataIndex: 'color' },
    { title: '尺码', dataIndex: 'size' },
    { title: '领料数量', dataIndex: 'quantity', render: (v: number, r: any) => `${v} ${r.unit || ''}` },
  ];

  return (
    <ResizableModal
      title="领料详情"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width="60vw"
    >
      <ResizableTable
        storageKey="picking-detail"
        loading={loading}
        dataSource={items}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
      />
    </ResizableModal>
  );
};

export default PickingDetailModal;
