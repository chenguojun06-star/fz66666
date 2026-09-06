import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Image, Spin, Tooltip } from 'antd';
import {
  DeleteOutlined, EyeOutlined, LeftOutlined, PictureOutlined, PlusOutlined,
  RightOutlined, StarFilled, StarOutlined,
} from '@ant-design/icons';
import { useCoverImageUpload } from './useCoverImageUpload';
import SearchResultCard from './SearchResultCard';
import { isSameFileUrl } from '@/utils/fileUrl';
import type { CoverImageUploadProps } from './types';

/** 方形卡片尺寸（正方形，一排排列，不大） */
const CARD = 84;
/** 图片数量上限 */
const MAX_IMAGES = 9;

/**
 * 图片资产（通用方形卡片上传风格，置于款名上方通栏）
 * - 一排排列的正方形图片卡（hover：预览/设为主图/删除）+ 末尾 ➕ 上传卡（最多9张）
 * - 支持点击选择、拖拽、粘贴上传
 * - 行尾小工具：智能识别 / 搜相似（作用于主图/当前选中图）
 * - 主图左上角标记；无下方缩略图列表
 */
const CoverImageUpload: React.FC<CoverImageUploadProps> = (props) => {
  const { message } = App.useApp();
  const {
    currentIndex,
    setCurrentIndex,
    searchResult,
    searchExpanded,
    setSearchExpanded,
    displayImages,
    handleDelete,
    handleSetCover,
    handleUploadFiles,
    uploading,
  } = useCoverImageUpload(props);
  const { enabled, isNewMode = false, coverUrl } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  /** 上传入口（数量校验 + 复用 hook 的上传逻辑） */
  const uploadFiles = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) return;
    if (displayImages.length >= MAX_IMAGES) {
      message.warning(`最多 ${MAX_IMAGES} 张图片`);
      return;
    }
    void handleUploadFiles(valid.slice(0, MAX_IMAGES - displayImages.length));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!enabled && !isNewMode) return;
    uploadFiles(Array.from(e.dataTransfer.files || []));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!enabled && !isNewMode) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  };

  const canAdd = displayImages.length < MAX_IMAGES && (enabled || isNewMode);

  // 粘贴兜底：页面任意位置（焦点不在输入框/编辑器/图片区）直接 Ctrl+V 图片 → 上传到款式图。
  // 根因：onPaste 只在目标元素聚焦时触发，页面打开后焦点默认在 body，
  // 用户"复制图片直接粘贴"时事件根本到不了图片区（表现为点击没反应）。
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;
  useEffect(() => {
    if (!canAdd) return;
    const handler = (e: ClipboardEvent) => {
      const el = containerRef.current;
      if (!el || !el.offsetParent) return; // 组件处于隐藏 Tab 时（offsetParent=null）不兜底
      // 命令面板(Ctrl+K 以图搜款)或 antd Modal 打开时不兜底，避免抢事件造成误上传
      if (document.querySelector('.cp-modal')) return;
      if (Array.from(document.querySelectorAll('.ant-modal-wrap')).some((m) => (m as HTMLElement).offsetParent !== null)) return;
      const ae = document.activeElement;
      if (ae) {
        if (el.contains(ae)) return; // 焦点在图片区，走局部 onPaste，避免重复上传
        const tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ae as HTMLElement).isContentEditable) return; // 输入类元素正常粘贴文本
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        uploadFilesRef.current(files);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [canAdd]);

  const previewSrcs = useMemo(
    () => displayImages.map((img) => img.fileUrl).filter(Boolean),
    [displayImages]
  );

  const cardBase: React.CSSProperties = {
    width: CARD, height: CARD, borderRadius: 6, overflow: 'hidden',
    position: 'relative', flexShrink: 0, border: '1px solid var(--color-border, #d9d9d9)',
  };

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', outline: 'none' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={canAdd ? 0 : undefined}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files || []));
          e.currentTarget.value = '';
        }}
      />

      {/* 受控预览（点眼睛开大图） */}
      {previewSrcs.length > 0 && (
        <Image.PreviewGroup
          preview={{
            open: previewOpen,
            onOpenChange: setPreviewOpen,
            current: previewIndex,
            // D-218：受控 current 必须回写——否则内部切换不生效，‹›按钮点了画面不动
            onChange: (cur: number) => setPreviewIndex(cur),
            // 自定义底部工具栏：左右切换上一张/下一张 + 默认缩放/旋转等操作按钮
            actionsRender: (originalNode, info) => (
              <div className="style-image-preview-toolbar">
                <span
                  className="style-image-preview-nav"
                  title="上一张"
                  onClick={() => {
                    if (info.total <= 1) {
                      message.info('当前仅一张图片');
                      return;
                    }
                    info.actions.onActive(-1);
                  }}
                >
                  <LeftOutlined />
                </span>
                {originalNode}
                <span
                  className="style-image-preview-nav"
                  title="下一张"
                  onClick={() => {
                    if (info.total <= 1) {
                      message.info('当前仅一张图片');
                      return;
                    }
                    info.actions.onActive(1);
                  }}
                >
                  <RightOutlined />
                </span>
              </div>
            ),
          }}
          items={previewSrcs}
        >
          <Image src={previewSrcs[0]} style={{ display: 'none' }} preview={false} />
        </Image.PreviewGroup>
      )}

      {/* 图片卡一排排列 + ➕上传卡 + 行尾小工具 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {displayImages.map((img, idx) => {
            // 主图徽标按真实 cover 判定，不再钉在列表第一张：
            // 此前 coverFileUrl 取 displayImages[0]，设为主图成功后列表不重排、
            // 徽标纹丝不动，用户看起来就是"点了没反应"
            const isCover = !isNewMode
              && (coverUrl ? isSameFileUrl(img.fileUrl, coverUrl) : idx === 0);
            const active = idx === currentIndex;
            return (
              <div
                key={img.id}
                style={{
                  ...cardBase,
                  boxShadow: active ? '0 0 0 2px var(--color-primary, #1677ff)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setCurrentIndex(idx)}
              >
                <img
                  src={img.fileUrl}
                  alt={`款式图${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {/* 主图标记 */}
                {isCover && (
                  <div style={{
                    position: 'absolute', left: 0, top: 0, zIndex: 2,
                    background: 'var(--color-primary, #1677ff)', color: '#fff',
                    fontSize: 10, lineHeight: '16px', padding: '0 5px', borderRadius: '0 0 6px 0',
                  }}>
                    主图
                  </div>
                )}
                {/* hover 操作层 */}
                {(enabled || isNewMode) && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, zIndex: 1,
                      background: 'rgba(0,0,0,0.35)', opacity: 0, transition: 'opacity .15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
                  >
                    <Tooltip title="预览大图">
                      <EyeOutlined
                        style={{ color: '#fff', fontSize: 15 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewIndex(idx);
                          setPreviewOpen(true);
                        }}
                      />
                    </Tooltip>
                    {!isNewMode && !img.isLocal && !(img as { isCoverFallback?: boolean }).isCoverFallback && (
                      <Tooltip title={isCover ? '当前主图' : '设为主图'}>
                        {isCover ? (
                          <StarFilled style={{ color: '#ffd666', fontSize: 15 }} />
                        ) : (
                          <StarOutlined
                            style={{ color: '#fff', fontSize: 15 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSetCover(idx);
                            }}
                          />
                        )}
                      </Tooltip>
                    )}
                    <Tooltip title="删除">
                      <DeleteOutlined
                        style={{ color: '#fff', fontSize: 15 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(img.id, img.localIndex);
                        }}
                      />
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })}

        {/* ➕ 上传卡（点击/拖拽/粘贴） */}
        {canAdd && (
          <Spin spinning={uploading}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: CARD, height: CARD, borderRadius: 6, flexShrink: 0,
                border: '1px dashed var(--color-border, #bbb)', background: 'var(--color-bg-page, #fafafa)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <PlusOutlined style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }} />
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                款式图 {displayImages.length}/{MAX_IMAGES}
              </div>
            </div>
          </Spin>
        )}

        {displayImages.length === 0 && !isNewMode && (
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <PictureOutlined /> 暂无款式图，点击 + 上传或直接拖拽/粘贴图片
          </span>
        )}
      </div>

      {/* 以图搜款结果（折叠） */}
      <SearchResultCard
        searchResult={searchResult}
        searchExpanded={searchExpanded}
        setSearchExpanded={setSearchExpanded}
      />
    </div>
  );
};

export default CoverImageUpload;
