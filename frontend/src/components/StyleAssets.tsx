import React from 'react';
import { Button, Space, Tag, message } from 'antd';
import api from '../utils/api';
import { StyleAttachment } from '../types/style';
import ResizableModal from './ResizableModal';
import ResizableTable from './ResizableTable';

type IdLike = string | number;

export const StyleCoverThumb: React.FC<{
  styleId?: IdLike;
  styleNo?: string;
  src?: string | null;
  size?: number;
  borderRadius?: number;
}> = ({ styleId, styleNo, src, size = 48, borderRadius = 6 }) => {
  const [url, setUrl] = React.useState<string | null>(src || null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setUrl(src || null);
  }, [src]);

  React.useEffect(() => {
    let mounted = true;
    if (!styleId && !styleNo) return () => { mounted = false; };

    (async () => {
      setLoading(true);
      try {
        const res = await api.get<any>('/style/attachment/list', { params: { styleId, styleNo } });
        const result = res as any;
        if (result.code === 200) {
          const images = (result.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          const first = images[0]?.fileUrl || null;
          if (mounted) setUrl(first);
        }
      } catch {
        if (mounted) setUrl(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [styleId, styleNo, src]);

  return (
    <div style={{ width: size, height: size, borderRadius, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? (
        <span style={{ color: '#999', fontSize: 12 }}>...</span>
      ) : url ? (
        <img src={url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#ccc', fontSize: 12 }}>无图</span>
      )}
    </div>
  );
};

export const StyleAttachmentsButton: React.FC<{
  styleId?: IdLike;
  styleNo?: string;
  buttonText?: string;
  modalTitle?: string;
}> = ({ styleId, styleNo, buttonText = '附件', modalTitle = '附件' }) => {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<StyleAttachment[]>([]);

  const fetchList = React.useCallback(async () => {
    if (!styleId && !styleNo) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<any>('/style/attachment/list', { params: { styleId, styleNo } });
      const result = res as any;
      if (result.code === 200) {
        setData(result.data || []);
      } else {
        setData([]);
        message.error(result.message || '获取附件失败');
      }
    } catch (e: any) {
      setData([]);
      message.error(e?.message || '获取附件失败');
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo]);

  React.useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 320,
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => (
        <a
          href={record.fileUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {text}
        </a>
      )
    },
    {
      title: '类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 120,
      render: (t: string) => <Tag>{String(t || '').split('/')[1] || t}</Tag>
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      ellipsis: true,
    },
  ];

  const storageKey = `style-assets-${String(styleId ?? styleNo ?? '')}`;

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>{buttonText}</Button>
      <ResizableModal
        open={open}
        title={modalTitle}
        onCancel={() => setOpen(false)}
        footer={<Space><Button onClick={() => setOpen(false)}>关闭</Button></Space>}
        width="60vw"
        initialHeight={520}
        tableDensity="auto"
        scaleWithViewport
      >
        <ResizableTable
          rowKey={(r) => String((r as any).id)}
          columns={columns as any}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          storageKey={storageKey}
          minColumnWidth={70}
        />
      </ResizableModal>
    </>
  );
};
