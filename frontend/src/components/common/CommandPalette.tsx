import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Upload } from 'antd';
import {
  AppstoreOutlined,
  CloseOutlined,
  FileTextOutlined,
  PictureOutlined,
  RightOutlined,
  RobotOutlined,
  SearchOutlined,
  SkinOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { globalSearchApi } from '@/services/production/productionApi';
import type { GlobalSearchOrderItem, GlobalSearchStyleItem, GlobalSearchWorkerItem } from '@/services/production/productionApi';
import { menuConfig } from '@/routeConfig';
import SmartImage from './SmartImage';
import api from '@/utils/api';
import './CommandPalette.css';

// ─── 类型 ─────────────────────────────────────────────────────

type ResultItem =
  | { kind: 'order';  data: GlobalSearchOrderItem }
  | { kind: 'style';  data: GlobalSearchStyleItem }
  | { kind: 'worker'; data: GlobalSearchWorkerItem }
  | { kind: 'menu';   data: { label: string; path: string; section: string; icon?: React.ReactNode } }
  | { kind: 'imageStyle'; data: { id: number; styleNo: string; styleName: string; category: string; coverUrl: string; similarity?: number } };

// ─── 常量 ─────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending:    '#8b5cf6',
  production: '#0ea5e9',
  completed:  '#22c55e',
  delayed:    '#f59e0b',
  scrapped:   '#6b7280',
  cancelled:  '#6b7280',
  canceled:   '#6b7280',
  paused:     '#f59e0b',
  returned:   '#fa8c16',
};

const STATUS_LABEL_ZH: Record<string, string> = {
  pending:    '待生产',
  production: '生产中',
  completed:  '已完成',
  delayed:    '已逾期',
  scrapped:   '已报废',
  cancelled:  '已取消',
  canceled:   '已取消',
  paused:     '已暂停',
  returned:   '已退回',
};

// ─── 菜单索引构建 ─────────────────────────────────────────────

interface MenuEntry {
  label: string;
  path: string;
  section: string;
  icon?: React.ReactNode;
  keywords: string[];
}

function buildMenuIndex(): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const section of menuConfig) {
    if (section.items) {
      for (const item of section.items) {
        entries.push({
          label: item.label,
          path: item.path,
          section: section.title,
          icon: item.icon,
          keywords: [item.label, section.title, item.path].filter(Boolean),
        });
      }
    } else if (section.path) {
      entries.push({
        label: section.title,
        path: section.path,
        section: section.title,
        icon: section.icon,
        keywords: [section.title, section.path].filter(Boolean),
      });
    }
  }
  return entries;
}

const MENU_INDEX = buildMenuIndex();

