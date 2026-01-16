import React from 'react';
import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

export type RowAction = {
    key: string;
    label: React.ReactNode;
    title?: string;
    icon?: React.ReactNode;
    disabled?: boolean;
    danger?: boolean;
    primary?: boolean;
    onClick?: () => void;
    children?: MenuProps['items'];
};

const resolveText = (v: React.ReactNode) => {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return '';
};

const RowActions: React.FC<{
    actions: RowAction[];
    maxInline?: number;
    size?: 'small' | 'middle' | 'large';
    className?: string;
}> = ({ actions, maxInline = 2, size = 'small', className }) => {
    const list = (Array.isArray(actions) ? actions : []).filter((x) => x && String(x.key || '').trim());
    if (!list.length) return null;

    const moreContainer = list.find(
        (a) =>
            a &&
            Array.isArray(a.children) &&
            !a.onClick &&
            (String(a.key || '') === 'more' || resolveText(a.label) === '更多')
    );
    const baseList = moreContainer ? list.filter((x) => x !== moreContainer) : list;

    const primary = baseList.filter((x) => x.primary);
    const secondary = baseList.filter((x) => !x.primary);
    const ordered = [...primary, ...secondary];
    const inline = ordered.slice(0, Math.max(0, Math.min(ordered.length, maxInline)));
    const rest = ordered.slice(inline.length);

    const menuItems: MenuProps['items'] = (() => {
        const mapped = rest.map((a) => ({
            key: a.key,
            label: a.label,
            icon: a.icon,
            disabled: a.disabled,
            danger: a.danger,
            onClick: a.onClick,
            children: a.children,
        }));

        const moreChildren = moreContainer?.children;
        if (Array.isArray(moreChildren) && moreChildren.length) return [...moreChildren, ...mapped];

        return mapped;
    })();

    const isDropdownDisabled = (menuItems || []).every((it: any) => {
        if (!it) return true;
        if (it.type === 'divider') return true;
        return Boolean(it.disabled);
    });

    return (
        <Space size={4} className={className}>
            {inline.map((a) => {
                const text = a.title || resolveText(a.label) || a.key;
                return (
                    <Button
                        key={a.key}
                        type="link"
                        size={size}
                        icon={a.icon}
                        title={text}
                        aria-label={text}
                        disabled={a.disabled}
                        danger={a.danger}
                        onClick={a.onClick}
                    >
                        {a.icon ? null : a.label}
                    </Button>
                );
            })}

            {menuItems.length ? (
                <Dropdown trigger={['click']} menu={{ items: menuItems }}>
                    <Button type="link" size={size} icon={<MoreOutlined />} title="更多" aria-label="更多" disabled={isDropdownDisabled} />
                </Dropdown>
            ) : null}
        </Space>
    );
};

export default RowActions;
