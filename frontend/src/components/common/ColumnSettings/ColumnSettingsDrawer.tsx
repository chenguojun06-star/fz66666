import React, { useMemo } from 'react';
import { Checkbox, Button, Space, Divider, Typography } from 'antd';
import { SettingOutlined, ReloadOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import type { ColumnOption } from './useColumnSettings';

/**
 * 通用列设置侧滑抽屉
 * 基于 SideDrawer（右侧滑弹窗），提供"列显隐勾选 + 恢复默认"功能。
 * 与 ColumnSettingsModal 内容一致，仅容器由 Modal 换成右侧滑抽屉，
 * 满足各列表页"列设置"统一使用通用侧滑组件的规范。
 *
 * 用法：
 *   <ColumnSettingsDrawer
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     columnOptions={columnOptions}
 *     visibleColumns={visibleColumns}
 *     onToggle={(key, visible) => setVisible(key, visible)}
 *     onReset={reset}
 *   />
 */

type ColumnSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  columnOptions: ColumnOption[];
  visibleColumns: Record<string, boolean>;
  onToggle: (key: string, visible: boolean) => void;
  onReset: () => void;
  title?: string;
};

export const ColumnSettingsDrawer: React.FC<ColumnSettingsDrawerProps> = ({
  open,
  onClose,
  columnOptions,
  visibleColumns,
  onToggle,
  onReset,
  title = '列设置',
}) => {
  const visibleCount = useMemo(
    () => columnOptions.filter((c) => visibleColumns[c.key] !== false).length,
    [columnOptions, visibleColumns]
  );

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width={480}
      title={
        <Space>
          <SettingOutlined />
          <span>{title}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            已选 {visibleCount}/{columnOptions.length}
          </Typography.Text>
        </Space>
      }
      footerExtra={
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onReset}>
          恢复默认
        </Button>
      }
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={onClose}>确定</Button>
        </Space>
      }
    >
      <Checkbox.Group
        value={columnOptions.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key)}
        onChange={(checkedKeys) => {
          const set = new Set(checkedKeys as string[]);
          columnOptions.forEach((c) => onToggle(c.key, set.has(c.key)));
        }}
        style={{ width: '100%' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
          {columnOptions.map((c) => (
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
    </SideDrawer>
  );
};
