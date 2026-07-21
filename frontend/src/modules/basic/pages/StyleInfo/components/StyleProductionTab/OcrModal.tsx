import React from 'react';
import { Button, Input, Space } from 'antd';
import SmallModal from '@/components/common/SmallModal';

interface Props {
  open: boolean;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  text: string;
  error: string;
  onRecognize: () => void;
  onAppend: () => void;
  onReplace: () => void;
  onClose: () => void;
  onFileSelect: (f: File | null) => void;
  onFileRemove: () => void;
}

const OcrModal: React.FC<Props> = ({
  open,
  file,
  fileInputRef,
  loading,
  text,
  error,
  onRecognize,
  onAppend,
  onReplace,
  onClose,
  onFileSelect,
  onFileRemove,
}) => {
  return (
    <SmallModal
      title="AI识别工艺单"
      open={open}
      onCancel={onClose}
      footer={null}
      width="60vw"
    >
      <input
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept="image/*,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { onFileSelect(f); }
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) { onFileSelect(f); }
        }}
        onPaste={(e) => {
          const files = e.clipboardData.files;
          if (files?.length) { e.preventDefault(); onFileSelect(files[0]); return; }
          const items = e.clipboardData.items;
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              e.preventDefault();
              const f = items[i].getAsFile();
              if (f) { onFileSelect(f); }
              break;
            }
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        tabIndex={0}
        style={{
          border: '1px dashed var(--color-border-antd)', borderRadius: 8, padding: 16,
          textAlign: 'center', cursor: 'pointer', background: 'var(--color-bg-container)',
          transition: 'border-color 0.3s', marginBottom: 12, outline: 'none',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary-color)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-antd)'; }}
      >
        {file ? (
          <div>
            <p style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{file.name}</p>
            <p style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB — 点击更换或拖拽新文件
            </p>
            <Button size="small" style={{ marginTop: 6 }}
              onClick={(e) => { e.stopPropagation(); onFileRemove(); }}>
              移除
            </Button>
          </div>
        ) : (
          <>
            <p style={{ margin: '12px 0 4px' }}>点击或将工艺单图片拖拽到此处</p>
            <p style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
              支持 JPG / PNG / WEBP / PDF
            </p>
          </>
        )}
      </div>
      <Button
        type="primary"
        block
        disabled={!file}
        loading={loading}
        onClick={onRecognize}
      >
        开始 AI 识别
      </Button>
      {error && (
        <div style={{ color: 'var(--error-color, var(--color-danger))', marginTop: 8, fontSize: 'var(--font-size-xs)' }}>
          {error}
        </div>
      )}
      {text && (
        <>
          <Input.TextArea
            value={text}
            readOnly
            autoSize={{ minRows: 12 }}
            style={{ marginTop: 12, fontFamily: "'PingFang SC', 'Microsoft YaHei', monospace", fontSize: 14, lineHeight: '1.8', padding: '12px 14px', borderRadius: 6 }}
          />
          <Space style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={onAppend}>追加到生产要求</Button>
            <Button type="primary" onClick={onReplace}>替换生产要求</Button>
          </Space>
        </>
      )}
    </SmallModal>
  );
};

export default OcrModal;
