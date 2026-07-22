import React from 'react';
import { Button, Checkbox } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { QuickEntryConfig } from './quickEntryConfig';

interface QuickEntrySettingsModalProps {
  open: boolean;
  quickEntries: QuickEntryConfig[];
  onToggle: (entryId: string) => void;
  onSave: () => void;
  onReset: () => void;
  onCancel: () => void;
}

const QuickEntrySettingsModal: React.FC<QuickEntrySettingsModalProps> = ({
  open,
  quickEntries,
  onToggle,
  onSave,
  onReset,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="快捷入口设置"
      open={open}
      onOk={onSave}
      onCancel={onCancel}
      width="40vw"
      footer={[
        <Button key="reset" onClick={onReset}>
          重置默认
        </Button>,
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="submit" type="primary" onClick={onSave}>
          保存
        </Button>,
      ]}
    >
      <div style={{ padding: '16px 0' }}>
        <p style={{ marginBottom: 16, color: 'var(--color-text-tertiary)' }}>
          勾选需要在首页显示的快捷入口（至少保留一个）
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {quickEntries.map(entry => (
            <Checkbox
              key={entry.id}
              checked={entry.enabled}
              onChange={() => onToggle(entry.id)}
              disabled={quickEntries.filter(e => e.enabled).length === 1 && entry.enabled}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {entry.icon}
                {entry.label}
              </span>
            </Checkbox>
          ))}
        </div>
      </div>
    </ResizableModal>
  );
};

export default QuickEntrySettingsModal;
