import React, { useState, useEffect } from 'react';
import { Drawer } from 'antd';
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
    { title: '物料编码', dataIndex: 'materialCode', width: 140 },
    { title: '物料名称', dataIndex: 'materialName', width: 160, ellipsis: true },
    { title: '颜色', dataIndex: 'color', width: 90 },
    { title: '尺码', dataIndex: 'size', width: 80 },
    { title: '规格', dataIndex: 'specification', width: 120, ellipsis: true, render: (v: any) => v || '-' },
    { title: '单位', dataIndex: 'unit', width: 70 },
    { title: '批次号', dataIndex: 'batchNo', width: 120, ellipsis: true, render: (v: any) => v || '-' },
    { title: '库位', dataIndex: 'locationCode', width: 100, ellipsis: true, render: (v: any) => v || '-' },
    { title: '领料数量', dataIndex: 'quantity', width: 100, align: 'right' as const, render: (v: number, r: any) => `${v} ${r.unit || ''}` },
  ];

  return (
    <Drawer
      title="领料详情"
      open={visible}
      onClose={onCancel}
      placement="right"
      styles={{ wrapper: { width: '60vw' }, body: { padding: '16px 24px', display: 'flex', flexDirection: 'column', overflow: 'auto' } }}
    >
      <ResizableTable
        storageKey="picking-detail"
        emptyDescription="暂无领料明细"
        loading={loading}
        dataSource={items}
        columns={columns}
        rowKey="id"
        pagination={false}
      />
    </Drawer>
  );
};

export default PickingDetailModal;
