import React from 'react';
import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';

/**
 * 行操作项类型定义
 */
export type RowAction = {
  key: string;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children?: MenuProps['items'];
};

/**
 * 将React节点转换为文本
 * @param v React节点
 * @returns 转换后的文本
 */
const resolveText = (v: React.ReactNode) => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
};

const isLogAction = (a: RowAction) => {
  const key = String(a?.key || '').trim();
  const labelText = resolveText(a?.label);
  return key === 'log' || labelText === '日志';
};

const collectActionHandlers = (items?: MenuProps['items']) => {
  const handlers = new Map<string, () => void>();

  const visit = (list?: MenuProps['items']) => {
    (list || []).forEach((item) => {
      if (!item || item.type === 'divider') {
        return;
      }
      // antd MenuProps['items'] 联合类型不直接暴露 onClick/children，用 unknown→any 收窄
      const it = item as unknown as Record<string, unknown>;
      const key = String(it['key'] || '').trim();
      if (key && typeof it['onClick'] === 'function') {
        handlers.set(key, it['onClick'] as () => void);
      }
      if (Array.isArray(it['children']) && (it['children'] as unknown[]).length) {
        visit(it['children'] as MenuProps['items']);
      }
    });
  };

  visit(items);
  return handlers;
};

const stripMenuItemHandlers = (items?: MenuProps['items']): MenuProps['items'] => {
  return (items || []).map((item) => {
    if (!item || item.type === 'divider') {
      return item;
    }

    const it = item as unknown as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {
      ...it,
      onClick: undefined,
    };

    if (Array.isArray(it['children']) && (it['children'] as unknown[]).length) {
      sanitized['children'] = stripMenuItemHandlers(it['children'] as MenuProps['items']);
    }

    return sanitized as unknown as NonNullable<MenuProps['items']>[number];
  });
};

/**
 * 行操作组件
 * 用于展示表格行的操作按钮，支持自动折叠溢出的操作到下拉菜单
 */
const RowActions: React.FC<{
  /** 操作项列表 */
  actions: RowAction[];
  /** 最大显示的行内按钮数量，默认2个 */
  maxInline?: number;
  /** 按钮尺寸，默认small */
  size?: 'small' | 'middle' | 'large';
  /** 自定义类名 */
  className?: string;
}> = ({ actions, maxInline, size = 'small', className }) => {
  // 过滤无效操作项
  const list = (Array.isArray(actions) ? actions : []).filter((x) => x && String(x.key || '').trim());
  if (!list.length) return null;

  // 查找"更多"操作项（用于存放溢出的操作）
  const moreContainer = list.find(
    (a) =>
      a &&
      Array.isArray(a.children) &&
      !a.onClick &&
      (String(a.key || '') === 'more' || resolveText(a.label) === '更多')
  );
  // 基础操作列表（排除"更多"操作项）
  const baseList = moreContainer ? list.filter((x) => x !== moreContainer) : list;

  // 分离主要操作和次要操作
  const primary = baseList.filter((x) => x.primary);
  const secondary = baseList.filter((x) => !x.primary);
  // 合并操作列表，主要操作优先显示
  const ordered = [...primary, ...secondary];
  const logActions = ordered.filter((a) => isLogAction(a));
  const nonLogActions = ordered.filter((a) => !isLogAction(a));

  // 行内显示的操作项：优先使用外部传入的 maxInline；未传时默认逻辑（<=2全显，否则1个）
  const effectiveMaxInline =
    maxInline != null ? maxInline : nonLogActions.length <= 2 ? nonLogActions.length : 1;
  const inline = nonLogActions.slice(0, Math.max(0, Math.min(nonLogActions.length, effectiveMaxInline)));
  // 溢出到下拉菜单的操作项
  const rest = [...logActions, ...nonLogActions.slice(inline.length)];

  // 构建下拉菜单操作项
  const menuItems: MenuProps['items'] = (() => {
    // 映射溢出的操作项
    const mapped = rest.map((a) => ({
      key: a.key,
      label: a.label,
      disabled: a.disabled,
      danger: a.danger,
      onClick: a.onClick,
      children: a.children,
    }));

    // 如果有"更多"操作项的子操作，合并到下拉菜单
    const moreChildren = moreContainer?.children;
    if (Array.isArray(moreChildren) && moreChildren.length) return [...moreChildren, ...mapped];

    return mapped;
  })();

  const menuActionHandlers = collectActionHandlers(menuItems);
  const sanitizedMenuItems = stripMenuItemHandlers(menuItems);

  // 判断下拉菜单是否所有操作都禁用
  const isDropdownDisabled = (menuItems || []).every((it: any) => {
    if (!it) return true;
    if (it.type === 'divider') return true;
    return Boolean(it.disabled);
  });

  const rootClassName = ['row-actions', className].filter(Boolean).join(' ');

  return (
    <Space size={4} className={rootClassName}>
      {/* 渲染行内操作按钮 */}
      {inline.map((a) => {
        const text = a.title || resolveText(a.label) || a.key;
        const btnClassName = [
          'row-actions__btn',
          a.primary ? 'row-actions__btn--primary' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <Button
            key={a.key}
            type="link"
            size={size}
            className={btnClassName}
            title={text}
            aria-label={text}
            disabled={a.disabled}
            danger={a.danger}
            loading={a.loading}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        );
      })}

      {/* 渲染下拉菜单（如果有溢出的操作项） */}
      {menuItems.length ? (
        <Dropdown
          trigger={['click']}
          menu={{
            items: sanitizedMenuItems,
            getPopupContainer: () => document.body,
            onClick: ({ key, domEvent }) => {
              domEvent?.stopPropagation?.();
              const handler = menuActionHandlers.get(String(key || '').trim());
              handler?.();
            },
          }}
        >
          <Button
            type="link"
            size={size}
            className="row-actions__btn"
            title="更多"
            aria-label="更多"
            disabled={isDropdownDisabled}
          >
            更多
          </Button>
        </Dropdown>
      ) : null}
    </Space>
  );
};

export default RowActions;
