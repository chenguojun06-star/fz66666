import React from 'react';
import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

/**
 * 行操作项类型定义
 */
export type RowAction = {
    /** 操作唯一标识 */
    key: string;
    /** 操作显示文本或React节点 */
    label: React.ReactNode;
    /** 操作提示文本 */
    title?: string;
    /** 操作图标 */
    icon?: React.ReactNode;
    /** 是否禁用操作 */
    disabled?: boolean;
    /** 是否为危险操作（显示红色） */
    danger?: boolean;
    /** 是否为主要操作（优先显示） */
    primary?: boolean;
    /** 点击事件处理函数 */
    onClick?: () => void;
    /** 子操作项（用于下拉菜单） */
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
}> = ({ actions, maxInline = 2, size = 'small', className }) => {
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
    // 行内显示的操作项
    const inline = ordered.slice(0, Math.max(0, Math.min(ordered.length, maxInline)));
    // 溢出到下拉菜单的操作项
    const rest = ordered.slice(inline.length);

    // 构建下拉菜单操作项
    const menuItems: MenuProps['items'] = (() => {
        // 映射溢出的操作项
        const mapped = rest.map((a) => ({
            key: a.key,
            label: a.label,
            icon: a.icon,
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
                    a.icon ? 'row-actions__btn--icon' : '',
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
                        icon={a.icon ? <span className="row-actions__icon">{a.icon}</span> : undefined}
                        title={text}
                        aria-label={text}
                        disabled={a.disabled}
                        danger={a.danger}
                        onClick={a.onClick}
                    >
                        {/* 如果有图标，不显示文本 */}
                        {a.icon ? null : a.label}
                    </Button>
                );
            })}

            {/* 渲染下拉菜单（如果有溢出的操作项） */}
            {menuItems.length ? (
                <Dropdown trigger={['click']} menu={{ items: menuItems }}>
                    <Button
                        type="link"
                        size={size}
                        icon={<span className="row-actions__icon"><MoreOutlined /></span>}
                        className="row-actions__btn row-actions__btn--icon"
                        title="更多"
                        aria-label="更多"
                        disabled={isDropdownDisabled}
                    />
                </Dropdown>
            ) : null}
        </Space>
    );
};

export default RowActions;
