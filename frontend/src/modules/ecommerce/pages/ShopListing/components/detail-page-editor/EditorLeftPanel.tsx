import React from 'react';
import { Button, Popconfirm, Tooltip, message } from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, FontSizeOutlined,
  InsertRowBelowOutlined, PlusOutlined, TableOutlined, BgColorsOutlined, DeploymentUnitOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import PageView from './PageView';
import { SHAPE_PRESETS, STICKER_PRESETS, TEXT_PRESETS, TEXT_TEMPLATES } from './presets';
import { htmlToPlain } from './mapping';
import type { EditorElement, EditorPage, PageTemplate, ShapeElement, TextElement } from './types';
import { MAX_PAGES, uid } from './types';

/**
 * D-835：左侧面板 —— 上半是「加东西」的页签（模版/素材/文字/尺码/形状），
 * 下半是页面缩略图列表（点选切换、× 删除、上下移、上传加页）。
 * 对齐竞品「批量编辑图片」的左栏结构。
 */
export interface EditorLeftPanelProps {
  pages: EditorPage[];
  pageIdx: number;
  templates: PageTemplate[];
  onSelectPage: (i: number) => void;
  onDeletePage: (i: number) => void;
  onMovePage: (i: number, dir: -1 | 1) => void;
  /** D-836：批量加页 —— 一次选多张图按选择顺序各成一页（单张同样走这里） */
  onAddPages: (urls: string[]) => void;
  onAddElements: (els: EditorElement[]) => void;
  onInsertSizeTable: () => void;
  onApplyTemplate: (t: PageTemplate) => void;
  onDeleteTemplate: (name: string) => void;
}

type TabKey = 'tpl' | 'sticker' | 'text' | 'size' | 'shape';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'tpl', label: '模版', icon: <DeploymentUnitOutlined /> },
  { key: 'sticker', label: '素材', icon: <BgColorsOutlined /> },
  { key: 'text', label: '文字', icon: <FontSizeOutlined /> },
  { key: 'size', label: '尺码', icon: <TableOutlined /> },
  { key: 'shape', label: '形状', icon: <InsertRowBelowOutlined /> },
];

