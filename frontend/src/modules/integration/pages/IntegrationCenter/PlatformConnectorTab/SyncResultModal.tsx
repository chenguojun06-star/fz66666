import React from 'react';
import { Button, Descriptions, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { PlatformMeta } from '../PlatformConnectorConstants';
import type { SyncResultState } from './types';

const { Text } = Typography;

interface SyncResultModalProps {
  open: boolean;
  activePlatform: PlatformMeta | null;
  syncResult: SyncResultState | null;
  onCancel: () => void;
  onClose: () => void;
}

const SyncResultModal: React.FC<SyncResultModalProps> = ({ open, activePlatform, syncResult, onCancel, onClose }) => {
  if (!syncResult || !activePlatform) return null;
  return (
    <ResizableModal open={open} title={`${activePlatform.name} 同步结果`}
      onCancel={onCancel} footer={<Button onClick={onClose}>确定</Button>} width="30vw">
      <Descriptions bordered column={2}>
        <Descriptions.Item label="新增订单"><Text style={{ color: 'var(--color-success)', fontWeight: 'bold', fontSize: 18 }}>{syncResult.synced ?? '-'}</Text></Descriptions.Item>
        <Descriptions.Item label="已跳过"><Text style={{ color: 'var(--color-warning)' }}>{syncResult.skipped ?? '-'}</Text></Descriptions.Item>
      </Descriptions>
    </ResizableModal>
  );
};

export default SyncResultModal;
