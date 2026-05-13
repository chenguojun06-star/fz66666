import React from 'react';
import { App, Button, Image, Popover, Tooltip, Upload } from 'antd';
import { CameraOutlined, PaperClipOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { downloadFile, getFullAuthedFileUrl } from '@/utils/fileUrl';

export interface AttachmentFile { name: string; url: string; }

export const ProcessImageCell: React.FC<{ record: any; readOnly?: boolean }> = ({ record, readOnly }) => {
  const { message: msg } = App.useApp();
  const [imgs, setImgs] = React.useState<string[]>(() => {
    try { return JSON.parse(record.images || '[]') || []; } catch { return []; }
  });
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    try { setImgs(JSON.parse(record.images || '[]') || []); } catch { setImgs([]); }
  }, [record.images]);

  const handleUpload = async (file: File) => {
    if (!record.id) { msg.warning('请先保存记录再上传图片'); return false; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        const newImgs = [...imgs, res.data];
        await api.put(`/style/secondary-process/${record.id}`, { images: JSON.stringify(newImgs) });
        setImgs(newImgs);
        msg.success('图片上传成功');
      } else {
        msg.error(res.message || '上传失败');
      }
    } catch { msg.error('上传失败，请重试'); }
    finally { setUploading(false); }
    return false;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'center', minHeight: 24 }}
      onClick={(e) => e.stopPropagation()}>
      {imgs.length > 0 && (
        <Image.PreviewGroup>
          {imgs.slice(0, 2).map((url, i) => (
            <Image key={i} src={getFullAuthedFileUrl(url)} width={28} height={28}
              style={{ borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
              styles={{ root: { display: 'inline-block', flexShrink: 0 } }}
            />
          ))}
        </Image.PreviewGroup>
      )}
      {imgs.length > 2 && <span style={{ fontSize: 10, color: '#999' }}>+{imgs.length - 2}</span>}
      {!readOnly && record.id && (
        <Upload showUploadList={false} accept="image/*"
          beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
          disabled={uploading}>
          <Tooltip title={uploading ? '上传中…' : '上传工艺图片'} mouseEnterDelay={0.5}>
            <CameraOutlined style={{ fontSize: 13, color: uploading ? '#1677ff' : '#bbb', cursor: uploading ? 'wait' : 'pointer', flexShrink: 0 }} />
          </Tooltip>
        </Upload>
      )}
    </div>
  );
};

export const ProcessAttachmentCell: React.FC<{ record: any; readOnly?: boolean }> = ({ record, readOnly }) => {
  const { message: msg } = App.useApp();
  const [files, setFiles] = React.useState<AttachmentFile[]>(() => {
    try { return JSON.parse(record.attachments || '[]') || []; } catch { return []; }
  });
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    try { setFiles(JSON.parse(record.attachments || '[]') || []); } catch { setFiles([]); }
  }, [record.attachments]);

  const handleUpload = async (file: File) => {
    if (!record.id) { msg.warning('请先保存记录再上传附件'); return false; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        const newFiles = [...files, { name: file.name, url: res.data }];
        await api.put(`/style/secondary-process/${record.id}`, { attachments: JSON.stringify(newFiles) });
        setFiles(newFiles);
        msg.success('附件上传成功');
      } else {
        msg.error(res.message || '上传失败');
      }
    } catch { msg.error('上传失败，请重试'); }
    finally { setUploading(false); }
    return false;
  };

  const popoverContent = (
    <div style={{ minWidth: 180, maxWidth: 300 }}>
      {files.length === 0 && <div style={{ color: '#999', fontSize: 12, padding: '4px 0' }}>暂无附件</div>}
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
          <PaperClipOutlined style={{ color: '#1677ff', flexShrink: 0, fontSize: 12 }} />
          <a onClick={(e) => { e.preventDefault(); downloadFile(f.url, f.name); }}
            href="#" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, cursor: 'pointer' }}>
            {f.name}
          </a>
        </div>
      ))}
      {!readOnly && record.id && (
        <Upload showUploadList={false}
          beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
          disabled={uploading}>
          <Button icon={<PaperClipOutlined />} loading={uploading} style={{ marginTop: 6, width: '100%' }}>
            上传附件
          </Button>
        </Upload>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} title="附件" trigger="click" placement="bottomRight">
      <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 4px' }}
        onClick={(e) => e.stopPropagation()}>
        <PaperClipOutlined style={{ fontSize: 14, color: files.length > 0 ? '#1677ff' : '#bbb' }} />
        {files.length > 0 && <span style={{ fontSize: 12, color: '#1677ff' }}>{files.length}</span>}
      </div>
    </Popover>
  );
};

