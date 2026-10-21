import React from 'react';
import { Button, Popconfirm, Tooltip, Upload, message } from 'antd';
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
  onAddPage: (url: string) => void;
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
  onSelectPage, onDeletePage, onMovePage, onAddPage, onAddElements, onInsertSizeTable, onApplyTemplate, onDeleteTemplate,
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

  const doUpload = async (file: File) => {
    if (pages.length >= MAX_PAGES) {
      message.warning(`详情描述最多 ${MAX_PAGES} 页，已达上限`);
      return false;
    }
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      message.warning('只支持 png / jpg 格式的图片');
      return false;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', fd);
      if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
      onAddPage(res.data);
    } catch (e) {
      message.warning(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

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

      <div className="dpe-left__pages">
        <div className="dpe-left__sec-title dpe-left__sec-title--row">
          <span>页面（{pages.length}/{MAX_PAGES}）</span>
          <Upload accept="image/png,image/jpeg" showUploadList={false} beforeUpload={doUpload} disabled={uploading}>
            <Button size="small" icon={<PlusOutlined />} loading={uploading} aria-label="上传新页面底图">
              加页
            </Button>
          </Upload>
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
      </div>
    </div>
  );
};

export default EditorLeftPanel;
