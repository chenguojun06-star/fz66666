import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import {
  AppstoreOutlined,
  CloseOutlined,
  FileTextOutlined,
  RightOutlined,
  SearchOutlined,
  SkinOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { globalSearchApi } from '@/services/production/productionApi';
import type { GlobalSearchOrderItem, GlobalSearchStyleItem, GlobalSearchWorkerItem } from '@/services/production/productionApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import './CommandPalette.css';

// ─── 类型 ─────────────────────────────────────────────────────

type ResultItem =
  | { kind: 'order';  data: GlobalSearchOrderItem }
  | { kind: 'style';  data: GlobalSearchStyleItem }
  | { kind: 'worker'; data: GlobalSearchWorkerItem };

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

// ─── 主组件 ───────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate  = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  const [query,     setQuery]     = useState('');
  const [items,     setItems]     = useState<ResultItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef    = useRef<AbortController | null>(null);

  // 打开时聚焦 + 重置
  useEffect(() => {
    if (open) {
      setQuery('');
      setItems([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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
        const flat: ResultItem[] = [
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
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length > 0) {
      debounceRef.current = setTimeout(() => doSearch(query), 250);
    } else {
      setItems([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  // 导航到对应路径
  const navigateTo = useCallback((item: ResultItem) => {
    onClose();
    if (item.kind === 'order') {
      navigate(`/production?orderNo=${encodeURIComponent(item.data.orderNo)}`);
    } else if (item.kind === 'style') {
      navigate(`/style?styleNo=${encodeURIComponent(item.data.styleNo)}`);
    } else if (item.kind === 'worker') {
      navigate(`/system/user?name=${encodeURIComponent(item.data.name)}`);
    }
  }, [navigate, onClose]);

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

  const orders  = items.filter(i => i.kind === 'order');
  const styles  = items.filter(i => i.kind === 'style');
  const workers = items.filter(i => i.kind === 'worker');

  // 分组标题计算（用于 items 绝对 index）
  const sectionTitles: Array<{ idx: number; label: string; icon: React.ReactNode }> = [];
  if (orders.length)  sectionTitles.push({ idx: 0,               label: `生产订单  ${orders.length}`,  icon: <FileTextOutlined /> });
  if (styles.length)  sectionTitles.push({ idx: orders.length,   label: `款式  ${styles.length}`,       icon: <SkinOutlined /> });
  if (workers.length) sectionTitles.push({ idx: orders.length + styles.length, label: `工人  ${workers.length}`, icon: <TeamOutlined /> });

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} role="dialog" aria-label="全局搜索">
        {/* ── 搜索框 ── */}
        <div className="cp-input-row">
          <SearchOutlined className="cp-search-icon" />
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="搜索订单号 · 款式 · 工人姓名…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <Spin size="small" style={{ marginRight: 8 }} />}
          {!loading && query && (
            <button className="cp-clear" onClick={() => { setQuery(''); setItems([]); inputRef.current?.focus(); }}>
              <CloseOutlined style={{ fontSize: 11 }} />
            </button>
          )}
          <kbd className="cp-kbd">ESC</kbd>
        </div>

        {/* ── 结果列表 ── */}
        <div ref={listRef} className="cp-list">
          {!query.trim() && (
            <div className="cp-empty-hint">
              <AppstoreOutlined style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }} />
              <div>输入订单号、款式名、工人姓名开始搜索</div>
              <div className="cp-hint-tips">
                <span><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
                <span><kbd>↵</kbd> 跳转</span>
                <span><kbd>ESC</kbd> 关闭</span>
              </div>
            </div>
          )}

          {query.trim() && !loading && items.length === 0 && (
            <div className="cp-empty-hint">
              <SearchOutlined style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }} />
              <div>未找到与「{query}」相关的结果</div>
            </div>
          )}

          {items.length > 0 && (() => {
            let cursor = 0;
            const sections: React.ReactNode[] = [];

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
                        <img src={getFullAuthedFileUrl(s.coverUrl)} alt={s.styleName} className="cp-cover" />
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
