import React from 'react';
import { Button, Popconfirm, Tooltip, message } from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import PageView from './PageView';
import { MAX_PAGES } from './types';
import type { EditorPage } from './types';

/**
 * D-836：页面列（第二列）—— 页面缩略图从弹窗顶到底独立一列，
 * 不再压在素材/模版内容下面；点缩略图与右侧画布预览同步。
 * 批量导入三方式（点击/拖拽/粘贴）都落在这里。
 */
export interface EditorPagesColumnProps {
  pages: EditorPage[];
  pageIdx: number;
  onSelectPage: (i: number) => void;
  onDeletePage: (i: number) => void;
  onMovePage: (i: number, dir: -1 | 1) => void;
  /** 批量加页 —— 一次多张按顺序各成一页（单张同样走这里） */
  onAddPages: (urls: string[]) => void;
}

const EditorPagesColumn: React.FC<EditorPagesColumnProps> = ({
  pages, pageIdx, onSelectPage, onDeletePage, onMovePage, onAddPages,
}) => {
  const [uploading, setUploading] = React.useState(false);

  /**
   * 批量上传：原生 multiple input（antd 的 beforeUpload 对同批每张图各触发一次，
   * 批量合并 hack 不可靠），一次拿全且顺序稳定；拖拽/粘贴共用这里。
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

  /* 粘贴方式：编辑器打开期间，剪贴板里的图片（截图/复制的图）直接批量成页。
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
    <div
      className={`dpe-pages-col${dropActive ? ' is-dragover' : ''}`}
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
  );
};

export default EditorPagesColumn;
