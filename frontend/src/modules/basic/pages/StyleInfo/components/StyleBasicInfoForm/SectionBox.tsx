import React from 'react';
import { CSSProperties } from 'react';

interface SectionBoxProps {
  title: string;
  /** 是否使用主色高亮（仅款号信息块使用） */
  usePrimaryHighlight?: boolean;
  /** 容器内联样式（默认使用 SECTION_BOX_STYLE） */
  boxStyle?: CSSProperties;
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
  children,
}) => {
  return (
    <div
      style={{
        marginBottom: 20,
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
          color: '#1f2937',
          marginBottom: 12,
          paddingLeft: 12,
          lineHeight: 1.4,
          position: 'relative',
          borderLeft: `3px solid ${usePrimaryHighlight ? 'var(--color-primary)' : '#cbd5e1'}`,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
};

export default SectionBox;
