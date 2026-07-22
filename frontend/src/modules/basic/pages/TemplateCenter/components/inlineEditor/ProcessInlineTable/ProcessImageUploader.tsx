import React, { useRef } from 'react';
import { Button, Image } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

export interface ProcessImageUploaderProps {
  imageUrls: string[];
  imageUploading: boolean;
  readOnly: boolean;
  compact: boolean;
  onUploadImage: (file: File) => Promise<any>;
  onRemoveImage: (url: string) => void;
}

const ProcessImageUploader: React.FC<ProcessImageUploaderProps> = ({
  imageUrls,
  imageUploading,
  readOnly,
  compact,
  onUploadImage,
  onRemoveImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void onUploadImage(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLSpanElement>) => {
    if (readOnly) return;
    e.preventDefault();
    Array.from(e.dataTransfer.files || []).forEach((f) => {
      if (f.type.startsWith('image/')) void onUploadImage(f);
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLSpanElement>) => {
    if (readOnly) return;
    const files = e.clipboardData.files;
    if (files?.length) {
      e.preventDefault();
      Array.from(files).forEach((f) => {
        if (f.type.startsWith('image/')) void onUploadImage(f);
      });
      return;
    }
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const f = items[i].getAsFile();
        if (f) void onUploadImage(f);
        break;
      }
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: compact ? 0 : 12 }}>
      {compact ? <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text-secondary)' }}>参考图</span> : null}
      {!compact ? <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6, width: '100%' }}>款号参考图</div> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {imageUrls.map((url) => (
          <div key={url} style={{ position: 'relative', width: compact ? 44 : 52, height: compact ? 44 : 52 }}>
            <Image
              src={getFullAuthedFileUrl(url)}
              width={compact ? 44 : 52}
              height={compact ? 44 : 52}
              style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid var(--color-border-light)' }}
              preview
            />
            {readOnly ? null : (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onRemoveImage(url)}
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  minWidth: 18,
                  width: 18,
                  height: 18,
                  padding: 0,
                  background: 'var(--color-bg-base)',
                  borderRadius: '50%',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                }}
              />
            )}
          </div>
        ))}
        {imageUrls.length < 4 ? (
          <span
            onDragOver={(e) => { if (!readOnly) e.preventDefault(); }}
            onDrop={handleDrop}
            onPaste={handlePaste}
            style={{ display: 'inline-block' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              disabled={readOnly}
              onChange={handleFileChange}
            />
            <Button icon={<UploadOutlined />} loading={imageUploading} disabled={readOnly}
              onClick={() => fileInputRef.current?.click()}>
              上传图片
            </Button>
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default ProcessImageUploader;