export const NewRowImageUpload: React.FC<{
  value: string[];
  onChange: (urls: string[]) => void;
}> = ({ value, onChange }) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = React.useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        onChange([...value, res.data]);
        msg.success('图片上传成功');
      } else {
        msg.error(res.message || '上传失败');
      }
    } catch { msg.error('上传失败，请重试'); }
    finally { setUploading(false); }
    return false;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'center', minHeight: 24 }}
      onClick={(e) => e.stopPropagation()}>
      {value.length > 0 && (
        <Image.PreviewGroup>
          {value.slice(0, 2).map((url, i) => (
            <Image key={i} src={getFullAuthedFileUrl(url)} width={28} height={28}
              style={{ borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
              styles={{ root: { display: 'inline-block', flexShrink: 0 } }}
            />
          ))}
        </Image.PreviewGroup>
      )}
      {value.length > 2 && <span style={{ fontSize: 10, color: '#999' }}>+{value.length - 2}</span>}
      <Upload showUploadList={false} accept="image/*"
        beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
        disabled={uploading}>
        <Tooltip title={uploading ? '上传中…' : '上传工艺图片'} mouseEnterDelay={0.5}>
          <CameraOutlined style={{ fontSize: 13, color: uploading ? '#1677ff' : '#bbb', cursor: uploading ? 'wait' : 'pointer', flexShrink: 0 }} />
        </Tooltip>
      </Upload>
    </div>
  );
};

export const NewRowAttachmentUpload: React.FC<{
  value: AttachmentFile[];
  onChange: (files: AttachmentFile[]) => void;
}> = ({ value, onChange }) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = React.useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        onChange([...value, { name: file.name, url: res.data }]);
        msg.success('附件上传成功');
      } else {
        msg.error(res.message || '上传失败');
      }
    } catch { msg.error('上传失败，请重试'); }
    finally { setUploading(false); }
    return false;
  };

  const popoverContent = (
    <div style={{ minWidth: 180, maxWidth: 300 }}>
      {value.length === 0 && <div style={{ color: '#999', fontSize: 12, padding: '4px 0' }}>暂无附件</div>}
      {value.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
          <PaperClipOutlined style={{ color: '#1677ff', flexShrink: 0, fontSize: 12 }} />
          <a onClick={(e) => { e.preventDefault(); downloadFile(f.url, f.name); }}
            href="#" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, cursor: 'pointer' }}>
            {f.name}
          </a>
        </div>
      ))}
      <Upload showUploadList={false}
        beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
        disabled={uploading}>
        <Button icon={<PaperClipOutlined />} loading={uploading} style={{ marginTop: 6, width: '100%' }}>
          上传附件
        </Button>
      </Upload>
    </div>
  );

  return (
    <Popover content={popoverContent} title="附件" trigger="click" placement="bottomRight">
      <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 4px' }}
        onClick={(e) => e.stopPropagation()}>
        <PaperClipOutlined style={{ fontSize: 14, color: value.length > 0 ? '#1677ff' : '#bbb' }} />
        {value.length > 0 && <span style={{ fontSize: 12, color: '#1677ff' }}>{value.length}</span>}
      </div>
    </Popover>
  );
};
