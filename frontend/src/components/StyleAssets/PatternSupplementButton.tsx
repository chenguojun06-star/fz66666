import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Space, Tag, Upload, message as antdMessage } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { StyleAttachment } from '@/types/style';
import ResizableModal, {
  useResizableModalTableScrollY,
} from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';

type IdLike = string | number;

const PatternSupplementButton: React.FC<{
  styleId?: IdLike;
  styleNo?: string;
}> = ({ styleId, styleNo }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const tableScrollY = useResizableModalTableScrollY({ open, ref: tableWrapRef });

  const fetchList = useCallback(async () => {
    if (!styleId && !styleNo) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any[] }>('/style/attachment/list', {
        params: { styleId, styleNo, bizType: 'pattern_supplement' },
      });
      if (res.code === 200) {
        setData((res.data || []) as StyleAttachment[]);
      } else {
        setData([]);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo]);

  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  const handleUpload = async (file: File) => {
    if (!styleId && !styleNo) {
      antdMessage.error('缺少款式信息');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (styleId) formData.append('styleId', String(styleId));
      if (styleNo) formData.append('styleNo', String(styleNo));

      const res = await api.post<{ code: number; message: string; data?: StyleAttachment }>(
        '/style/attachment/pattern/supplement/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      if (res.code === 200) {
        antdMessage.success('补充纸样上传成功');
        fetchList();
      } else {
        antdMessage.error(res.message || '上传失败');
      }
    } catch {
      antdMessage.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleClaim = async (id: string) => {
    try {
      const res = await api.post<{ code: number; message: string }>(`/style/attachment/pattern/supplement/${id}/claim`);
      if (res.code === 200) {
        antdMessage.success('已领取');
        fetchList();
      } else {
        antdMessage.error(res.message || '领取失败');
      }
    } catch {
      antdMessage.error('领取失败');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      const res = await api.post<{ code: number; message: string }>(`/style/attachment/pattern/supplement/${id}/complete`);
      if (res.code === 200) {
        antdMessage.success('已完成');
        fetchList();
      } else {
        antdMessage.error(res.message || '操作失败');
      }
    } catch {
      antdMessage.error('操作失败');
    }
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 200,
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => {
        const fileUrl = getFullAuthedFileUrl(record.fileUrl);
        return (
          <a href={fileUrl} target="_blank" rel="noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' }}>
            {text}
          </a>
        );
      },
    },
    {
      title: '上传人',
      dataIndex: 'uploader',
      key: 'uploader',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: (v: string) => formatDateTime(v) || '-',
    },
    {
      title: '领取人',
      dataIndex: 'claimUser',
      key: 'claimUser',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '领取时间',
      dataIndex: 'claimTime',
      key: 'claimTime',
      width: 150,
      render: (v: string) => formatDateTime(v) || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completeTime',
      key: 'completeTime',
      width: 150,
      render: (v: string) => formatDateTime(v) || '-',
    },
    {
      title: '状态',
      key: 'statusTag',
      width: 90,
      render: (_: any, record: StyleAttachment) => {
        if (record.completeTime) return <Tag color="green">已完成</Tag>;
        if (record.claimTime) return <Tag color="blue">已领取</Tag>;
        return <Tag color="orange">待领取</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: StyleAttachment) => {
        const id = String(record.id || '');
        if (!id) return null;
        if (record.completeTime) return null;
        if (record.claimTime) {
          return <Button size="small" type="link" onClick={() => handleComplete(id)}>完成</Button>;
        }
        return <Button size="small" type="link" onClick={() => handleClaim(id)}>领取</Button>;
      },
    },
  ];

  const storageKey = `pattern-supplement-${String(styleId ?? styleNo ?? '')}`;

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>补充</Button>
      <ResizableModal
        open={open}
        title={`补充纸样（${styleNo || styleId || ''}）`}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.7)}
        onCancel={() => setOpen(false)}
        footer={
          <Space>
            <Upload
              showUploadList={false}
              beforeUpload={(file) => { handleUpload(file); return false; }}
              accept=".dxf,.plt,.ets,.prj,.pdf,.jpg,.jpeg,.png,.zip,.rar"
            >
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>上传纸样</Button>
            </Upload>
            <Button onClick={() => setOpen(false)}>关闭</Button>
          </Space>
        }
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={tableWrapRef} style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ResizableTable
              rowKey={(r) => String((r as any).id)}
              columns={columns as any}
              dataSource={data as any}
              loading={loading}
              pagination={false}
              scroll={{ x: 'max-content', y: tableScrollY }}
              storageKey={storageKey}
            />
          </div>
        </div>
      </ResizableModal>
    </>
  );
};

export default PatternSupplementButton;
