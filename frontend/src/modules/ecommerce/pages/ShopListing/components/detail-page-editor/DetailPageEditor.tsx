import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, Popconfirm, Select, Space, message } from 'antd';
import {
  ClearOutlined, CloseOutlined, EyeOutlined, RedoOutlined, SaveOutlined, UndoOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/utils/api';
import EditorCanvasStage from './EditorCanvasStage';
import EditorLeftPanel from './EditorLeftPanel';
import EditorPagesColumn from './EditorPagesColumn';
import EditorRightPanel from './EditorRightPanel';
import PageView from './PageView';
import { bakePage, needsBake, uploadBlob, type ExportMode } from './exportPages';
import { blocksToPages, buildSizeTableData, newPage, settlePageAfterBgLoad } from './mapping';
import { makeSizeTableEl } from './presets';
import type { DetailBlock } from '../../types';
import type { EditorElement, EditorPage, PageTemplate } from './types';
import { MAX_PAGES, uid } from './types';
import './index.css';

/**
 * D-835：详情长图逐页编辑器（对齐竞品「批量编辑图片」）。
 *
 * <p><b>布局</b>：顶部工具栏（撤销/重做/清空/预览/关闭）· 左栏（模版/素材/文字/
 * 尺码/形状 + 页面列表）· 中间单页画布 · 右侧属性面板 · 底部操作条
 * （保存图片 / 模式 / 保存模版 / 退出编辑）。
 *
 * <p><b>保存语义</b>：把每页（底图 + 覆盖元素）烘焙成最终图片后整组替换 blocks；
 * 页面干净（无元素、底图未调）时直接沿用原图不重传。
 */
export interface DetailPageEditorProps {
  open: boolean;
  blocks: DetailBlock[];
  /** 已录入的手工尺码表（{cols,rows} JSON），「尺码」页签插入用 */
  sizeChart: string | null;
  /** 款式真实 SKU 尺码名，尺码表兜底列名 */
  sizes: string[];
  onChange: (blocks: DetailBlock[]) => void;
  onClose: () => void;
}

const TPL_KEY = 'dpe:page-templates:v1';

const loadTemplates = (): PageTemplate[] => {
  try {
    const raw = localStorage.getItem(TPL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const cloneEls = (els: EditorElement[]): EditorElement[] =>
  JSON.parse(JSON.stringify(els)).map((e: EditorElement) => ({ ...e, id: uid('el') }));

const DetailPageEditor: React.FC<DetailPageEditorProps> = ({
  open, blocks, sizeChart, sizes, onChange, onClose,
}) => {
  const [pages, setPages] = useState<EditorPage[]>([]);
  const pagesRef = useRef<EditorPage[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [exportMode, setExportMode] = useState<ExportMode>('origin');
  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [histTick, setHistTick] = useState(0);
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const blocksRef = useRef(blocks);
  const openPrevRef = useRef(false);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const setPagesHard = useCallback((next: EditorPage[]) => {
    pagesRef.current = next;
    setPages(next);
  }, []);

  /* ── 打开时初始化（只在 open 由 false→true 时做，防止父组件重渲染把编辑中的内容清掉） ── */
  useEffect(() => {
    if (open && !openPrevRef.current) {
      setPagesHard(blocksToPages(blocksRef.current));
      setPageIdx(0);
      setSel(null);
      setTemplates(loadTemplates());
      undoRef.current = [];
      redoRef.current = [];
      setExportMode('origin');
      setPreviewOpen(false);
      setExporting(null);
      setHistTick((t) => t + 1);
    }
    openPrevRef.current = open;
  }, [open, setPagesHard]);

  /* ── 历史（撤销/重做：页面 JSON 快照） ── */
  const pushHistory = useCallback(() => {
    undoRef.current.push(JSON.stringify(pagesRef.current));
    if (undoRef.current.length > 80) undoRef.current.shift();
    redoRef.current = [];
    setHistTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(JSON.stringify(pagesRef.current));
    setPagesHard(JSON.parse(prev) as EditorPage[]);
    setSel(null);
    setHistTick((t) => t + 1);
  }, [setPagesHard]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(JSON.stringify(pagesRef.current));
    setPagesHard(JSON.parse(next) as EditorPage[]);
    setSel(null);
    setHistTick((t) => t + 1);
  }, [setPagesHard]);

  const updatePages = useCallback(
    (next: EditorPage[]) => {
      pushHistory();
      setPagesHard(next);
    },
    [pushHistory, setPagesHard],
  );

  const curIdx = Math.min(pageIdx, Math.max(0, pages.length - 1));
  const cur = pages[curIdx];

  const mapCurPage = useCallback(
    (fn: (p: EditorPage) => EditorPage) => {
      updatePages(pagesRef.current.map((p, i) => (i === curIdx ? fn(p) : p)));
    },
    [curIdx, updatePages],
  );

  /* ── 元素操作 ── */
  const addElements = useCallback(
    (els: EditorElement[]) => {
      if (!els.length) return;
      mapCurPage((p) => ({ ...p, elements: [...p.elements, ...els] }));
      setSel(els[els.length - 1].id);
    },
    [mapCurPage],
  );

  const patchEl = useCallback(
    (id: string, patch: Partial<EditorElement>) => {
      mapCurPage((p) => ({
        ...p,
        elements: p.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as EditorElement) : e)),
      }));
    },
    [mapCurPage],
  );

  const deleteEl = useCallback(
    (id: string) => {
      mapCurPage((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
      setSel(null);
    },
    [mapCurPage],
  );

  const toggleLock = useCallback(
    (id: string) => {
      mapCurPage((p) => ({
        ...p,
        elements: p.elements.map((e) => (e.id === id ? ({ ...e, locked: !e.locked } as EditorElement) : e)),
      }));
    },
    [mapCurPage],
  );

  const reorderEl = useCallback(
    (action: 'top' | 'up' | 'down' | 'bottom') => {
      const id = sel;
      if (!id || id === 'bg') return;
      mapCurPage((p) => {
        const arr = [...p.elements];
        const from = arr.findIndex((e) => e.id === id);
        if (from < 0) return p;
        const [el] = arr.splice(from, 1);
        const to =
          action === 'top' ? arr.length : action === 'bottom' ? 0 : action === 'up' ? Math.min(arr.length, from + 1) : Math.max(0, from - 1);
        arr.splice(to, 0, el);
        return { ...p, elements: arr };
      });
    },
    [mapCurPage, sel],
  );

  const insertSizeTable = useCallback(() => {
    if (!cur) return;
    addElements([makeSizeTableEl(buildSizeTableData(sizeChart, sizes), cur.bgW)]);
  }, [addElements, cur, sizeChart, sizes]);

  /* ── 画布几何（拖拽/缩放）：start 压一条历史，live 只改状态 ── */
  const onGeometry = useCallback(
    (elId: string, patch: Partial<Pick<EditorElement, 'x' | 'y' | 'w' | 'h'>>, phase: 'start' | 'live' | 'end') => {
      if (phase === 'start') {
        pushHistory();
        return;
      }
      if (phase === 'live') {
        setPagesHard(
          pagesRef.current.map((p, i) =>
            i === curIdx ? { ...p, elements: p.elements.map((e) => (e.id === elId ? ({ ...e, ...patch } as EditorElement) : e)) } : p,
          ),
        );
      }
    },
    [curIdx, pushHistory, setPagesHard],
  );

  /** 底图加载后按原图尺寸定坐标系 + 重排迁移文字（加载时序不算用户操作，不入历史） */
  const onBgLoad = useCallback(
    (natW: number, natH: number) => {
      const p = pagesRef.current[curIdx];
      if (!p) return;
      const settled = settlePageAfterBgLoad(p, natW, natH);
      if (settled !== p) setPagesHard(pagesRef.current.map((pp, i) => (i === curIdx ? settled : pp)));
    },
    [curIdx, setPagesHard],
  );

  /* ── 页面操作 ── */
  /** D-836：批量加页（一次选多张图按顺序生成多页），单张也走这里 */
  const addPages = useCallback(
    (urls: string[]) => {
      if (!urls.length) return;
      const room = MAX_PAGES - pagesRef.current.length;
      if (room <= 0) {
        message.warning(`详情描述最多 ${MAX_PAGES} 页，已达上限`);
        return;
      }
      const take = urls.slice(0, room);
      const start = pagesRef.current.length;
      updatePages([...pagesRef.current, ...take.map((u) => newPage(u))]);
      setPageIdx(start); // 落在第一张新加的页上，用户能立刻看到刚导入的图
      setSel(null);
      if (take.length < urls.length) message.warning(`最多 ${MAX_PAGES} 页，超出部分未添加`);
    },
    [updatePages],
  );

  const deletePage = useCallback(
    (i: number) => {
      const next = pagesRef.current.filter((_, k) => k !== i);
      updatePages(next);
      setPageIdx((v) => Math.max(0, Math.min(v, next.length - 1)));
      setSel(null);
    },
    [updatePages],
  );

  const movePage = useCallback(
    (i: number, dir: -1 | 1) => {
      const to = i + dir;
      if (to < 0 || to >= pagesRef.current.length) return;
      const next = [...pagesRef.current];
      [next[i], next[to]] = [next[to], next[i]];
      updatePages(next);
      setPageIdx(to);
    },
    [updatePages],
  );

  const uploadBg = useCallback(
    async (file: File) => {
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        message.warning('只支持 png / jpg 格式的图片');
        return;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', fd);
        if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
        mapCurPage((p) => ({ ...p, bgUrl: res.data }));
      } catch (e) {
        message.warning(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [mapCurPage],
  );

  const patchBg = useCallback((patch: Partial<Pick<EditorPage, 'bgOpacity' | 'bgBlur'>>) => mapCurPage((p) => ({ ...p, ...patch })), [mapCurPage]);

  const batchApplyBg = useCallback(() => {
    const src = pagesRef.current[curIdx];
    if (!src) return;
    updatePages(pagesRef.current.map((p) => ({ ...p, bgOpacity: src.bgOpacity, bgBlur: src.bgBlur })));
    message.success('已应用到全部页面');
  }, [curIdx, updatePages]);

  /* ── 模版 ── */
  const saveTemplate = useCallback(() => {
    if (!cur?.elements.length) {
      message.warning('当前页没有可保存的元素');
      return;
    }
    const t: PageTemplate = {
      name: `模版 ${dayjs().format('MM-DD HH:mm')}`,
      savedAt: Date.now(),
      elements: JSON.parse(JSON.stringify(cur.elements)),
    };
    const next = [t, ...templates].slice(0, 20);
    setTemplates(next);
    try {
      localStorage.setItem(TPL_KEY, JSON.stringify(next));
    } catch {
      // 存不了（隐私模式等）也不影响编辑
    }
    message.success('已保存为模版（本机浏览器）');
  }, [cur, templates]);

  const applyTemplate = useCallback(
    (t: PageTemplate) => {
      if (!cur) return;
      const els = cloneEls(t.elements).map((e) => ({
        ...e,
        x: Math.max(0, Math.min(e.x, cur.bgW - 40)),
        y: Math.max(0, Math.min(e.y, cur.bgH - 40)),
      }));
      addElements(els);
    },
    [addElements, cur],
  );

  const deleteTemplate = useCallback(
    (name: string) => {
      const next = templates.filter((t) => t.name !== name);
      setTemplates(next);
      try {
        localStorage.setItem(TPL_KEY, JSON.stringify(next));
      } catch {
        // 同上，静默
      }
    },
    [templates],
  );

  /* ── 清空当前页元素 ── */
  const clearPage = useCallback(() => {
    mapCurPage((p) => ({ ...p, elements: [] }));
    setSel(null);
  }, [mapCurPage]);

  /* ── 保存：逐页烘焙上传，干净页沿用原图 ── */
  const handleSave = useCallback(async () => {
    const list = pagesRef.current;
    if (!list.length) {
      message.warning('详情内容为空');
      return;
    }
    setExporting({ done: 0, total: list.length });
    try {
      const out: DetailBlock[] = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!needsBake(p) && exportMode === 'origin' && p.bgUrl) {
          out.push({ type: 'image', url: p.bgUrl });
        } else if (p.bgUrl || p.elements.length > 0) {
          const blob = await bakePage(p, exportMode);
          out.push({ type: 'image', url: await uploadBlob(blob, i) });
        }
        setExporting({ done: i + 1, total: list.length });
      }
      if (!out.length) {
        message.warning('详情内容为空，没有可保存的页面');
        return;
      }
      onChange(out);
      message.success(`已保存 ${out.length} 页详情图`);
      onClose();
    } catch (e) {
      message.warning(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setExporting(null);
    }
  }, [exportMode, onChange, onClose]);

  /* ── 快捷键：Ctrl+Z / Ctrl+Shift+Z / Del / Esc ── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') setSel(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel !== 'bg') {
        const el = pagesRef.current[curIdx]?.elements.find((x) => x.id === sel);
        if (el && !el.locked) {
          e.preventDefault();
          deleteEl(sel);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sel, curIdx, undo, redo, deleteEl]);

  /* ── Esc 不关闭弹窗（D-836）：编辑器叠在「改图与数据」Drawer 里，Esc 会冒泡给
        antd Drawer 把整个弹窗关掉。在捕获阶段拦下 Escape（预览 Modal 打开时放行，
        让 Modal 自己正常关闭），关闭只能走右上角 × 或底部「退出编辑」。 ── */
  useEffect(() => {
    if (!open) return;
    const stopEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || previewOpen) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', stopEsc, true);
    return () => window.removeEventListener('keydown', stopEsc, true);
  }, [open, previewOpen]);

  if (!open) return null;

  const dirty = undoRef.current.length > 0; // histTick 变化触发重渲染以刷新该值
  void histTick;
  const closeBtn = (
    <Popconfirm title="还没保存，退出会丢失本次修改" okText="退出" cancelText="继续编辑" onConfirm={onClose} disabled={!dirty}>
      {/* dirty=false 时 Popconfirm 被 disable 不拦截点击 —— Button 必须自己接 onClose，否则退出按钮死按 */}
      <Button type="text" icon={<CloseOutlined />} aria-label="关闭编辑器" onClick={dirty ? undefined : onClose} />
    </Popconfirm>
  );

  return (
    <>
      <div className="dpe-mask" aria-hidden="true" />
      <div className="dpe-root" role="dialog" aria-label="详情长图编辑器">
      <div className="dpe-topbar">
        <Space size={4}>
          <Button type="text" icon={<UndoOutlined />} disabled={!undoRef.current.length} onClick={undo} aria-label="撤销">撤销</Button>
          <Button type="text" icon={<RedoOutlined />} disabled={!redoRef.current.length} onClick={redo} aria-label="重做">重做</Button>
          <Popconfirm title="清空当前页的所有元素？" disabled={!cur || cur.elements.length === 0} onConfirm={clearPage}>
            <Button type="text" icon={<ClearOutlined />} disabled={!cur || cur.elements.length === 0} aria-label="清空当前页">清空</Button>
          </Popconfirm>
        </Space>
        <span className="dpe-topbar__title">编辑详情长图 · 第 {curIdx + 1} / {pages.length} 页</span>
        <Space size={4}>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)} aria-label="整页预览">预览</Button>
          {closeBtn}
        </Space>
      </div>

      <div className="dpe-body">
        <EditorLeftPanel
          pageW={cur?.bgW ?? 750}
          templates={templates}
          onAddElements={addElements}
          onInsertSizeTable={insertSizeTable}
          onApplyTemplate={applyTemplate}
          onDeleteTemplate={deleteTemplate}
        />
        <EditorPagesColumn
          pages={pages}
          pageIdx={curIdx}
          onSelectPage={(i) => { setPageIdx(i); setSel(null); }}
          onDeletePage={deletePage}
          onMovePage={movePage}
          onAddPages={addPages}
        />
        <EditorCanvasStage
          page={cur}
          hasPages={pages.length > 0}
          selId={sel}
          onSelect={setSel}
          onGeometry={onGeometry}
          onBgLoad={onBgLoad}
        />
        <EditorRightPanel
          page={cur}
          pageIndex={curIdx}
          sel={sel}
          uploading={uploading}
          onUploadBg={(f) => void uploadBg(f)}
          onPatchBg={patchBg}
          onBatchApplyBg={batchApplyBg}
          onPatchEl={patchEl}
          onReorderEl={reorderEl}
          onToggleLock={toggleLock}
          onDeleteEl={deleteEl}
        />
      </div>

      <div className="dpe-bottombar">
        <Space size={8}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={!!exporting}
            onClick={() => void handleSave()}
            aria-label="保存图片"
          >
            保存图片
          </Button>
          <Select<ExportMode>
            value={exportMode}
            onChange={setExportMode}
            style={{ width: 160 }}
            disabled={!!exporting}
            options={[
              { value: 'origin', label: '模式：与原图一致' },
              { value: 'w750', label: '模式：统一宽度 750' },
            ]}
          />
          <Button onClick={saveTemplate} disabled={!cur || cur.elements.length === 0} aria-label="保存模版">
            保存模版
          </Button>
          <Popconfirm title="还没保存，退出会丢失本次修改" okText="退出" cancelText="继续编辑" onConfirm={onClose} disabled={!dirty}>
            <Button danger={dirty} onClick={dirty ? undefined : onClose}>退出编辑</Button>
          </Popconfirm>
        </Space>
        <span className="dpe-bottombar__progress">
          {exporting ? `合成中 ${exporting.done}/${exporting.total} …` : '保存后详情为一组合成图，覆盖文字会烧进图片'}
        </span>
      </div>

      <Modal open={previewOpen} title="整页预览（顾客看到的顺序）" footer={null} width={760} onCancel={() => setPreviewOpen(false)}>
        <div className="dpe-preview">
          {pages.length === 0 ? (
            <p className="dpe-preview__empty">还没有页面</p>
          ) : (
            pages.map((p, i) => (
              <div key={p.id} className="dpe-preview__item">
                <PageView page={p} zoom={660 / p.bgW} ariaLabel={`第 ${i + 1} 页预览`} />
                <div className="dpe-preview__cap">第 {i + 1} 页</div>
              </div>
            ))
          )}
        </div>
      </Modal>
      </div>
    </>
  );
};

export default DetailPageEditor;
