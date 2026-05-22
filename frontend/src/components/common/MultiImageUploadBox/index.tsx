import React, { useRef, useState, useCallback, useMemo, memo } from 'react';
import { App, Spin, Image } from 'antd';
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
}

const THUMB_BORDER = '1px solid #e5e7eb';
const OVERLAY_BG = 'rgba(0,0,0,0.45)';
const ADD_BORDER = '1px dashed #cbd5e1';
const ADD_BG = '#f8fafc';
const MUTED_COLOR = '#94a3b8';

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
  className,
  style,
}: MultiImageUploadBoxProps) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const urls = Array.isArray(value) ? value : [];

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
            visible: previewOpen,
            onVisibleChange: setPreviewOpen,
            current: previewIndex,
          }}
          items={previewImages.map((p) => p.src)}
        >
          {urls.map((url, idx) => (
            <div key={url} style={thumbStyle}>
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
                    <EyeOutlined style={{ color: '#fff', fontSize: 12 }} />
                  </div>
                  <div onClick={(e) => handleRemove(idx, e)} style={delBtnStyle}>
                    <DeleteOutlined style={{ color: '#fff', fontSize: 12 }} />
                  </div>
                </>
              )}
            </div>
          ))}
        </Image.PreviewGroup>
      )}

      {canAdd && (
        <Spin spinning={uploading}>
          <div onClick={handleClick} style={addBoxStyle}>
            <PlusOutlined style={{ fontSize: 15, color: MUTED_COLOR }} />
            <div style={{ fontSize: 14, color: MUTED_COLOR, marginTop: 4 }}>{label}</div>
          </div>
        </Spin>
      )}
    </div>
  );
}

export default memo(MultiImageUploadBox);