import React, { useMemo } from 'react';
import { Modal, Checkbox, Button, Space, Divider, Typography } from 'antd';
import { SettingOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnOption } from './useColumnSettings';

/**
 * 通用列设置弹窗
 * 提供"列显隐勾选 + 重置"功能
 * 替代原 Production List 内的硬编码实现，所有列表页可复用
 */

type ColumnSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  columnOptions: ColumnOption[];
  visibleColumns: Record<string, boolean>;
  onToggle: (key: string, visible: boolean) => void;
  onReset: () => void;
  title?: string;
};

export const ColumnSettingsModal: React.FC<ColumnSettingsModalProps> = ({
  open,
  onClose,
  columnOptions,
  visibleColumns,
  onToggle,
  onReset,
  title = '列设置',
}) => {
  const visibleCount = useMemo(
    () => columnOptions.filter(c => visibleColumns[c.key] !== false).length,
    [columnOptions, visibleColumns]
  );

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <span>{title}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            已选 {visibleCount}/{columnOptions.length}
          </Typography.Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={480}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button icon={<ReloadOutlined />} onClick={onReset}>恢复默认</Button>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={onClose}>确定</Button>
          </Space>
        </Space>
      }
    >
      <Checkbox.Group
        value={columnOptions.filter(c => visibleColumns[c.key] !== false).map(c => c.key)}
        onChange={(checkedKeys) => {
          const set = new Set(checkedKeys as string[]);
          columnOptions.forEach(c => onToggle(c.key, set.has(c.key)));
        }}
        style={{ width: '100%' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
          {columnOptions.map(c => (
            <Checkbox key={c.key} value={c.key} style={{ marginInlineStart: 0 }}>
              {c.label}
            </Checkbox>
          ))}
        </div>
      </Checkbox.Group>
      <Divider style={{ margin: '12px 0' }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        勾选要显示的列，取消勾选的列将隐藏。设置会自动保存到你的账号。
      </Typography.Text>
    </Modal>
  );
};

/** 列设置触发按钮（link 风格，简约） */
export const ColumnSettingsButton: React.FC<{
  onClick: () => void;
  label?: string;
}> = ({ onClick, label = '列设置' }) => (
  <Button type="link" size="small" icon={<SettingOutlined />} onClick={onClick}>
    {label}
  </Button>
);
