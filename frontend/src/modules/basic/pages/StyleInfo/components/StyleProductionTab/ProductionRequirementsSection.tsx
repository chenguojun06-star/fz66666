import React, { useEffect, useRef } from 'react';
import { Button, Space } from 'antd';
import { plainTextToSheetHtml } from '@/utils/sheetRichText';
import { message as warnMessage } from '@/utils/antdStatic';

interface Props {
  productionReqLocked: boolean;
  productionReqSaving: boolean;
  /** 生产要求内容（老数据纯文本 / 新数据轻量 HTML，含内嵌制单图片） */
  allRequirements: string;
  sheetImageMax: number;
  sheetUploading: boolean;
  /** 上传一张图片到附件库（bizType=workorder），返回 URL */
  onUploadSheetImage: (file: File) => Promise<string>;
  onProductionReqSave: () => void;
  onDownloadWorkorder: () => void;
  onPrintWorkorder: () => void;
  onOpenOcr: () => void;
  /** 编辑器内容变化（轻量 HTML） */
  onContentChange: (html: string) => void;
}

const ProductionRequirementsSection: React.FC<Props> = ({
  productionReqLocked,
  productionReqSaving,
  allRequirements,
  sheetImageMax,
  sheetUploading,
  onUploadSheetImage,
  onProductionReqSave,
  onDownloadWorkorder,
  onPrintWorkorder,
  onOpenOcr,
  onContentChange,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // 上次上报给外部的 HTML；外部新值 != 上次上报时才回写编辑器（避免打断光标）
  const lastReportedRef = useRef<string>('');
  const canEdit = !productionReqLocked;

  // 外部值 → 编辑器（初始加载 / OCR 追加 / 切换款式）
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const nextHtml = plainTextToSheetHtml(allRequirements);
    if (nextHtml !== lastReportedRef.current || el.innerHTML !== nextHtml) {
      if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
      lastReportedRef.current = nextHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRequirements]);

  const countImages = () => editorRef.current?.querySelectorAll('img').length ?? 0;

  const insertHtmlAtCaret = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertHTML', false, html);
  };

  /** 粘贴：图片文件 → 上传后插入光标处；其余一律按纯文本插入（防带样式标签） */
  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      e.preventDefault();
      const cur = countImages();
      if (cur + files.length > sheetImageMax) {
        warnMessage.warning(`图片最多 ${sheetImageMax} 张（当前 ${cur} 张）`);
        return;
      }
      for (const file of files) {
        try {
          const url = await onUploadSheetImage(file);
          insertHtmlAtCaret(`<img src="${url}" style="max-width:100%;width:240px;border:1px solid rgba(0,0,0,0.1);border-radius:4px;display:block;margin:6px 0" /><br>`);
        } catch (err) {
          warnMessage.warning(err instanceof Error ? err.message : '图片上传失败');
        }
      }
      lastReportedRef.current = editorRef.current?.innerHTML ?? '';
      onContentChange(lastReportedRef.current);
      return;
    }
    // 纯文本粘贴（去掉富文本样式）
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text) document.execCommand('insertText', false, text);
  };

  return (
    <div style={{
      border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
      borderRadius: 6,
      padding: '16px',
      marginBottom: 16,
      background: 'var(--color-bg-card, #fff)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: 0.5,
            paddingLeft: 10,
            borderLeft: '3px solid var(--color-primary)',
          }}>生产要求</span>
          {sheetUploading && <span style={{ fontSize: 12, color: 'var(--color-primary)' }}>图片上传中…</span>}
        </div>
        <Space size={8} wrap>
          {!productionReqLocked && (
            <Button type="primary" loading={productionReqSaving} onClick={onProductionReqSave}>
              保存生产要求
            </Button>
          )}
          <Button onClick={onDownloadWorkorder}>下载制单</Button>
          <Button onClick={onPrintWorkorder}>打印制单</Button>
          {!productionReqLocked && <Button onClick={onOpenOcr}>AI识别工艺单</Button>}
        </Space>
      </div>

      {canEdit && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, rgba(0,0,0,0.45))', marginBottom: 8 }}>
          在下方内容里直接 Ctrl+V 粘贴截图即可插入图片（最多 {sheetImageMax} 张），图片随文字一起保存并按顺序打印；选中图片按 Delete 可删除
        </div>
      )}

      {/* 所见即所得编辑器：图片内嵌在文字内容中 */}
      <div
        ref={editorRef}
        contentEditable={canEdit}
        suppressContentEditableWarning
        onPaste={(e) => { void handlePaste(e); }}
        onInput={() => {
          const html = editorRef.current?.innerHTML ?? '';
          lastReportedRef.current = html;
          onContentChange(html);
        }}
        onDrop={(e) => {
          // 拖拽图片文件同样上传后插入
          const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
          if (files.length > 0 && canEdit) {
            e.preventDefault();
            const evt = {
              clipboardData: { files },
              preventDefault: () => {},
            } as unknown as React.ClipboardEvent<HTMLDivElement>;
            void handlePaste(evt);
          }
        }}
        style={{
          minHeight: 320,
          maxHeight: 560,
          overflowY: 'auto',
          padding: '14px 16px',
          borderRadius: 6,
          border: '1px solid rgba(0,0,0,0.15)',
          background: '#fff',
          fontFamily: "'PingFang SC', 'Microsoft YaHei', monospace",
          fontSize: 14,
          lineHeight: '2',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
}

export default ProductionRequirementsSection;
