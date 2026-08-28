import React, { useMemo } from 'react';
import { sanitizeSheetRichHtml } from '@/utils/sheetRichText';

interface Props {
  /** 工艺说明原文（老数据纯文本 / 新数据轻量 HTML），剥脏行+白名单清洗后按文档渲染 */
  content: string;
  minHeight?: number;
  imgMaxWidth?: number;
  emptyText?: string;
  style?: React.CSSProperties;
}

/**
 * 工艺说明只读文档视图（D-187）：
 * 样衣开发端富文本编辑的内容在下游（质检详情/入库详情等）统一用此组件展示——
 * 用户输入什么就显示什么（含加粗/对齐/表格/内嵌图片），不再是逐行表格。
 */
const SheetRichViewer: React.FC<Props> = ({
  content, minHeight = 120, imgMaxWidth = 320, emptyText = '暂无工艺说明', style,
}) => {
  const html = useMemo(() => sanitizeSheetRichHtml(content, {
    imgStyle: `max-width:100%;width:${imgMaxWidth}px;object-fit:contain;border:1px solid rgba(0,0,0,0.08);border-radius:6px;display:block;margin:6px 0`,
  }), [content, imgMaxWidth]);

  if (!String(content ?? '').trim()) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)', ...style }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div
      className="sheet-rich-viewer"
      style={{
        padding: '14px 16px',
        border: '1px solid var(--color-border-light, rgba(0,0,0,0.08))',
        borderRadius: 6,
        background: 'var(--color-bg-container, #fff)',
        fontSize: 14,
        lineHeight: 1.9,
        minHeight,
        overflowX: 'auto',
        wordBreak: 'break-word',
        ...style,
      }}
      // 内容已经 sheetRichText 白名单清洗（标签+样式属性+URL 三层过滤），无用户脚本注入面
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default SheetRichViewer;
