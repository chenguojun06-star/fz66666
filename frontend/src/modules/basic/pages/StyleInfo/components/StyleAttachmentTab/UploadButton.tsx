import React, { useRef } from 'react';
import { Button } from 'antd';
import { App } from 'antd';

interface UploadButtonProps {
  uploadText?: string;
  readOnly?: boolean;
  onUpload: (file: File) => void;
}

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
    <span
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files || []);
      }}
      onPaste={(e) => {
        const files = e.clipboardData.files;
        if (files?.length) {
          e.preventDefault();
          handleFiles(files);
          return;
        }
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            e.preventDefault();
            const f = items[i].getAsFile();
            if (f) onUpload(f);
            break;
          }
        }
      }}
      style={{ display: 'inline-block' }}
    >
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
      <Button type="primary" disabled={Boolean(readOnly)}
        onClick={() => fileInputRef.current?.click()}>
        {uploadText || '上传附件'}
      </Button>
    </span>
  );
};

export default UploadButton;