const EditorLeftPanel: React.FC<EditorLeftPanelProps> = ({
  pages, pageIdx, templates,
  onSelectPage, onDeletePage, onMovePage, onAddPages, onAddElements, onInsertSizeTable, onApplyTemplate, onDeleteTemplate,
}) => {
  const [tab, setTab] = React.useState<TabKey>('tpl');
  const [uploading, setUploading] = React.useState(false);
  const page = pages[pageIdx];
  const pageW = page?.bgW ?? 750;

  /** 文案模版 → 画布文字元素（html 转纯文本，插入当前页中部偏上） */
  const insertTplText = (html: string) => {
    const content = htmlToPlain(html);
    if (!content) return;
    const w = Math.min(600, pageW - 80);
    const el: TextElement = {
      id: uid('el'), kind: 'text', content, fontSize: 30, color: '#333333',
      align: 'center', opacity: 100, w, x: (pageW - w) / 2, y: 180,
    };
    onAddElements([el]);
  };

  /**
   * D-836：批量导入 —— 与旧版「批量上传详情图」一致，一次可多选，按选择顺序各成一页。
   * 用原生 multiple input 而不是 antd Upload：antd 的 beforeUpload 对同批每张图各触发一次，
   * 批量合并要么 hack 要么丢文件，原生 input 一次拿全且顺序稳定。
   */
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const doUpload = async (files: File[]) => {
    if (!files.length) return;
    const room = MAX_PAGES - pages.length;
    if (room <= 0) {
      message.warning(`详情描述最多 ${MAX_PAGES} 页，已达上限`);
      return;
    }
    const ok = files.filter((f) => /^image\/(png|jpeg)$/.test(f.type));
    if (!ok.length) {
      message.warning('只支持 png / jpg 格式的图片');
      return;
    }
    const take = ok.slice(0, room);
    if (take.length < ok.length) message.warning(`最多还能加 ${room} 页，已只取前 ${room} 张`);
    setUploading(true);
    const urls: string[] = [];
    for (const f of take) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', fd);
        if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
        urls.push(res.data);
      } catch (e) {
        message.warning(`「${f.name}」上传失败：${e instanceof Error ? e.message : '未知错误'}`);
      }
    }
    setUploading(false);
    if (urls.length) onAddPages(urls);
  };

  /* ③ 粘贴方式：编辑器打开期间，剪贴板里的图片（截图/复制的图）直接批量成页。
        焦点在输入框/富文本里时让位给正常文本粘贴，不抢。 */
  const [dropActive, setDropActive] = React.useState(false);
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!imgs.length) return;
      e.preventDefault();
      void doUpload(imgs);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [doUpload]);

  return (
    <div className="dpe-left">
      <div className="dpe-left__tabs" role="tablist" aria-label="添加元素">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`dpe-left__tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="dpe-left__content">
        {tab === 'tpl' && (
          <>
            <div className="dpe-left__sec-title">内置文案模版</div>
            {TEXT_TEMPLATES.map((t) => (
              <button key={t.key} type="button" className="dpe-left__item" onClick={() => insertTplText(t.html)}>
                {t.label}
              </button>
            ))}
            <div className="dpe-left__sec-title">我的模版（本机保存）</div>
            {templates.length === 0 ? (
              <div className="dpe-left__empty">点底部「保存模版」把当前页版式存下来，换图直接套用</div>
            ) : (
              templates.map((t) => (
                <div key={t.name} className="dpe-left__item dpe-left__item--row">
                  <button type="button" className="dpe-left__item-main" onClick={() => onApplyTemplate(t)} title={t.name}>
                    {t.name}
                  </button>
                  <Popconfirm title="删除这个模版？" onConfirm={() => onDeleteTemplate(t.name)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`删除模版 ${t.name}`} />
                  </Popconfirm>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'sticker' && (
          <>
            <div className="dpe-left__sec-title">装饰元素（点击加到画布）</div>
            {STICKER_PRESETS.map((s) => (
              <button key={s.key} type="button" className="dpe-left__item" onClick={() => onAddElements([s.make(pageW)])}>
                {s.label}
              </button>
            ))}
          </>
        )}

        {tab === 'text' && (
          <>
            <div className="dpe-left__sec-title">点击插入文字</div>
            {TEXT_PRESETS.map((p) => (
              <button key={p.key} type="button" className="dpe-left__item" onClick={() => onAddElements([p.make(pageW)])}>
                {p.label}
              </button>
            ))}
          </>
        )}

        {tab === 'size' && (
          <div className="dpe-left__empty">
            点击下方按钮，把已录入的尺码表作为表格元素放到画布上（右侧面板可改数字）。
            <Button
              type="primary"
              size="small"
              block
              icon={<TableOutlined />}
              className="dpe-left__cta"
              onClick={onInsertSizeTable}
              aria-label="插入尺码表"
            >
              插入尺码表
            </Button>
          </div>
        )}

        {tab === 'shape' && (
          <>
            <div className="dpe-left__sec-title">基础形状</div>
            {SHAPE_PRESETS.map((s) => (
              <button
                key={s.key}
                type="button"
                className="dpe-left__item"
                onClick={() => {
                  const el: ShapeElement = {
                    id: uid('el'), kind: 'shape', shape: s.key, color: s.color,
                    x: (pageW - s.w) / 2, y: 260, w: s.w, h: s.h, opacity: 100,
                  };
                  onAddElements([el]);
                }}
              >
                {s.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* D-836：页面导入区对齐通用上传三方式（ImageUploadBox 的 enableDrop 模式）——
          ① 点击「批量加图」选文件；② 直接把图片拖到这里；③ Ctrl+V 粘贴截图/复制的图。
          拖拽/粘贴都走同一个 doUpload(files)，一次多张按顺序各成一页。 */}
      <div
        className={`dpe-left__pages${dropActive ? ' is-dragover' : ''}`}
        onDragOver={(e) => {
          if (uploading || !Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropActive(false);
        }}
        onDrop={(e) => {
          setDropActive(false);
          if (uploading) return;
          const fs = Array.from(e.dataTransfer.files ?? []);
          if (!fs.length) return;
          e.preventDefault();
          void doUpload(fs);
        }}
      >
        <div className="dpe-left__sec-title dpe-left__sec-title--row">
          <span>页面（{pages.length}/{MAX_PAGES}）</span>
          {/* ① 点击方式：multiple 一次多选，选完按顺序批量成页；上传中可中断重复点击 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            hidden
            aria-label="批量上传页面底图"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              e.target.value = '';
              void doUpload(fs);
            }}
          />
          <Button size="small" icon={<PlusOutlined />} loading={uploading} disabled={uploading} onClick={() => fileInputRef.current?.click()} aria-label="批量加图">
            批量加图
          </Button>
        </div>
        <div className="dpe-left__page-list">
          {pages.map((p, i) => (
            <div key={p.id} className={`dpe-left__page${i === pageIdx ? ' is-on' : ''}`}>
              <button type="button" className="dpe-left__page-thumb" onClick={() => onSelectPage(i)} aria-label={`切换到第 ${i + 1} 页`}>
                <span className="dpe-left__page-no">{`详情图${i + 1}`}</span>
                <PageView page={p} zoom={144 / p.bgW} />
              </button>
              <span className="dpe-left__page-ops">
                <Tooltip title="上移">
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => onMovePage(i, -1)} />
                </Tooltip>
                <Tooltip title="下移">
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === pages.length - 1} onClick={() => onMovePage(i, 1)} />
                </Tooltip>
                <Popconfirm title={`删除「详情图${i + 1}」？`} onConfirm={() => onDeletePage(i)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`删除第 ${i + 1} 页`} />
                </Popconfirm>
              </span>
            </div>
          ))}
        </div>
        <div className="dpe-left__drop-hint">
          点击「批量加图」、把图片<b>拖到这里</b>、或 <b>Ctrl+V 粘贴</b>截图，均可一次导入多张
        </div>
      </div>
    </div>
  );
};

export default EditorLeftPanel;
