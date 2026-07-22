import React from 'react';
import { StyleAttachment } from '@/types/style';
import { useStyleAttachmentTab } from './useStyleAttachmentTab';
import AttachmentTable from './AttachmentTable';
import UploadButton from './UploadButton';

interface Props {
  styleId: string | number;
  styleNo?: string;
  bizType?: string;
  uploadText?: string;
  readOnly?: boolean;
  onListChange?: (list: StyleAttachment[]) => void;
}

const StyleAttachmentTab: React.FC<Props> = ({ styleId, styleNo, bizType, uploadText, readOnly, onListChange }) => {
  const {
    data,
    loading,
    isPattern,
    handleDelete,
    uploadOne,
  } = useStyleAttachmentTab({ styleId, styleNo, bizType, readOnly, onListChange });

  return (
    <div className="style-attachment">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--neutral-text-lighter)', fontSize: 'var(--font-size-sm)', lineHeight: 1.4 }}>
          {'单个文件不超过10MB，一次最多上传4个'}
        </span>
        <UploadButton
          uploadText={uploadText}
          readOnly={readOnly}
          onUpload={(file) => { void uploadOne(file); }}
        />
      </div>

      <AttachmentTable
        data={data}
        loading={loading}
        isPattern={isPattern}
        readOnly={readOnly}
        onDelete={handleDelete}
      />
    </div>
  );
};

export default StyleAttachmentTab;
