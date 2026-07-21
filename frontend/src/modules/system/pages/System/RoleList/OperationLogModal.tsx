import React, { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime } from '@/utils/datetime';
import type { OperationLog } from './helpers';

interface OperationLogModalProps {
  open: boolean;
  title: string;
  records: OperationLog[];
  loading: boolean;
  onCancel: () => void;
}

/**
 * 操作日志弹窗
 */
const OperationLogModal: React.FC<OperationLogModalProps> = ({
  open,
  title,
  records,
  loading,
  onCancel,
}) => {
  const { isMobile, modalWidth } = useViewport();

  const columns: ColumnsType<OperationLog> = useMemo(() => [
    { title: '动作', dataIndex: 'action', key: 'action', width: 120, render: (v: string) => v || '-' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120, render: (v: string) => v || '-' },
    { title: '原因', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (v: string) => formatDateTime(v) },
  ], []);

  return (
    <ResizableModal
      open={open}
      title={title}
      onCancel={onCancel}
      footer={null}
      width={modalWidth}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
    >
      <ResizableTable<OperationLog>
        columns={columns}
        dataSource={records}
        rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
        emptyDescription="暂无日志数据"
      />
    </ResizableModal>
  );
};

export default OperationLogModal;
