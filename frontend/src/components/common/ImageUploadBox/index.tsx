import React, { useRef, useState } from 'react';
import { App, Spin } from 'antd';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

export interface ImageUploadBoxProps {
  /** 当前图片 URL（受控） */
  value?: string | null;
  /** 图片变更回调，url=null 表示清除 */
  onChange?: (url: string | null) => void;
  /** 宽高（正方形），默认 64 */
  size?: number;
  /** 宽度优先于 size */
  width?: number;
  /** 高度优先于 size */
  height?: number;
  disabled?: boolean;
  /** 接受的文件类型，默认 "image/*" */
  accept?: string;
  /** 文件大小上限（MB），默认 5；传 0 可跳过内置验证（适合 uploadFn 自行验证） */
  maxSizeMB?: number;
  /** 无图时显示的占位文字，默认"图片" */
  label?: string;
  /** 是否显示清除按钮，默认 true */
  showClear?: boolean;
  /** 形状：square（默认）或 round（头像用） */
  shape?: 'square' | 'round';
  /** 开启拖拽 & 粘贴上传，默认 false */
  enableDrop?: boolean;
  /** square 模式下的圆角，默认 6 */
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
  /**
   * 自定义上传函数，接收 File 返回最终 url 字符串。
   * 传入后将跳过内置 /common/upload，由调用方负责上传逻辑。
   */
  uploadFn?: (file: File) => Promise<string>;
}

export default function ImageUploadBox({
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
  const [uploading, setUploading] = useState(false);

  const w = width ?? size;
  const h = height ?? size;
  const radius = shape === 'round' ? '50%' : borderRadius;
  const hasImage = Boolean(value);

  const doUpload = async (file: File) => {
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
    } catch (e: any) {
      message.error(String(e?.message || '上传失败'));
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!disabled && enableDrop) e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (disabled || !enableDrop) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void doUpload(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled || !enableDrop) return;
    const file = e.clipboardData.files?.[0];
    if (!file) return;
    e.preventDefault();
    void doUpload(file);
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, ...style }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void doUpload(file);
          e.currentTarget.value = '';
        }}
      />
      <Spin spinning={uploading}>
        <div
          onClick={handleClick}
          onDragOver={enableDrop ? handleDragOver : undefined}
          onDrop={enableDrop ? handleDrop : undefined}
          onPaste={enableDrop ? handlePaste : undefined}
          style={{
            width: w,
            height: h,
            borderRadius: radius,
            border: hasImage ? '1px solid #e5e7eb' : '1px dashed #cbd5e1',
            background: '#f8fafc',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        >
          {hasImage ? (
            <img
              src={getFullAuthedFileUrl(value!)}
              alt={label}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ textAlign: 'center', userSelect: 'none', pointerEvents: 'none' }}>
              <div style={{ fontSize: 20, color: '#d1d5db', lineHeight: 1 }}>+</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
            </div>
          )}
        </div>
      </Spin>
      {hasImage && showClear && !disabled && (
        <button
          type="button"
          onClick={() => onChange?.(null)}
          style={{
            border: 0,
            background: 'transparent',
            color: '#94a3b8',
            padding: 0,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          清除
        </button>
      )}
    </div>
  );
}
