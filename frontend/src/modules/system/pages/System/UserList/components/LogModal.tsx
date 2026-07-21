import React from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import type { useModal } from '@/hooks';

interface LogModalProps {
  logModal: ReturnType<typeof useModal>;
  logTitle: string;
  logRecords: any[];
  logLoading: boolean;
  logColumns: any[];
  modalWidth: number | string;
  isMobile: boolean;
  onClose: () => void;
}

const LogModal: React.FC<LogModalProps> = ({
  logModal,
  logTitle,
  logRecords,
  logLoading,
  logColumns,
  modalWidth,
  isMobile,
  onClose,
}) => {
  return (
    <ResizableModal
      open={logModal.visible}
      title={logTitle}
      onCancel={onClose}
      footer={null}
      width={modalWidth}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
    >
      <ResizableTable
        columns={logColumns as any}
        dataSource={logRecords}
        rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
        loading={logLoading}
        emptyDescription="暂无日志数据"
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
    </ResizableModal>
  );
};

export default LogModal;
