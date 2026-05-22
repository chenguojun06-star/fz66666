import React, { useRef, useCallback } from 'react';
import type { UploadFile } from 'antd/es/upload/interface';
import { MAX_UNQUALIFIED_IMAGES } from '../../../constants';
import { message } from '@/utils/antdStatic';

interface UnqualifiedUploadProps {
  fileList: UploadFile[];
  disabled: boolean;
  onUpload: (file: File) => Promise<any> | void;
  onRemove: (file: UploadFile) => void;
  onPreview: (url: string, title: string) => void;
}

const UnqualifiedUpload: React.FC<UnqualifiedUploadProps> = ({
  fileList,
  disabled,
  onUpload,
  onRemove,
  onPreview,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClickUpload = useCallback(() => {
    if (disabled) return;
    if (fileList.length >= MAX_UNQUALIFIED_IMAGES) {
      message.error(`最多上传${MAX_UNQUALIFIED_IMAGES}张图片`);
      return;
    }
    fileInputRef.current?.click();
  }, [disabled, fileList.length]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const current = Array.isArray(fileList) ? fileList : [];
    const remaining = Math.max(0, MAX_UNQUALIFIED_IMAGES - current.length);
    if (remaining <= 0) {
      message.error(`最多上传${MAX_UNQUALIFIED_IMAGES}张图片`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    Array.from(files).slice(0, remaining).forEach((f) => {
      if (f.type.startsWith('image/')) void onUpload(f as any);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [fileList, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        void onUpload(file);
      }
    });
  }, [disabled, onUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;
    const files = e.clipboardData.files;
    if (files && files.length > 0) {
      e.preventDefault();
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('image/')) {
          void onUpload(file);
        }
      });
      return;
    }
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const f = items[i].getAsFile();
        if (f) void onUpload(f);
        break;
      }
    }
  }, [disabled, onUpload]);

  return (
    <div
      ref={containerRef}
      className="wh-control wh-upload"
      tabIndex={disabled ? undefined : 0}
      onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
      onDrop={handleDrop}
      onPaste={handlePaste}
      style={{ outline: 'none' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={handleFileChange}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {fileList.map((file) => (
          <div
            key={file.uid}
            style={{
              width: 102, height: 102, border: '1px solid #d9d9d9', borderRadius: 8,
              position: 'relative', overflow: 'hidden', cursor: 'pointer',
            }}
          >
            <img
              src={String((file as any)?.url || (file as any)?.thumbUrl || '')}
              alt={String((file as any)?.name || '')}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onClick={() => {
                const url = String((file as any)?.url || (file as any)?.thumbUrl || '').trim();
                if (url) onPreview(url, String((file as any)?.name || '图片预览'));
              }}
            />
            <span
              style={{
                position: 'absolute', top: 0, right: 0, width: 20, height: 20,
                background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '0 0 0 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, cursor: 'pointer',
              }}
              onClick={(e) => { e.stopPropagation(); onRemove(file); }}
            >
              ×
            </span>
          </div>
        ))}
        {fileList.length < MAX_UNQUALIFIED_IMAGES && !disabled && (
          <div
            style={{
              width: 102, height: 102, border: '1px dashed #d9d9d9', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', background: '#fafafa',
            }}
            onClick={handleClickUpload}
          >
            <div style={{ textAlign: 'center', color: '#999' }}>
              <span style={{ fontSize: 24, display: 'block' }}>+</span>
              <span style={{ fontSize: 14 }}>上传</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnqualifiedUpload;