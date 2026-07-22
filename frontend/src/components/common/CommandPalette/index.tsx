/**
 * ⌘K 全局命令面板
 *
 * 重构说明（2026-07）：
 *   - 业务逻辑抽取到 useCommandPaletteData Hook
 *   - 常量/菜单索引抽取到 helpers.ts
 *   - 类型抽取到 types.ts
 *   - 菜单/订单/款式/工人 列表抽到 ResultList 子组件
 *   - 图片搜款 Grid 卡片抽到 ImageGrid 子组件
 *   - 主文件仅做组合与布局
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Upload } from 'antd';
import {
  AppstoreOutlined,
  CloseOutlined,
  PictureOutlined,
  RobotOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { MENU_INDEX } from './helpers';
import { useCommandPaletteData } from './useCommandPaletteData';
import ResultList from './ResultList';
import ImageGrid from './ImageGrid';
import type { CommandPaletteProps } from './types';
import '../CommandPalette.css';

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const {
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
  } = useCommandPaletteData(open, onClose);

  if (!open) return null;

  // ─── 渲染结果分组 ─────────────────────────────────────────
  const imageStyles = items.filter(i => i.kind === 'imageStyle');

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div
        className={
          'cp-modal cp-modal-wide' +
          (isDragging ? ' cp-modal--dragging' : '') +
          (imageSearchMode ? ' cp-modal--image-mode' : '')
        }
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="全局搜索"
      >
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
            placeholder={imageSearchMode ? '图片搜款结果 — 输入文字切换回普通搜索…' : '拖拽图片到这里，或按 Ctrl+V 粘贴图片，也可输入关键词搜索订单 / 款式 / 工人'}
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

        {/* ── 拖拽高亮遮罩 ── */}
        {isDragging && (
          <div className="cp-drop-overlay">
            <div className="cp-drop-inner">
              <PictureOutlined style={{ fontSize: 48, color: '#a855f7', marginBottom: 12 }} />
              <div className="cp-drop-title">松开以图搜款</div>
              <div className="cp-drop-tip">支持 PNG / JPG / WEBP 等常见图片格式</div>
            </div>
          </div>
        )}

        {/* ── 结果列表 ── */}
        <div ref={listRef} className="cp-list">
          {!query.trim() && !imageSearchMode && (
            <div className="cp-empty-hint">
              <AppstoreOutlined style={{ fontSize: 16, marginBottom: 8, opacity: 0.3 }} />
              <div>拖拽图片到这里，或按 Ctrl+V 粘贴图片</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                也可输入关键词搜索订单 / 款式 / 工人
              </div>
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

          {/* ——— 图片搜款 Grid 卡片 ——— */}
          {imageSearchMode && !imageSearchLoading && imageStyles.length > 0 && (
            <ImageGrid
              imageStyles={imageStyles}
              activeIdx={activeIdx}
              setActiveIdx={setActiveIdx}
              navigateTo={navigateTo}
            />
          )}

          {/* ——— 其他分组（菜单/订单/款式/工人）保留原来列表样式 ——— */}
          {!imageSearchMode && items.length > 0 && (
            <ResultList
              items={items}
              activeIdx={activeIdx}
              setActiveIdx={setActiveIdx}
              navigateTo={navigateTo}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
