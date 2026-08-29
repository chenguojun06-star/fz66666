import React, { useEffect, useRef, useState } from 'react';
import { Button, ColorPicker, InputNumber, Popover, Select, Space, Tooltip, Dropdown } from 'antd';
import {
  AlignCenterOutlined, AlignLeftOutlined, AlignRightOutlined, BoldOutlined,
  ClearOutlined, FullscreenExitOutlined, FullscreenOutlined, ItalicOutlined,
  OrderedListOutlined, PictureOutlined, RedoOutlined, StrikethroughOutlined,
  TableOutlined, UnderlineOutlined, UndoOutlined, UnorderedListOutlined, DownOutlined } from '@ant-design/icons';
import { plainTextToSheetHtml, isSheetRichHtml } from '@/utils/sheetRichText';
import { message as warnMessage } from '@/utils/antdStatic';

interface Props {
  productionReqLocked: boolean;
  productionReqSaving: boolean;
  /** 工艺说明内容（老数据纯文本 / 新数据轻量 HTML，含内嵌制单图片） */
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

/**
 * 工艺说明编辑器（D-187 前叫"生产要求"，仅裸编辑区）：
 * 图二样式的格式工具栏——撤销/重做、段落标题、加粗/斜体/下划线/删除线、
 * 字色/底色、对齐、缩进、列表、清除格式、插入表格、插图、全屏；
 * 内容仍为轻量 HTML 存 style.description，下游只读展示（SheetRichViewer）与打印同源。
 */
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
  // 工具栏点击（颜色面板等弹层）会让编辑器失焦丢选区，持续缓存编辑器内最后一个非折叠选区
  const savedRangeRef = useRef<Range | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [tableRows, setTableRows] = useState<number>(3);
  const [tableCols, setTableCols] = useState<number>(3);
  const [tableOpen, setTableOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const canEdit = !productionReqLocked;

  // 外部值 → 编辑器（初始加载 / OCR 追加 / 切换款式）。
  // 双方都过一遍 plainTextToSheetHtml 再比较：自己上报的原始 innerHTML 回声不会被误判为外部变更
  // （D-188 修正——旧版直接比原文，格式化内容回声时被判为"外部变了"，整段转义后覆盖编辑器即乱码）。
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const nextHtml = plainTextToSheetHtml(allRequirements);
    if (plainTextToSheetHtml(lastReportedRef.current) === nextHtml) return;
    el.innerHTML = nextHtml;
    lastReportedRef.current = nextHtml;
  }, [allRequirements]);

  // 缓存编辑器内的选区（仅非折叠），供工具栏弹层收走焦点后恢复
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      const el = editorRef.current;
      if (sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode) && !sel.isCollapsed) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, []);

  /** 焦点回编辑器：选区已丢（点过颜色面板等弹层）则恢复缓存选区 */
  const focusEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const inside = !!sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);
    if (!inside && savedRangeRef.current && el.contains(savedRangeRef.current.startContainer)) {
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
  };

  const countImages = () => editorRef.current?.querySelectorAll('img').length ?? 0;

  const insertHtmlAtCaret = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    focusEditor();
    document.execCommand('insertHTML', false, html);
    // 表格/图片等插入后立即上报，否则用户插完直接保存会丢内容
    lastReportedRef.current = el.innerHTML;
    onContentChange(el.innerHTML);
  };

  /** 执行格式命令并回吐内容（工具栏统一入口） */
  const exec = (cmd: string, value?: string) => {
    const el = editorRef.current;
    if (!el || !canEdit) return;
    focusEditor();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, value);
    lastReportedRef.current = el.innerHTML;
    onContentChange(el.innerHTML);
  };

  /** 插入一张已上传图片（按钮选择 + 粘贴共用） */
  const insertUploadedImage = async (file: File) => {
    const cur = countImages();
    if (cur + 1 > sheetImageMax) {
      warnMessage.warning(`图片最多 ${sheetImageMax} 张（当前 ${cur} 张）`);
      return;
    }
    try {
      const url = await onUploadSheetImage(file);
      insertHtmlAtCaret(`<img src="${url}" style="max-width:100%;width:240px;border:1px solid rgba(0,0,0,0.1);border-radius:4px;display:block;margin:6px 0" /><br>`);
    } catch (err) {
      warnMessage.warning(err instanceof Error ? err.message : '图片上传失败');
    }
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
        await insertUploadedImage(file);
      }
      return;
    }
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    // D-169：Word 形状/网页复制得到的纯文本常是转义HTML串（&lt;div…&gt; 甚至 &amp;lt;…）——
    // 解码+白名单清洗后按富文本插入，不再作为裸文字进编辑器
    if (text.includes('&lt;') || text.includes('&amp;') || /<\s*(div|p|span|table)\b/i.test(text)) {
      const healed = plainTextToSheetHtml(text);
      if (isSheetRichHtml(healed)) {
        insertHtmlAtCaret(healed);
        return;
      }
    }
    document.execCommand('insertText', false, text);
  };

  const insertTable = () => {
    const rows = Math.min(Math.max(tableRows || 2, 1), 20);
    const cols = Math.min(Math.max(tableCols || 2, 1), 10);
    const cell = '<td style="border:1px solid rgba(0,0,0,0.25);padding:4px 10px;min-width:36px">&nbsp;</td>';
    const body = Array.from({ length: rows }, () => `<tr>${cell.repeat(cols)}</tr>`).join('');
    insertHtmlAtCaret(`<table style="border-collapse:collapse;min-width:30%">${body}</table><br>`);
    setTableOpen(false);
  };

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flexWrap: 'wrap',
    padding: '6px 8px',
    border: '1px solid rgba(0,0,0,0.12)',
    borderBottom: 'none',
    borderRadius: '6px 6px 0 0',
    background: 'rgba(0,0,0,0.02)',
  };
  const toolBtn = { size: 'small' as const, disabled: !canEdit };

  const editorWrapStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed', inset: 0, zIndex: 1100, background: '#fff',
        padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }
    : {};

  return (
    <div style={{
      border: fullscreen ? 'none' : '1px solid var(--color-border, rgba(0,0,0,0.1))',
      borderRadius: 6,
      padding: '16px',
      marginBottom: 16,
      background: 'var(--color-bg-card, #fff)',
      ...editorWrapStyle,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: 0.5,
            paddingLeft: 10,
            borderLeft: '3px solid var(--color-primary)',
          }}>工艺说明</span>
          {sheetUploading && <span style={{ fontSize: 12, color: 'var(--color-primary)' }}>图片上传中…</span>}
        </div>
        <Space size={8} wrap>
          {!productionReqLocked && (
            <Button type="primary" loading={productionReqSaving} onClick={onProductionReqSave}>
              保存工艺说明
            </Button>
          )}
          <Dropdown
            menu={{
              items: [
                { key: 'download', label: '下载制单' },
                { key: 'print', label: '打印制单' },
                ...(productionReqLocked ? [] : [{ key: 'ocr', label: 'AI识别工艺单' }]),
              ],
              onClick: ({ key }) => {
                if (key === 'download') onDownloadWorkorder();
                else if (key === 'print') onPrintWorkorder();
                else onOpenOcr();
              },
            }}
          >
            <Button>
              制单 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      </div>

      {canEdit && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, rgba(0,0,0,0.45))', marginBottom: 8 }}>
          推荐在 800 宽度内填写内容，超出可预览范围过多会导致打印出来的内容被截断；Ctrl+V 可直接粘贴截图（最多 {sheetImageMax} 张），选中图片按 Delete 可删除
        </div>
      )}

      {/* 格式工具栏（对齐图二样式） */}
      {canEdit && (
        <div style={toolbarStyle}>
          <Tooltip title="撤销"><Button {...toolBtn} type="text" icon={<UndoOutlined />} onClick={() => exec('undo')} /></Tooltip>
          <Tooltip title="重做"><Button {...toolBtn} type="text" icon={<RedoOutlined />} onClick={() => exec('redo')} /></Tooltip>
          <Select
            size="small" style={{ width: 92, margin: '0 6px' }} disabled={!canEdit}
            defaultValue="p" placeholder="段落"
            onChange={(v) => exec('formatBlock', v === 'p' ? '<p>' : `<${v}>`)}
            options={[
              { value: 'p', label: '段落' },
              { value: 'h1', label: '标题1' },
              { value: 'h2', label: '标题2' },
              { value: 'h3', label: '标题3' },
            ]}
          />
          <Tooltip title="加粗"><Button {...toolBtn} type="text" icon={<BoldOutlined />} onClick={() => exec('bold')} /></Tooltip>
          <Tooltip title="斜体"><Button {...toolBtn} type="text" icon={<ItalicOutlined />} onClick={() => exec('italic')} /></Tooltip>
          <Tooltip title="下划线"><Button {...toolBtn} type="text" icon={<UnderlineOutlined />} onClick={() => exec('underline')} /></Tooltip>
          <Tooltip title="删除线"><Button {...toolBtn} type="text" icon={<StrikethroughOutlined />} onClick={() => exec('strikeThrough')} /></Tooltip>
          {/* ColorPicker 自带弹层，children 即触发按钮；旧版外面再套一层 Popover 导致要点两次还丢选区 */}
          <ColorPicker
            disabledAlpha
            onChange={(c) => exec('foreColor', c.toHexString())}
            presets={[{ label: '常用', colors: ['#000000', '#8c8c8c', '#f5222d', '#fa541c', '#faad14', '#52c41a', '#1677ff', '#722ed1'] }]}
          >
            <Tooltip title="文字颜色"><Button {...toolBtn} type="text">A<span style={{ color: '#f5222d' }}>▾</span></Button></Tooltip>
          </ColorPicker>
          <ColorPicker
            disabledAlpha
            onChange={(c) => exec('hiliteColor', c.toHexString())}
            presets={[{ label: '底色', colors: ['#ffffff', '#fff1b8', '#ffd6e7', '#d6f0ff', '#d9f7be', '#efdbff'] }]}
          >
            <Tooltip title="背景色"><Button {...toolBtn} type="text">██<span>▾</span></Button></Tooltip>
          </ColorPicker>
          <span style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Tooltip title="左对齐"><Button {...toolBtn} type="text" icon={<AlignLeftOutlined />} onClick={() => exec('justifyLeft')} /></Tooltip>
          <Tooltip title="居中"><Button {...toolBtn} type="text" icon={<AlignCenterOutlined />} onClick={() => exec('justifyCenter')} /></Tooltip>
          <Tooltip title="右对齐"><Button {...toolBtn} type="text" icon={<AlignRightOutlined />} onClick={() => exec('justifyRight')} /></Tooltip>
          <Tooltip title="两端对齐"><Button {...toolBtn} type="text" onClick={() => exec('justifyFull')}>两端</Button></Tooltip>
          <Tooltip title="减少缩进"><Button {...toolBtn} type="text" onClick={() => exec('outdent')}>⇤</Button></Tooltip>
          <Tooltip title="增加缩进"><Button {...toolBtn} type="text" onClick={() => exec('indent')}>⇥</Button></Tooltip>
          <Tooltip title="符号列表"><Button {...toolBtn} type="text" icon={<UnorderedListOutlined />} onClick={() => exec('insertUnorderedList')} /></Tooltip>
          <Tooltip title="编号列表"><Button {...toolBtn} type="text" icon={<OrderedListOutlined />} onClick={() => exec('insertOrderedList')} /></Tooltip>
          <Tooltip title="清除格式"><Button {...toolBtn} type="text" icon={<ClearOutlined />} onClick={() => exec('removeFormat')} /></Tooltip>
          <span style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Popover
            trigger="click" open={tableOpen} onOpenChange={setTableOpen}
            content={(
              <Space>
                <InputNumber size="small" min={1} max={20} value={tableRows} onChange={(v) => setTableRows(v || 3)} addonBefore="行" style={{ width: 110 }} />
                <InputNumber size="small" min={1} max={10} value={tableCols} onChange={(v) => setTableCols(v || 3)} addonBefore="列" style={{ width: 110 }} />
                <Button size="small" type="primary" onClick={insertTable}>插入</Button>
              </Space>
            )}
          >
            <Tooltip title="插入表格"><Button {...toolBtn} type="text" icon={<TableOutlined />} /></Tooltip>
          </Popover>
          <Tooltip title="插入图片"><Button {...toolBtn} type="text" icon={<PictureOutlined />} loading={sheetUploading} onClick={() => imageInputRef.current?.click()} /></Tooltip>
          <input
            ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void insertUploadedImage(file);
              e.target.value = '';
            }}
          />
          <Tooltip title={fullscreen ? '退出全屏' : '全屏编辑'}>
            <Button {...toolBtn} type="text" icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={() => setFullscreen(!fullscreen)} />
          </Tooltip>
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
          minHeight: fullscreen ? undefined : 320,
          maxHeight: fullscreen ? undefined : 560,
          flex: fullscreen ? 1 : undefined,
          overflowY: 'auto',
          padding: '14px 16px',
          borderRadius: canEdit ? '0 0 6px 6px' : 6,
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
};

export default ProductionRequirementsSection;
