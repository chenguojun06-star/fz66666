import React from 'react';
import { CSSProperties } from 'react';

interface SectionBoxProps {
  title: string;
  /** 是否使用主色高亮（仅款号信息块使用） */
  usePrimaryHighlight?: boolean;
  /** 容器内联样式（默认使用 SECTION_BOX_STYLE） */
  boxStyle?: CSSProperties;
  /** 标题右侧附加内容（如操作按钮） */
  extra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 区块容器组件：渲染统一的标题（左侧色条）+ 内容容器。
 * 替代原 StyleBasicInfoForm 中的 renderSectionTitle 与重复的 div 容器。
 */
const SectionBox: React.FC<SectionBoxProps> = ({
  title,
  usePrimaryHighlight = false,
  boxStyle,
  extra,
  children,
}) => {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: 16,
        background: 'var(--color-bg-base)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        ...(boxStyle || {}),
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-bg-dark)',
          marginBottom: 12,
          paddingLeft: 12,
          lineHeight: 1.4,
          position: 'relative',
          borderLeft: `3px solid ${usePrimaryHighlight ? 'var(--color-primary)' : 'var(--color-slate-300)'}`,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ minWidth: 0 }}>{title}</span>
        {extra ? <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{extra}</span> : null}
      </div>
      {children}
    </div>
  );
};

export default SectionBox;
