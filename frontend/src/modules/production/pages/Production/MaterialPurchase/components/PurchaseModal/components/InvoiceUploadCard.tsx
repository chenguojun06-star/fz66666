import React from 'react';
import { Card, Space, Spin } from 'antd';
import { FileImageOutlined, LoadingOutlined } from '@ant-design/icons';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';

interface InvoiceUploadCardProps {
  invoiceUrls: string[];
  invoiceUploading: boolean;
  disabled: boolean;
  onChange: (urls: string[]) => void;
  uploadFn: (file: File) => Promise<string>;
}

// 发票/单据上传 Card（财务留底）
const InvoiceUploadCard: React.FC<InvoiceUploadCardProps> = ({
  invoiceUrls,
  invoiceUploading,
  disabled,
  onChange,
  uploadFn,
}) => {
  return (
    <Card
      style={{ marginTop: 12 }}
      title={
        <Space>
          <FileImageOutlined />
          <span>发票/单据</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>（{invoiceUrls.length}张，支持拖拽/粘贴/点击上传）</span>
        </Space>
      }
    >
      {invoiceUploading && (
        <div style={{ marginBottom: 8 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} />} /> 上传中...
        </div>
      )}
      <MultiImageUploadBox
        value={invoiceUrls}
        onChange={onChange}
        uploadFn={uploadFn}
        maxCount={20}
        size={80}
        accept="image/jpeg,image/jpg,image/png"
        maxSizeMB={5}
        label="发票/单据"
        disabled={disabled}
      />
      {invoiceUrls.length === 0 && !invoiceUploading && (
        <div style={{ color: 'var(--color-text-quaternary)', fontSize: 14, textAlign: 'center', padding: '4px 0 0' }}>
          暂无发票/单据，支持拖拽、粘贴或点击上传
        </div>
      )}
    </Card>
  );
};

export default InvoiceUploadCard;
