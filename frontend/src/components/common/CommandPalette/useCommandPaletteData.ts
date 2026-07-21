import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { globalSearchApi } from '@/services/production/productionApi';
import type {
  GlobalSearchOrderItem,
  GlobalSearchStyleItem,
  GlobalSearchWorkerItem,
} from '@/services/production/productionApi';
import api from '@/utils/api';
import { MENU_INDEX } from './helpers';
import type { ResultItem, SearchTab } from './types';

/**
 * CommandPalette 业务逻辑 Hook
 * 包含：搜索（防抖）、菜单搜索（纯前端）、图片搜款（上传 COS + 以图搜款）、
 *      粘贴图片、拖放图片、键盘导航、路由跳转、滚动激活项到视图内
 */
export function useCommandPaletteData(open: boolean, onClose: () => void) {
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
  // 拖拽高亮
  const [isDragging, setIsDragging] = useState(false);
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
      setIsDragging(false);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
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

  // 图片搜款：先上传文件到 COS，然后用 URL 调用以图搜款
  const handleImageSearch = useCallback(async (file: File) => {
    setImageSearchLoading(true);
    setImageSearchMode(true);
    setQuery('');
    setItems([]);
    try {
      // 1. 先上传文件到 COS
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      if (uploadRes?.code !== 200 || !uploadRes?.data) {
        console.warn('[CmdK] 图片上传失败:', uploadRes?.message);
        setImageSearchLoading(false);
        return;
      }
      const imageUrl = uploadRes.data as string;

      // 2. 用上传后的 URL 调用以图搜款
      const res = await api.post('/intelligence/visual/style-search', {
        imageUrl,
        topK: 8,
      });

      // 兼容两种返回结构：res.data.results[] 或 res.data.styles[]
      const resultList = res?.code === 200 && res?.data
        ? (res.data as any).results || (res.data as any).styles || []
        : [];

      if (Array.isArray(resultList) && resultList.length > 0) {
        const imageResults: ResultItem[] = (resultList as any[]).map((s, idx) => ({
          kind: 'imageStyle' as const,
          data: {
            id: s.id || idx,
            styleNo: s.styleNo || s.style_no || '',
            styleName: s.styleName || s.style_name || '',
            category: s.category || '',
            coverUrl: s.coverUrl || s.imageUrl || s.cover_url || s.main_image || '',
            similarity: s.similarity ?? s.score ?? (1 - idx * 0.1),
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

  // ─── 拖放图片支持 ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const container = document.querySelector<HTMLElement>('.cp-modal');
    if (!container) return;

    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }
    };
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          handleImageSearch(file);
          return;
        }
      }
    };

    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);

    return () => {
      container.removeEventListener('dragenter', handleDragEnter);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('drop', handleDrop);
    };
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
    const activeEl = listEl.querySelector<HTMLElement>('.cp-item.active, .cp-grid-card.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, imageSearchMode]);

  return {
    query,
    setQuery,
    items,
    setItems,
    loading,
    activeIdx,
    setActiveIdx,
    imageSearchMode,
    setImageSearchMode,
    imageSearchLoading,
    isDragging,
    inputRef,
    listRef,
    handleKeyDown,
    navigateTo,
    askAiAssistant,
    handleImageSearch,
  };
}
