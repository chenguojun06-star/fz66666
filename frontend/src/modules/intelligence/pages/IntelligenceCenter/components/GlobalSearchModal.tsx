/**
 * ⌘K 全局搜索弹窗
 * 特性：
 *   • ⌘K / Ctrl+K 快捷键触发
 *   • 输入即搜（300ms debounce）
 *   • 支持拼音首字母/全拼模糊匹配（后端处理）
 *   • 结果分三组：订单 / 款式 / 工人
 *   • 点击结果跳转对应页面
 *   • 深空主题，与太空舱风格一致
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Spin, Empty } from 'antd';
import type { InputRef } from 'antd';
import {
  SearchOutlined, FileTextOutlined, AppstoreOutlined,
  UserOutlined, RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  globalSearchApi,
  GlobalSearchResult,
  GlobalSearchOrderItem,
  GlobalSearchStyleItem,
  GlobalSearchWorkerItem,
} from '@/services/production/productionApi';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  CREATED: '#7aaec8',
  IN_PROGRESS: '#00e5ff',
  COMPLETED: '#39ff14',
  CANCELLED: '#5a6a7a',
  PAUSED: '#f7a600',
};

const GlobalSearchModal: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef<InputRef>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [activeIdx, setActiveIdx] = useState(0); // 键盘导航

  // 打开时自动聚焦
  useEffect(() => {
    if (open) {
      setQuery('');
      setResult(null);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 1) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const resp = await globalSearchApi.search(q.trim());
      const data = (resp as { data?: { data?: GlobalSearchResult } }).data?.data ?? null;
      setResult(data);
      setActiveIdx(0);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  // 扁平化结果列表，用于键盘导航
  const flatItems: Array<{ type: 'order' | 'style' | 'worker'; item: GlobalSearchOrderItem | GlobalSearchStyleItem | GlobalSearchWorkerItem }> = [];
  result?.orders.forEach(o => flatItems.push({ type: 'order', item: o }));
  result?.styles.forEach(s => flatItems.push({ type: 'style', item: s }));
  result?.workers.forEach(w => flatItems.push({ type: 'worker', item: w }));

  const handleKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems[activeIdx]) {
      handleSelect(flatItems[activeIdx].type, flatItems[activeIdx].item);
    }
  };

  const handleSelect = (type: 'order' | 'style' | 'worker', item: GlobalSearchOrderItem | GlobalSearchStyleItem | GlobalSearchWorkerItem) => {
    onClose();
    if (type === 'order') {
      navigate(`/production?orderNo=${(item as GlobalSearchOrderItem).orderNo}`);
    } else if (type === 'style') {
      navigate(`/style?styleNo=${(item as GlobalSearchStyleItem).styleNo ?? ''}`);
    } else {
      navigate('/system/users');
    }
  };

  const totalCount = (result?.orders.length ?? 0) + (result?.styles.length ?? 0) + (result?.workers.length ?? 0);
  let globalIdx = 0;

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,8,20,0.8)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 640, maxWidth: 'calc(100vw - 40px)',
          background: 'linear-gradient(160deg,#0d1b35 0%,#081229 100%)',
          border: '1px solid rgba(0,229,255,0.25)',
          borderRadius: 14, boxShadow: '0 0 60px rgba(0,229,255,0.12), 0 24px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyNav}
      >
        {/* 搜索输入框 */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,229,255,0.12)' }}>
          {loading
            ? <Spin size="small" style={{ marginRight: 12 }} />
            : <SearchOutlined style={{ color: '#00e5ff', fontSize: 18, marginRight: 12 }} />
          }
          <Input
            ref={inputRef}
            variant="borderless"
            placeholder="搜索订单号、款式名、工人姓名，或输入拼音首字母…"
            value={query}
            onChange={e => handleChange(e.target.value)}
            style={{
              flex: 1, background: 'transparent', color: '#e8f4ff',
              fontSize: 16, padding: 0,
            }}
          />
          <span style={{ fontSize: 11, color: '#3a5a7a', letterSpacing: 0.5, flexShrink: 0 }}>ESC 关闭</span>
        </div>

        {/* 空状态 */}
        {!query && (
          <div style={{ padding: '24px 20px', color: '#3a5a7a', fontSize: 12, lineHeight: 1.8 }}>
            <div style={{ marginBottom: 8, color: '#5a7a9a', fontWeight: 600 }}>搜索示例</div>
            {['PO2024001', 'hlq（红领桥 拼音首字母）', '张师傅', '风衣'].map(tip => (
              <div key={tip} style={{ display: 'inline-block', margin: '3px 4px', padding: '2px 10px', borderRadius: 20, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', cursor: 'pointer', color: '#7aaec8' }}
                onClick={() => handleChange(tip)}>
                {tip}
              </div>
            ))}
          </div>
        )}

        {/* 结果列表 */}
        {totalCount === 0 && query && !loading && (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: '#3a5a7a' }}>没有找到 "{query}" 相关结果</span>}
            />
            <div
              style={{
                marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 20px', borderRadius: 20, cursor: 'pointer',
                background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)',
                color: '#00e5ff', fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
              }}
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('openAiChat', { detail: { query } }));
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,229,255,0.16)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,229,255,0.08)'; }}
            >
              🤖 让小云帮你找
            </div>
          </div>
        )}

        {totalCount > 0 && (
          <div style={{ maxHeight: 460, overflowY: 'auto', padding: '6px 0 10px' }}>
            {/* 订单 */}
            {(result?.orders.length ?? 0) > 0 && (
              <section>
                <div style={{ padding: '6px 18px 4px', fontSize: 11, color: '#3a6080', fontWeight: 600, letterSpacing: 1 }}>
                  <FileTextOutlined style={{ marginRight: 5 }} />生产订单
                </div>
                {result!.orders.map(o => {
                  const idx = globalIdx++;
                  return (
                    <div key={o.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 18px', cursor: 'pointer',
                        background: idx === activeIdx ? 'rgba(0,229,255,0.06)' : 'transparent',
                        borderLeft: idx === activeIdx ? '2px solid #00e5ff' : '2px solid transparent',
                        transition: 'all 0.12s',
                      }}
                      onClick={() => handleSelect('order', o)}
                      onMouseEnter={() => setActiveIdx(idx)}>
                      <span style={{ color: '#00e5ff', fontWeight: 600, fontSize: 13, minWidth: 120 }}>{o.orderNo}</span>
                      <span style={{ flex: 1, fontSize: 12, color: '#b0c4de', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.styleName || o.styleNo}
                      </span>
                      <span style={{ fontSize: 11, color: '#5a7a9a', flexShrink: 0 }}>{o.factoryName}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                        color: STATUS_COLOR[o.status] ?? '#7aaec8',
                        border: `1px solid ${(STATUS_COLOR[o.status] ?? '#7aaec8')}44`,
                        background: `${(STATUS_COLOR[o.status] ?? '#7aaec8')}11`
                      }}>{o.statusLabel}</span>
                      {o.progress != null && (
                        <span style={{ fontSize: 10, color: '#3a6080', flexShrink: 0 }}>{o.progress}%</span>
                      )}
                      <RightOutlined style={{ color: '#2a4060', fontSize: 10, flexShrink: 0 }} />
                    </div>
                  );
                })}
              </section>
            )}

            {/* 款式 */}
            {(result?.styles.length ?? 0) > 0 && (
              <section style={{ marginTop: 4 }}>
                <div style={{ padding: '6px 18px 4px', fontSize: 11, color: '#3a6080', fontWeight: 600, letterSpacing: 1 }}>
                  <AppstoreOutlined style={{ marginRight: 5 }} />款式
                </div>
                {result!.styles.map(s => {
                  const idx = globalIdx++;
                  return (
                    <div key={s.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 18px', cursor: 'pointer',
                        background: idx === activeIdx ? 'rgba(167,139,250,0.06)' : 'transparent',
                        borderLeft: idx === activeIdx ? '2px solid #a78bfa' : '2px solid transparent',
                        transition: 'all 0.12s',
                      }}
                      onClick={() => handleSelect('style', s)}
                      onMouseEnter={() => setActiveIdx(idx)}>
                      <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: 13, minWidth: 100 }}>{s.styleNo}</span>
                      <span style={{ flex: 1, fontSize: 12, color: '#b0c4de' }}>{s.styleName}</span>
                      {s.category && <span style={{ fontSize: 10, color: '#5a7a9a', flexShrink: 0 }}>{s.category}</span>}
                      <RightOutlined style={{ color: '#2a4060', fontSize: 10, flexShrink: 0 }} />
                    </div>
                  );
                })}
              </section>
            )}

            {/* 工人 */}
            {(result?.workers.length ?? 0) > 0 && (
              <section style={{ marginTop: 4 }}>
                <div style={{ padding: '6px 18px 4px', fontSize: 11, color: '#3a6080', fontWeight: 600, letterSpacing: 1 }}>
                  <UserOutlined style={{ marginRight: 5 }} />工人 / 员工
                </div>
                {result!.workers.map(w => {
                  const idx = globalIdx++;
                  return (
                    <div key={w.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 18px', cursor: 'pointer',
                        background: idx === activeIdx ? 'rgba(57,255,20,0.04)' : 'transparent',
                        borderLeft: idx === activeIdx ? '2px solid #39ff14' : '2px solid transparent',
                        transition: 'all 0.12s',
                      }}
                      onClick={() => handleSelect('worker', w)}
                      onMouseEnter={() => setActiveIdx(idx)}>
                      <UserOutlined style={{ color: '#39ff14', fontSize: 14 }} />
                      <span style={{ color: '#e8f4ff', fontWeight: 600, fontSize: 13, minWidth: 72 }}>{w.name}</span>
                      <span style={{ fontSize: 11, color: '#5a7a9a', flex: 1 }}>{w.factoryName}</span>
                      {w.role && <span style={{ fontSize: 10, color: '#3a6080' }}>{w.role}</span>}
                      <RightOutlined style={{ color: '#2a4060', fontSize: 10, flexShrink: 0 }} />
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        )}

        {/* 底部提示 */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid rgba(0,229,255,0.08)', display: 'flex', gap: 16, fontSize: 10, color: '#2a4060' }}>
          <span>↑↓ 导航</span>
          <span>↵ 跳转</span>
          <span>Esc 关闭</span>
          {totalCount > 0 && <span style={{ marginLeft: 'auto', color: '#3a5a7a' }}>共 {totalCount} 条结果</span>}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
