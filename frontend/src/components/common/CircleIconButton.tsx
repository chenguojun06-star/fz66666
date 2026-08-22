import React from 'react';
import { Button, Tooltip } from 'antd';
import { PlusOutlined, MinusOutlined } from '@ant-design/icons';

interface CircleIconButtonProps {
  /** add=蓝色+号（添加） / remove=红色-号（移除） */
  type: 'add' | 'remove';
  /** 直径 px，默认 24 */
  size?: number;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** 悬浮提示文案 */
  title?: string;
  disabled?: boolean;
  /** 加载中（提交类添加操作） */
  loading?: boolean;
  /** 阻止事件冒泡（嵌套在可点击/可拖动容器内时使用） */
  stopPropagation?: boolean;
}

/**
 * 统一圆形加减按钮（全系统标准操作 UI）
 * - 加号 = 添加：蓝色实心圆 + 白色 +
 * - 减号 = 移除：红色实心圆 + 白色 -
 * 用于颜色/尺码/组合码数添加、明细行增删、目录条目增删等所有弹窗与表单
 */
const CircleIconButton = React.forwardRef<HTMLButtonElement, CircleIconButtonProps>((
  {
    type,
    size = 24,
    onClick,
    title,
    disabled,
    loading = false,
    stopPropagation = false,
  },
  ref,
) => {
  const isAdd = type === 'add';
  const button = (
    <Button
      ref={ref}
      type="text"
      shape="circle"
      disabled={disabled}
      loading={loading}
      onClick={(e) => {
        if (stopPropagation) {
          e.stopPropagation();
        }
        onClick?.(e);
      }}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: disabled
          ? 'var(--color-bg-disabled, rgba(0, 0, 0, 0.06))'
          : isAdd
            ? 'var(--color-primary, #2563eb)'
            : 'var(--color-danger, #ef4444)',
        color: disabled ? 'var(--color-text-quaternary, rgba(0, 0, 0, 0.25))' : '#fff',
        border: 'none',
        boxShadow: disabled ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.12)',
        flexShrink: 0,
      }}
    >
      {isAdd ? (
        <PlusOutlined style={{ fontSize: Math.round(size * 0.5) }} />
      ) : (
        <MinusOutlined style={{ fontSize: Math.round(size * 0.5) }} />
      )}
    </Button>
  );
  return title ? <Tooltip title={title}>{button}</Tooltip> : button;
});
CircleIconButton.displayName = 'CircleIconButton';

interface TagMinusCloseIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 直径 px，默认 14 */
  size?: number;
}

/**
 * Tag 内嵌红色-号删除图标（与 CircleIconButton remove 同风格）
 * 用法：<Tag closable closeIcon={<TagMinusCloseIcon />}>...</Tag>
 *
 * ★ 必须透传 antd v6 注入的 props（onClick / className / style 等）：
 *   antd v6 Tag 通过 replaceElement(cloneElement) 把关闭点击处理器直接注入
 *   closeIcon 元素本身（不再包一层 .ant-tag-close-icon span）。若此处不透传，
 *   点击处理器会被静默丢弃 → 删除按钮点了没反应（P0级交互bug）。
 */
export const TagMinusCloseIcon: React.FC<TagMinusCloseIconProps> = ({ size = 14, style, ...restProps }) => (
  <span
    {...restProps}
    style={{
      ...style,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'var(--color-danger, #ef4444)',
      color: '#fff',
      fontSize: Math.max(10, Math.round(size * 0.75)),
      lineHeight: 1,
      fontWeight: 700,
      cursor: 'pointer',
      flexShrink: 0,
    }}
  >
    −
  </span>
);

export default CircleIconButton;