// ─── 主组件 ───────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type SearchTab = 'all' | 'menu' | 'image';

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate  = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  const [query,     setQuery]     = useState('');
  const [items,     setItems]     = useState<ResultItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [imageSearchMode, setImageSearchMode] = useState(false);
  const [imageSearchLoading, setImageSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef    = useRef<AbortController | null>(null);

  // 打开时聚焦 + 重置
  useEffect(() => {
    if (open) {
      setQuery('');
      setItems([]);
      setActiveIdx(0);
      setActiveTab('all');
      setImageSearchMode(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 菜单搜索（纯前端）
  const searchMenu = useCallback((q: string): ResultItem[] => {
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    return MENU_INDEX
      .filter(entry => entry.keywords.some(kw => kw.toLowerCase().includes(lower)))
      .slice(0, 8)
      .map(entry => ({ kind: 'menu' as const, data: entry }));
  }, []);

  // 搜索（防抖 250ms）
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setItems([]); setLoading(false); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await globalSearchApi.search(q) as any;
      if (res?.code === 200 && res?.data) {
        const d = res.data;
        const menuResults = activeTab === 'image' ? [] : searchMenu(q);
        const flat: ResultItem[] = [
          ...menuResults,
          ...(d.orders  || []).map((o: GlobalSearchOrderItem)  => ({ kind: 'order'  as const, data: o })),
          ...(d.styles  || []).map((s: GlobalSearchStyleItem)  => ({ kind: 'style'  as const, data: s })),
          ...(d.workers || []).map((w: GlobalSearchWorkerItem) => ({ kind: 'worker' as const, data: w })),
        ];
        setItems(flat);
        setActiveIdx(0);
      }
    } catch (_e) {
      // 搜索失败静默处理
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchMenu]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length > 0) {
      debounceRef.current = setTimeout(() => doSearch(query), 250);
    } else {
      setItems([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  // 图片搜款
  const handleImageSearch = useCallback(async (file: File) => {
    setImageSearchLoading(true);
    setImageSearchMode(true);
    setItems([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('topK', '8');
      const res = await api.post('/intelligence/visual/style-search', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res?.code === 200 && Array.isArray(res?.data?.results)) {
        const imageResults: ResultItem[] = (res.data.results as any[]).map(s => ({
          kind: 'imageStyle' as const,
          data: {
            id: s.id,
            styleNo: s.styleNo || '',
            styleName: s.styleName || '',
            category: s.category || '',
            coverUrl: s.coverUrl || s.imageUrl || '',
            similarity: s.similarity ?? s.score,
          },
        }));
        setItems(imageResults);
        setActiveIdx(0);
      } else {
        setItems([]);
      }
    } catch (e) {
      console.warn('[CmdK] 图片搜款失败:', e);
      setItems([]);
    } finally {
      setImageSearchLoading(false);
    }
  }, []);

  // 粘贴图片搜款
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageSearch(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [open, handleImageSearch]);

  // 导航到对应路径
  const navigateTo = useCallback((item: ResultItem) => {
    onClose();
    if (item.kind === 'order') {
      navigate(`/production?orderNo=${encodeURIComponent(item.data.orderNo)}`);
    } else if (item.kind === 'style') {
      navigate(`/style-info?styleNo=${encodeURIComponent(item.data.styleNo)}`);
    } else if (item.kind === 'worker') {
      navigate(`/system/user?name=${encodeURIComponent(item.data.name)}`);
    } else if (item.kind === 'menu') {
      navigate(item.data.path);
    } else if (item.kind === 'imageStyle') {
      navigate(`/style-info?styleNo=${encodeURIComponent(item.data.styleNo)}`);
    }
  }, [navigate, onClose]);

  const askAiAssistant = useCallback(() => {
    onClose();
    window.dispatchEvent(new CustomEvent('openAiChat', { detail: { query } }));
  }, [onClose, query]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[activeIdx]) {
      navigateTo(items[activeIdx]);
    }
  }, [items, activeIdx, onClose, navigateTo]);

  // 滚动当前 item 到视图内
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const activeEl = listEl.querySelector<HTMLElement>('.cp-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  if (!open) return null;

  // ─── 渲染结果分组 ─────────────────────────────────────────

  const menus      = items.filter(i => i.kind === 'menu');
  const orders     = items.filter(i => i.kind === 'order');
  const styles     = items.filter(i => i.kind === 'style');
  const workers    = items.filter(i => i.kind === 'worker');
  const imageStyles = items.filter(i => i.kind === 'imageStyle');

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal-wide" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} role="dialog" aria-label="全局搜索">
        {/* ── 搜索框 ── */}
        <div className="cp-input-row">
          {imageSearchMode ? (
            <PictureOutlined className="cp-search-icon" style={{ color: '#a855f7' }} />
          ) : (
            <SearchOutlined className="cp-search-icon" />
          )}
          <input
            ref={inputRef}
            className="cp-input"
            placeholder={imageSearchMode ? '图片搜款结果 — 输入文字切换回普通搜索…' : '搜索菜单 · 订单号 · 款式 · 工人…  粘贴图片可搜款'}
            value={query}
            onChange={e => { setQuery(e.target.value); if (imageSearchMode) setImageSearchMode(false); }}
            autoComplete="off"
            spellCheck={false}
          />
          {(loading || imageSearchLoading) && <Spin style={{ marginRight: 8 }} size="small" />}
          {!loading && !imageSearchLoading && (query || imageSearchMode) && (
            <button type="button" className="cp-clear" onClick={() => { setQuery(''); setItems([]); setImageSearchMode(false); inputRef.current?.focus(); }}>
              <CloseOutlined style={{ fontSize: 13 }} />
            </button>
          )}

          {/* 图片上传按钮 */}
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => { handleImageSearch(file); return false; }}
          >
            <button type="button" className="cp-img-btn" title="上传图片搜款">
              <UploadOutlined style={{ fontSize: 14 }} />
            </button>
          </Upload>

          <kbd className="cp-kbd">ESC</kbd>
        </div>

        {/* ── 快捷标签 ── */}
        {!query.trim() && !imageSearchMode && (
          <div className="cp-quick-tags">
            <span className="cp-quick-label">快速跳转</span>
            {MENU_INDEX.slice(0, 10).map((entry, i) => (
              <button
                key={i}
                className="cp-quick-tag"
                onClick={() => { onClose(); navigate(entry.path); }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {/* ── 结果列表 ── */}
        <div ref={listRef} className="cp-list">
          {!query.trim() && !imageSearchMode && (
            <div className="cp-empty-hint">
              <AppstoreOutlined style={{ fontSize: 16, marginBottom: 8, opacity: 0.3 }} />
              <div>输入关键词搜索，或粘贴图片以图搜款</div>
              <div className="cp-hint-tips">
                <span><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
                <span><kbd>↵</kbd> 跳转</span>
                <span><kbd>ESC</kbd> 关闭</span>
                <span><kbd>⌘V</kbd> 图片搜款</span>
              </div>
            </div>
          )}

          {imageSearchMode && imageSearchLoading && (
            <div className="cp-empty-hint">
              <Spin size="large" />
              <div style={{ marginTop: 12 }}>正在以图搜款…</div>
            </div>
          )}

          {imageSearchMode && !imageSearchLoading && imageStyles.length === 0 && (
            <div className="cp-empty-hint">
              <PictureOutlined style={{ fontSize: 16, marginBottom: 8, opacity: 0.3 }} />
              <div>未找到相似款式</div>
            </div>
          )}

          {query.trim() && !loading && !imageSearchMode && items.length === 0 && (
            <div className="cp-empty-hint">
              <SearchOutlined style={{ fontSize: 16, marginBottom: 8, opacity: 0.3 }} />
              <div>未找到与「{query}」相关的结果</div>
              <button
                type="button"
                className="cp-ai-fallback"
                onClick={askAiAssistant}
              >
                <RobotOutlined /> 问小云AI助手
              </button>
            </div>
          )}

          {items.length > 0 && (() => {
            let cursor = 0;
            const sections: React.ReactNode[] = [];

            // 图片搜款结果
            if (imageStyles.length) {
              sections.push(<div key="th-image" className="cp-group-title"><PictureOutlined style={{ color: '#a855f7' }} /> 相似款式</div>);
              imageStyles.forEach((it, i) => {
                const idx = cursor + i;
                const s = it.data;
                sections.push(
                  <div
                    key={`imgstyle-${s.id}`}
                    className={`cp-item${idx === activeIdx ? ' active' : ''}`}
                    onClick={() => navigateTo(it)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <span className="cp-item-icon cp-icon-image">
                      {s.coverUrl ? (
                        <SmartImage src={s.coverUrl} alt={s.styleName} className="cp-cover" width={32} height={32} preview={{ cover: <span>预览</span> }} />
                      ) : (
                        <PictureOutlined />
                      )}
                    </span>
                    <span className="cp-item-main">
                      <span className="cp-item-title">{s.styleNo}</span>
                      <span className="cp-item-sub">{s.styleName}{s.category ? ` · ${s.category}` : ''}</span>
                    </span>
                    {s.similarity != null && (
                      <span className="cp-item-meta">
                        <span className="cp-similarity">{Math.round(s.similarity * 100)}%</span>
                      </span>
                    )}
                    <RightOutlined className="cp-item-arrow" />
                  </div>
                );
              });
              cursor += imageStyles.length;
            }

            // 菜单
            if (menus.length) {
              sections.push(<div key="th-menu" className="cp-group-title"><AppstoreOutlined /> 菜单导航</div>);
              menus.forEach((it, i) => {
                const idx = cursor + i;
                const m = it.data;
                sections.push(
                  <div
                    key={`menu-${m.path}`}
                    className={`cp-item${idx === activeIdx ? ' active' : ''}`}
                    onClick={() => navigateTo(it)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <span className="cp-item-icon cp-icon-menu">{m.icon || <AppstoreOutlined />}</span>
                    <span className="cp-item-main">
                      <span className="cp-item-title">{m.label}</span>
                      <span className="cp-item-sub">{m.section} · {m.path}</span>
                    </span>
                    <RightOutlined className="cp-item-arrow" />
                  </div>
                );
              });
              cursor += menus.length;
            }

            // 订单
            if (orders.length) {
              sections.push(<div key="th-order" className="cp-group-title"><FileTextOutlined /> 生产订单</div>);
              orders.forEach((it, i) => {
                const idx = cursor + i;
                const o = it.data as GlobalSearchOrderItem;
                sections.push(
                  <div
                    key={`order-${o.id}`}
                    className={`cp-item${idx === activeIdx ? ' active' : ''}`}
                    onClick={() => navigateTo(it)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <span className="cp-item-icon cp-icon-order"><FileTextOutlined /></span>
                    <span className="cp-item-main">
                      <span className="cp-item-title">{o.orderNo}</span>
                      <span className="cp-item-sub">{o.styleName}{o.factoryName ? ` · ${o.factoryName}` : ''}</span>
                    </span>
                    <span className="cp-item-meta">
                      <span className="cp-status-dot" style={{ background: STATUS_COLOR[o.status] || '#ccc' }} />
                      <span className="cp-item-status">{STATUS_LABEL_ZH[o.status] || o.statusLabel}</span>
                      {o.progress != null && <span className="cp-item-pct">{o.progress}%</span>}
                    </span>
                    <RightOutlined className="cp-item-arrow" />
                  </div>
                );
              });
              cursor += orders.length;
            }

            // 款式
            if (styles.length) {
              sections.push(<div key="th-style" className="cp-group-title"><SkinOutlined /> 款式</div>);
              styles.forEach((it, i) => {
                const idx = cursor + i;
                const s = it.data as GlobalSearchStyleItem;
                sections.push(
                  <div
                    key={`style-${s.id}`}
                    className={`cp-item${idx === activeIdx ? ' active' : ''}`}
                    onClick={() => navigateTo(it)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <span className="cp-item-icon cp-icon-style">
                      {s.coverUrl ? (
                        <SmartImage src={s.coverUrl} alt={s.styleName} className="cp-cover" width={32} height={32} preview={{ cover: <span>预览</span> }} />
                      ) : (
                        <SkinOutlined />
                      )}
                    </span>
                    <span className="cp-item-main">
                      <span className="cp-item-title">{s.styleName}</span>
                      <span className="cp-item-sub">{s.styleNo}{s.category ? ` · ${s.category}` : ''}</span>
                    </span>
                    <RightOutlined className="cp-item-arrow" />
                  </div>
                );
              });
              cursor += styles.length;
            }

            // 工人
            if (workers.length) {
              sections.push(<div key="th-worker" className="cp-group-title"><TeamOutlined /> 工人</div>);
              workers.forEach((it, i) => {
                const idx = cursor + i;
                const w = it.data as GlobalSearchWorkerItem;
                sections.push(
                  <div
                    key={`worker-${w.id}`}
                    className={`cp-item${idx === activeIdx ? ' active' : ''}`}
                    onClick={() => navigateTo(it)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <span className="cp-item-icon cp-icon-worker"><TeamOutlined /></span>
                    <span className="cp-item-main">
                      <span className="cp-item-title">{w.name}</span>
                      <span className="cp-item-sub">{w.role}{w.phone ? ` · ${w.phone}` : ''}</span>
                    </span>
                    <RightOutlined className="cp-item-arrow" />
                  </div>
                );
              });
            }

            return sections;
          })()}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
