import React, { useMemo } from 'react';
import { Button, Checkbox, Divider, Space, Tag, Typography } from 'antd';
import { SettingOutlined, ReloadOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import type { ColumnOption } from './useColumnSettings';

/**
 * 通用列设置侧滑抽屉
 * 基于 SideDrawer（右侧滑弹窗），提供"列显隐勾选 + 恢复默认"功能。
 * 与 ColumnSettingsModal 内容一致，仅容器由 Modal 换成右侧滑抽屉，
 * 满足各列表页"列设置"统一使用通用侧滑组件的规范。
 *
 * D-322: 字段全部由系统预设，用户只挑"要不要显示"——
 *   groups  可选：字段分组渲染（未分组项归入"其他"），不传保持平铺；
 *   presets 可选：一键预设方案（精简/标准/完整…），点按即整套套用；
 * 预设是系统给好的推荐组合，用户不需要自己从零搭配。
 *
 * 用法：
 *   <ColumnSettingsDrawer
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     columnOptions={columnOptions}
 *     visibleColumns={visibleColumns}
 *     onToggle={(key, visible) => setVisible(key, visible)}
 *     onReset={reset}
 *     groups={[{ title: '基本信息', keys: ['styleNo', 'styleName'] }]}
 *     presets={[{ key: 'simple', label: '精简', values: { styleNo: true } }]}
 *     onApplyPreset={applyPreset}
 *   />
 */

export interface ColumnSettingGroup {
  title: string;
  keys: string[];
}

export interface ColumnSettingPreset {
  key: string;
  label: string;
  /** 该方案下各列显隐；未提及的列视为隐藏 */
  values: Record<string, boolean>;
}

type ColumnSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  columnOptions: ColumnOption[];
  visibleColumns: Record<string, boolean>;
  onToggle: (key: string, visible: boolean) => void;
  onReset: () => void;
  title?: string;
  groups?: ColumnSettingGroup[];
  presets?: ColumnSettingPreset[];
  onApplyPreset?: (values: Record<string, boolean>) => void;
  /** 抽屉底部附加入口（如管理员的自定义字段管理链接） */
  extraFooterLink?: React.ReactNode;
};

export const ColumnSettingsDrawer: React.FC<ColumnSettingsDrawerProps> = ({
  open,
  onClose,
  columnOptions,
  visibleColumns,
  onToggle,
  onReset,
  title = '显示字段',
  groups,
  presets,
  onApplyPreset,
  extraFooterLink,
}) => {
  const visibleCount = useMemo(
    () => columnOptions.filter((c) => visibleColumns[c.key] !== false).length,
    [columnOptions, visibleColumns]
  );

  /** 当前命中哪个预设（逐位一致才算），都没有则显示"自定义" */
  const activePresetKey = useMemo(() => {
    if (!presets?.length) return undefined;
    const currentOn = new Set(columnOptions.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key));
    for (const p of presets) {
      const presetOn = new Set(columnOptions.filter((c) => p.values[c.key] === true).map((c) => c.key));
      if (currentOn.size === presetOn.size && [...currentOn].every((k) => presetOn.has(k))) return p.key;
    }
    return 'custom';
  }, [presets, columnOptions, visibleColumns]);

  /** 分组渲染：有 groups 按组、未分组项进"其他"；无 groups 平铺 */
  const renderOptions = () => {
    if (!groups?.length) {
      return (
        <Checkbox.Group
          value={columnOptions.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key)}
          onChange={(checkedKeys) => applyCheckedChange(checkedKeys as string[])}
          style={{ width: '100%' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
            {columnOptions.map((c) => renderOneCheckbox(c))}
          </div>
        </Checkbox.Group>
      );
    }

    const groupedKeys = new Set(groups.flatMap((g) => g.keys));
    const others = columnOptions.filter((c) => !groupedKeys.has(c.key));
    return (
      <Checkbox.Group
        value={columnOptions.filter((c) => visibleColumns[c.key] !== false).map((c) => c.key)}
        onChange={(checkedKeys) => applyCheckedChange(checkedKeys as string[])}
        style={{ width: '100%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => {
            const opts = g.keys
              .map((k) => columnOptions.find((c) => c.key === k))
              .filter((c): c is ColumnOption => !!c);
            if (!opts.length) return null;
            return (
              <div key={g.title}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  {g.title}
                </Typography.Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
                  {opts.map(renderOneCheckbox)}
                </div>
              </div>
            );
          })}
          {others.length > 0 && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                其他
              </Typography.Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
                {others.map(renderOneCheckbox)}
              </div>
            </div>
          )}
        </div>
      </Checkbox.Group>
    );
  };

  const renderOneCheckbox = (c: ColumnOption) => (
    <Checkbox key={c.key} value={c.key} style={{ marginInlineStart: 0 }}>
      {c.label}
      {c.key.startsWith('ext_') && (
        <Tag style={{ marginInlineStart: 6, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>自定义</Tag>
      )}
    </Checkbox>
  );

  const applyCheckedChange = (checkedKeys: string[]) => {
    const set = new Set(checkedKeys);
    // 只触发实际变更的列，避免一次勾选对全部列发起批量保存请求（撞唯一键 409）
    columnOptions.forEach((c) => {
      const current = visibleColumns[c.key] !== false;
      const next = set.has(c.key);
      if (current !== next) onToggle(c.key, next);
    });
  };

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
        <Space>
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onReset}>
            恢复默认
          </Button>
          {extraFooterLink}
        </Space>
      }
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={onClose}>确定</Button>
        </Space>
      }
    >
      {presets?.length ? (
        <>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            推荐方案，一键套用：
          </Typography.Text>
          <Space wrap size={8} style={{ marginBottom: 4 }}>
            {presets.map((p) => (
              <Button
                key={p.key}
                size="small"
                type={activePresetKey === p.key ? 'primary' : 'default'}
                onClick={() => onApplyPreset?.(p.values)}
              >
                {p.label}
              </Button>
            ))}
            {activePresetKey === 'custom' && (
              <Tag style={{ marginInlineEnd: 0 }}>自定义</Tag>
            )}
          </Space>
          <Divider style={{ margin: '12px 0' }} />
        </>
      ) : null}

      {renderOptions()}

      <Divider style={{ margin: '12px 0' }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        勾选要显示的字段，取消勾选即隐藏。方案会自动保存到你的账号，换电脑也生效。
      </Typography.Text>
    </SideDrawer>
  );
};

export default ColumnSettingsDrawer;
