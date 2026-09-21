import React, { useRef } from 'react';
import { App } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

interface UploadButtonProps {
  uploadText?: string;
  readOnly?: boolean;
  onUpload: (file: File) => void;
}

/**
 * D-442：款式附件上传 —— 统一为系统标准「虚线拖拽上传框」观感
 * （与无资料下单款式图/封面图上传同一形态：点击/拖拽/粘贴 三通道），
 * 不再是一个孤立的小按钮。供样衣开发与商品资料详情共用。
 */
const UploadButton: React.FC<UploadButtonProps> = ({
  uploadText,
  readOnly,
  onUpload,
}) => {
  const { message } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null | undefined, maxCount = 4) => {
    if (!files?.length) return;
    Array.from(files).slice(0, maxCount).forEach((f) => {
      if (f.size > 15 * 1024 * 1024) {
        message.error(`${f.name} 超过15MB限制`);
        return;
      }
      onUpload(f);
    });
  };

  return (
    <div
      onClick={() => { if (!readOnly) fileInputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        if (readOnly) return;
        handleFiles(e.dataTransfer.files || []);
      }}
      onPaste={(e) => {
        const files = e.clipboardData.files;
        if (files?.length) {
          e.preventDefault();
          if (readOnly) return;
          handleFiles(files);
          return;
        }
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            e.preventDefault();
            const f = items[i].getAsFile();
            if (f && !readOnly) onUpload(f);
            break;
          }
        }
      }}
      style={{
        border: '1px dashed var(--color-border, #d9d9d9)',
        borderRadius: 8,
        padding: '14px 12px',
        textAlign: 'center',
        cursor: readOnly ? 'default' : 'pointer',
        color: 'var(--color-text-secondary, #6e6e73)',
        fontSize: 14,
        background: 'var(--color-bg-subtle, #fafafa)',
        transition: 'border-color 0.2s',
      }}
    >
      <InboxOutlined style={{ fontSize: 22, color: 'var(--color-primary, #2D7FF9)', display: 'block', marginBottom: 4 }} />
      <div>{uploadText || '点击或拖拽文件到此处上传'}</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
        支持粘贴截图 · 单文件不超过 15MB · 一次最多 4 个
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        disabled={Boolean(readOnly)}
        onChange={(e) => {
          handleFiles(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
};

export default UploadButton;
