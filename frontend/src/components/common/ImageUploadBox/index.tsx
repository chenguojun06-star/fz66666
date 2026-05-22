import React, { useRef, useState, useCallback, useMemo, memo } from 'react';
import { App, Spin } from 'antd';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

export interface ImageUploadBoxProps {
  value?: string | null;
  onChange?: (url: string | null) => void;
  size?: number;
  width?: number;
  height?: number;
  disabled?: boolean;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  showClear?: boolean;
  shape?: 'square' | 'round';
  enableDrop?: boolean;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
  uploadFn?: (file: File) => Promise<string>;
}

const MUTED_COLOR = '#94a3b8';
const LIGHT_GRAY = '#d1d5db';
const ADD_BG = '#f8fafc';
const BORDER_COLOR = '#e5e7eb';
const DASHED_BORDER = '#cbd5e1';

function ImageUploadBox({
  value,
  onChange,
  size = 64,
  width,
  height,
  disabled = false,
  accept = 'image/*',
  maxSizeMB = 5,
  label = '图片',
  showClear = true,
  shape = 'square',
  enableDrop = false,
  borderRadius = 6,
  className,
  style,
  uploadFn,
}: ImageUploadBoxProps) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  const w = width ?? size;
  const h = height ?? size;
  const hasImage = Boolean(value);

  const doUpload = useCallback(async (file: File) => {
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
        message.success('上传成功');
      }
      onChange?.(url);
    } catch (e: unknown) {
      message.error(String(e instanceof Error ? e.message : '上传失败'));
    } finally {
      setUploading(false);
    }
  }, [maxSizeMB, uploadFn, onChange, message]);

  const handleClick = useCallback(() => {
    if (!disabled && !uploading) inputRef.current?.click();
  }, [disabled, uploading]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!disabled && enableDrop) e.preventDefault();
  }, [disabled, enableDrop]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (disabled || !enableDrop) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void doUpload(file);
  }, [disabled, enableDrop, doUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled || !enableDrop) return;
    let file: File | undefined = e.clipboardData.files?.[0];
    if (!file) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          file = items[i].getAsFile() ?? undefined;
          break;
        }
      }
    }
    if (!file) return;
    e.preventDefault();
    void doUpload(file);
  }, [disabled, enableDrop, doUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void doUpload(file);
    e.currentTarget.value = '';
  }, [doUpload]);

  const handleClear = useCallback(() => {
    onChange?.(null);
  }, [onChange]);

  const previewSrc = useMemo(
    () => (value ? getFullAuthedFileUrl(value) : ''),
    [value]
  );

  const containerStyle = useMemo(() => ({
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 4,
    ...style,
  }), [style]);

  const boxStyle = useMemo(() => ({
    width: w,
    height: h,
    borderRadius: shape === 'round' ? '50%' : borderRadius,
    border: hasImage ? `1px solid ${BORDER_COLOR}` : `1px dashed ${DASHED_BORDER}`,
    background: ADD_BG,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
    outline: 'none',
  }), [w, h, shape, borderRadius, hasImage, disabled]);

  const imgStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  }), []);

  const placeholderStyle = useMemo(() => ({
    textAlign: 'center' as const,
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
  }), []);

  const clearBtnStyle = useMemo(() => ({
    border: 0,
    background: 'transparent',
    color: MUTED_COLOR,
    padding: 0,
    cursor: 'pointer',
    fontSize: 14,
  }), []);

  return (
    <div className={className} style={containerStyle}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <Spin spinning={uploading}>
        <div
          ref={dropRef}
          onClick={handleClick}
          onMouseEnter={enableDrop && !disabled ? () => dropRef.current?.focus() : undefined}
          onDragOver={enableDrop ? handleDragOver : undefined}
          onDrop={enableDrop ? handleDrop : undefined}
          onPaste={enableDrop ? handlePaste : undefined}
          tabIndex={enableDrop && !disabled ? 0 : undefined}
          style={boxStyle}
        >
          {hasImage ? (
            <img
              src={previewSrc}
              alt={label}
              loading="lazy"
              decoding="async"
              style={imgStyle}
            />
          ) : (
            <div style={placeholderStyle}>
              <div style={{ fontSize: 20, color: LIGHT_GRAY, lineHeight: 1 }}>+</div>
              <div style={{ fontSize: 14, color: MUTED_COLOR, marginTop: 2 }}>{label}</div>
            </div>
          )}
        </div>
      </Spin>
      {hasImage && showClear && !disabled && (
        <button type="button" onClick={handleClear} style={clearBtnStyle}>
          清除
        </button>
      )}
    </div>
  );
}

export default memo(ImageUploadBox);