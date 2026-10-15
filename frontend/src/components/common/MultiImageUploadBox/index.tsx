import React, { useRef, useState, useCallback, useMemo, memo } from 'react';
import { App, Image } from 'antd';
import { BrandLoading } from '@/components/common/loading';
import { PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

export interface MultiImageUploadBoxProps {
  value?: string[];
  onChange?: (urls: string[]) => void;
  maxCount?: number;
  size?: number;
  disabled?: boolean;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  uploadFn?: (file: File) => Promise<string>;
  className?: string;
  style?: React.CSSProperties;
  /**
   * D-800：每张图的角标文案（如「主图」）。
   * 用于区分同一组图片里的不同角色 —— 淘宝/拼多多主图共 5 张，
   * 第 1 张是主图、其余是次图，没有角标运营分不清哪张会被搜索展示。
   */
  badges?: string[];
  /** 每张图下方的说明文案（如「建议 800×800 白底」），与角标同序 */
  captions?: string[];
}

const THUMB_BORDER = '1px solid var(--color-border)';
const OVERLAY_BG = 'var(--color-text-tertiary)';
const ADD_BORDER = '1px dashed var(--color-slate-300)';
const ADD_BG = 'var(--color-bg-page)';
const MUTED_COLOR = 'var(--color-slate-400)';

function MultiImageUploadBox({
  value = [],
  onChange,
  maxCount = 5,
  size = 80,
  disabled = false,
  accept = 'image/*',
  maxSizeMB = 5,
  label = '图片',
  uploadFn,
  badges,
  captions,
  className,
  style,
}: MultiImageUploadBoxProps) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const urls = useMemo(() => Array.isArray(value) ? value : [], [value]);

  const doUpload = useCallback(async (file: File) => {
    if (urls.length >= maxCount) {
      message.warning(`最多上传 ${maxCount} 张图片`);
      return;
    }
    if (maxSizeMB > 0 && file.size > maxSizeMB * 1024 * 1024) {
      message.error(`图片最大 ${maxSizeMB}MB`);
      return;
    }
    setUploading(true);
    try {
      let url: string;
      if (uploadFn) {
        url = await uploadFn(file);
      } else {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post<{ code: number; data: string; message?: string }>(
          '/common/upload',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
        url = res.data;
      }
      onChange?.([...urls, url]);
    } catch (e: unknown) {
      message.error(String(e instanceof Error ? e.message : '上传失败'));
    } finally {
      setUploading(false);
    }
  }, [urls, maxCount, maxSizeMB, uploadFn, onChange, message]);

  const handleClick = useCallback(() => {
    if (!disabled && !uploading) inputRef.current?.click();
  }, [disabled, uploading]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!disabled) e.preventDefault();
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    Array.from(e.dataTransfer.files || []).forEach((f) => { void doUpload(f); });
  }, [disabled, doUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;
    const files = e.clipboardData.files;
    if (files && files.length > 0) {
      e.preventDefault();
      Array.from(files).forEach((f) => { void doUpload(f); });
      return;
    }
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          void doUpload(file);
        }
        break;
      }
    }
  }, [disabled, doUpload]);

  const handleRemove = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(urls.filter((_, i) => i !== index));
  }, [urls, onChange]);

  const handlePreview = useCallback((index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((f) => { void doUpload(f); });
    e.currentTarget.value = '';
  }, [doUpload]);

  const previewImages = useMemo(
    () => urls.map((u) => ({ src: getFullAuthedFileUrl(u) })),
    [urls]
  );

  const containerStyle = useMemo(() => ({
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    outline: 'none',
    ...style,
  }), [style]);

  const thumbStyle = useMemo(() => ({
    width: size,
    height: size,
    borderRadius: 6,
    border: THUMB_BORDER,
    overflow: 'hidden' as const,
    position: 'relative' as const,
    flexShrink: 0,
    cursor: 'pointer',
  }), [size]);

  const imgStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  }), []);

  const overlayBtnStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 4,
    background: OVERLAY_BG,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }), []);

  const eyeBtnStyle = useMemo(() => ({
    ...overlayBtnStyle,
    left: 4,
    opacity: 0,
    transition: 'opacity 0.2s',
  }), [overlayBtnStyle]);

  const delBtnStyle = useMemo(() => ({
    ...overlayBtnStyle,
    right: 4,
  }), [overlayBtnStyle]);

  const addBoxStyle = useMemo(() => ({
    width: size,
    height: size,
    borderRadius: 6,
    border: ADD_BORDER,
    background: ADD_BG,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    userSelect: 'none' as const,
  }), [size]);

  const canAdd = urls.length < maxCount && !disabled;

  return (
    <div
      className={className}
      tabIndex={disabled ? undefined : 0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
      style={containerStyle}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {previewImages.length > 0 && (
        <Image.PreviewGroup
          preview={{
            open: previewOpen,
            onOpenChange: setPreviewOpen,
            current: previewIndex,
          }}
          items={previewImages.map((p) => p.src)}
        >
          {urls.map((url, idx) => (
            // D-800：整块可包裹，用于承载「角标 + 图下说明」
            <div key={url} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={thumbStyle}>
              {/* D-800：角标（区分主图/次图/颜色图角色） */}
              {badges?.[idx] ? (
                <span
                  style={{
                    position: 'absolute', top: 0, left: 0, zIndex: 2,
                    background: 'var(--color-primary)', color: '#fff',
                    fontSize: 11, lineHeight: '16px', padding: '0 5px',
                    borderRadius: '0 0 4px 0',
                  }}
                >
                  {badges[idx]}
                </span>
              ) : null}
              <img
                src={previewImages[idx].src}
                alt={`${label}${idx + 1}`}
                loading="lazy"
                decoding="async"
                style={imgStyle}
                onClick={() => handlePreview(idx)}
              />
              {!disabled && (
                <>
                  <div
                    onClick={() => handlePreview(idx)}
                    style={eyeBtnStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                  >
                    <EyeOutlined style={{ color: 'var(--color-bg-base)', fontSize: 13 }} />
                  </div>
                  <div onClick={(e) => handleRemove(idx, e)} style={delBtnStyle}>
                    <DeleteOutlined style={{ color: 'var(--color-bg-base)', fontSize: 13 }} />
                  </div>
                </>
              )}
            </div>
              {/* D-800：图下规格说明（如「建议 800×800 白底」） */}
              {captions?.[idx] ? (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.3 }}>
                  {captions[idx]}
                </span>
              ) : null}
            </div>
          ))}
        </Image.PreviewGroup>
      )}

      {canAdd && (
        <BrandLoading spinning={uploading}>
          <div onClick={handleClick} style={addBoxStyle}>
            <PlusOutlined style={{ fontSize: 15, color: MUTED_COLOR }} />
            <div style={{ fontSize: 15, color: MUTED_COLOR, marginTop: 4 }}>{label}</div>
          </div>
        </BrandLoading>
      )}
    </div>
  );
}

export default memo(MultiImageUploadBox);