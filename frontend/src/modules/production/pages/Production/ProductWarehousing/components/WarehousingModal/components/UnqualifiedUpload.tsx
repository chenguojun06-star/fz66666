import React from 'react';
import { Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { MAX_UNQUALIFIED_IMAGES } from '../../../constants';

interface UnqualifiedUploadProps {
  fileList: UploadFile[];
  disabled: boolean;
  onUpload: (file: File) => Promise<any>;
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
  return (
    <div className="wh-control wh-upload">
      <Upload
        accept="image/*"
        listType="picture-card"
        fileList={fileList}
        disabled={disabled}
        multiple
        maxCount={MAX_UNQUALIFIED_IMAGES}
        beforeUpload={(file, currentFileList) => {
          const current = Array.isArray(fileList) ? fileList : [];
          const remaining = Math.max(0, MAX_UNQUALIFIED_IMAGES - current.length);
          if (remaining <= 0) {
            message.error(`最多上传${MAX_UNQUALIFIED_IMAGES}张图片`);
            return Upload.LIST_IGNORE;
          }
          const batch = Array.isArray(currentFileList) ? currentFileList : [];
          const idx = batch.indexOf(file);
          if (idx >= remaining) {
            if (idx === remaining) {
              message.error(`最多上传${MAX_UNQUALIFIED_IMAGES}张图片`);
            }
            return Upload.LIST_IGNORE;
          }
          return onUpload(file as any);
        }}
        onPreview={(file) => {
          const url = String((file as any)?.url || (file as any)?.thumbUrl || '').trim();
          if (!url) return;
          onPreview(url, String((file as any)?.name || '图片预览'));
        }}
        onRemove={(file) => {
          onRemove(file);
          return true;
        }}
      >
        {fileList.length >= MAX_UNQUALIFIED_IMAGES ? null : <div>上传</div>}
      </Upload>
    </div>
  );
};

export default UnqualifiedUpload;
