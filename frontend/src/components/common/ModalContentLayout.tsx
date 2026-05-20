import React, { CSSProperties } from 'react';

/**
 * 通用弹窗内容布局组件
 * 统一字体、间距、布局等视觉规范
 *
 * 使用场景：所有 ResizableModal 内的内容
 * 目的：只统一字体、布局、间距等样式，不影响具体业务内容
 */

// ================ 头部卡片容器（灰色背景） ================
interface HeaderCardProps {
  children: React.ReactNode;
  isMobile?: boolean;
  style?: CSSProperties;
}

export const ModalHeaderCard: React.FC<HeaderCardProps> = ({ children, isMobile = false, style }) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: isMobile ? 10 : 12,
        padding: isMobile ? 8 : 10,
        background: 'var(--color-bg-gray)',
        borderRadius: 12,
        marginBottom: 10,
        maxWidth: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ================ 字段显示组（标签 + 值） ================
interface FieldProps {
  label: string;
  value: React.ReactNode;
  labelSize?: number;
  valueSize?: number;
  valueWeight?: number;
  valueColor?: string;
  style?: CSSProperties;
}

export const ModalField: React.FC<FieldProps> = ({
  label,
  value,
  valueWeight = 600,
  valueColor = 'var(--neutral-text)',
  style,
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2, minWidth: 0, maxWidth: '100%', ...style }}>
      <span
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--neutral-text-light)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--font-size-base)',
          fontWeight: valueWeight,
          color: valueColor,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
};

// ================ 重点字段（更大字号） ================
interface PrimaryFieldProps {
  label: string;
  value: React.ReactNode;
  valueSize?: number;
  style?: CSSProperties;
}

export const ModalPrimaryField: React.FC<PrimaryFieldProps> = ({
  label,
  value,
  style,
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2, minWidth: 0, maxWidth: '100%', ...style }}>
      <span style={{ fontSize: 'var(--font-size-base)', color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{label}</span>
      <span
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 700,
          color: 'var(--neutral-text)',
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
};

// ================ 字段行容器 ================
interface FieldRowProps {
  children: React.ReactNode;
  label?: string;
  isMobile?: boolean;
  gap?: number;
  style?: CSSProperties;
}

export const ModalFieldRow: React.FC<FieldRowProps> = ({
  children,
  label,
  isMobile = false,
  gap = 24,
  style,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: Math.max(8, gap - 8),
        flexWrap: 'wrap',
        marginBottom: isMobile ? 6 : 10,
        maxWidth: '100%',
        ...style,
      }}
    >
      {label && (
        <span style={{ minWidth: 80, color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
};

// ================ 网格字段容器（适合多个字段） ================
interface FieldGridProps {
  children: React.ReactNode;
  isMobile?: boolean;
  columns?: number;
  style?: CSSProperties;
}

export const ModalFieldGrid: React.FC<FieldGridProps> = ({
  children,
  isMobile = false,
  columns = 3,
  style,
}) => {
  return (
    <div
      style={{
        padding: 6,
        background: 'var(--neutral-white)',
        borderRadius: 8,
        border: '1px solid var(--table-border-color)',
        maxWidth: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : `repeat(${columns}, 1fr)`,
          gap: isMobile ? '4px 6px' : '4px 8px',
          maxWidth: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ================ 信息卡片容器（白色背景带边框） ================
interface InfoCardProps {
  children: React.ReactNode;
  padding?: number;
  style?: CSSProperties;
}

export const ModalInfoCard: React.FC<InfoCardProps> = ({ children, padding = 6, style }) => {
  return (
    <div
      style={{
        padding: Math.max(4, padding - 2),
        background: 'var(--neutral-white)',
        borderRadius: 12,
        border: '2px solid var(--table-border-color)',
        boxShadow: 'var(--shadow-sm)',
        maxWidth: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ================ 左右布局容器（左侧图片+二维码，右侧信息） ================
interface SideLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  style?: CSSProperties;
}

export const ModalSideLayout: React.FC<SideLayoutProps> = ({ left, right, style }) => {
  return (
    <div style={{ display: 'flex', gap: 16, maxWidth: '100%', overflow: 'hidden', ...style }}>
      {left}
      <div style={{ flex: 1, minWidth: 0, maxWidth: '100%' }}>{right}</div>
    </div>
  );
};

// ================ 垂直内容栏（用于左侧图片/二维码组合） ================
interface VerticalStackProps {
  children: React.ReactNode;
  gap?: number;
  align?: 'flex-start' | 'center' | 'flex-end';
  style?: CSSProperties;
}

export const ModalVerticalStack: React.FC<VerticalStackProps> = ({
  children,
  gap = 8,
  align = 'center',
  style,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        gap,
        maxWidth: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ================ 段落标题 ================
interface SectionTitleProps {
  children: React.ReactNode;
  size?: number;
  style?: CSSProperties;
}

export const ModalSectionTitle: React.FC<SectionTitleProps> = ({ children, style }) => {
  return (
    <div
      style={{
        fontSize: 'var(--font-size-base)',
        fontWeight: 700,
        color: 'var(--neutral-text)',
        marginTop: 10,
        marginBottom: 6,
        maxWidth: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ================ 默认导出所有组件 ================
const ModalContentLayout = {
  HeaderCard: ModalHeaderCard,
  Field: ModalField,
  PrimaryField: ModalPrimaryField,
  FieldRow: ModalFieldRow,
  FieldGrid: ModalFieldGrid,
  InfoCard: ModalInfoCard,
  SideLayout: ModalSideLayout,
  VerticalStack: ModalVerticalStack,
  SectionTitle: ModalSectionTitle,
};

export default ModalContentLayout;
