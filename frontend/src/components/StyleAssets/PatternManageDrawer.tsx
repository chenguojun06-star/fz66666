import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Drawer, Space, Tabs, Tag, message as antdMessage } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { StyleAttachment } from '@/types/style';
import ResizableTable from '@/components/common/ResizableTable';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';

type IdLike = string | number;

/**
 * 纸样管理侧滑弹窗（大货生产裁剪列表使用）
 * 原「纸样下载」与「补充」两个按钮合并为一个「纸样」按钮，
 * 点击打开侧滑弹窗：Tab「下载」= 纸样附件列表（可下载），Tab「补充」= 补充纸样上传。
 */
const PatternManageDrawer: React.FC<{
  styleId?: IdLike;
  styleNo?: string;
  buttonText?: string;
}> = ({ styleId, styleNo, buttonText = '纸样' }) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('download');

  // 下载 Tab 状态
  const [dlLoading, setDlLoading] = useState(false);
  const [dlData, setDlData] = useState<StyleAttachment[]>([]);

  // 补充 Tab 状态
  const [supLoading, setSupLoading] = useState(false);
  const [supData, setSupData] = useState<StyleAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptFormats = '.dxf,.plt,.ets,.prj,.pdf,.jpg,.jpeg,.png,.zip,.rar';

  const fetchDownloadList = useCallback(async () => {
    if (!styleId && !styleNo) {
      setDlData([]);
      return;
    }
    setDlLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any[] }>('/style/attachment/list', { params: { styleId, styleNo } });
      if (res.code === 200) {
        const list = (res.data || []).filter((item: any) => {
          const bizType = String((item as any)?.bizType || '').trim();
          return bizType === 'pattern' || bizType === 'pattern_grading'
            || bizType === 'pattern_final' || bizType === 'pattern_grading_final'
            || String((item as any)?.status || 'active') === 'active';
        });
        setDlData(list as StyleAttachment[]);
      } else {
        setDlData([]);
      }
    } catch {
      setDlData([]);
    } finally {
      setDlLoading(false);
    }
  }, [styleId, styleNo]);

  const fetchSupplementList = useCallback(async () => {
    if (!styleId && !styleNo) {
      setSupData([]);
      return;
    }
    setSupLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any[] }>('/style/attachment/list', {
        params: { styleId, styleNo, bizType: 'pattern_supplement' },
      });
      if (res.code === 200) {
        setSupData((res.data || []) as StyleAttachment[]);
      } else {
        setSupData([]);
      }
    } catch {
      setSupData([]);
    } finally {
      setSupLoading(false);
    }
  }, [styleId, styleNo]);

  useEffect(() => {
    if (!open) return;
    fetchDownloadList();
    fetchSupplementList();
  }, [open, fetchDownloadList, fetchSupplementList]);

  const handleUpload = useCallback(async (file: File) => {
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
        fetchSupplementList();
      } else {
        antdMessage.error(res.message || '上传失败');
      }
    } catch {
      antdMessage.error('上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [styleId, styleNo, fetchSupplementList]);

  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    void handleUpload(arr[0]);
  }, [handleUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleFileSelect(files);
    }
  }, [handleFileSelect]);

  const handleClaim = async (id: string) => {
    try {
      const res = await api.post<{ code: number; message: string }>(`/style/attachment/pattern/supplement/${id}/claim`);
      if (res.code === 200) {
        antdMessage.success('已领取');
        fetchSupplementList();
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
        fetchSupplementList();
      } else {
        antdMessage.error(res.message || '操作失败');
      }
    } catch {
      antdMessage.error('操作失败');
    }
  };

  // 下载 Tab：纸样附件列表
  const downloadColumns = [
    {
      title: '纸样类型',
      dataIndex: 'bizType',
      key: 'bizType',
      width: 110,
      render: (t: string) => {
        if (t === 'pattern' || t === 'pattern_final') return <Tag color="blue">原始纸样</Tag>;
        if (t === 'pattern_grading' || t === 'pattern_grading_final') return <Tag color="green">放码纸样</Tag>;
        return <Tag>{t || '-'}</Tag>;
      },
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: number) => (v ? `V${v}` : '-'),
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 260,
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => (
        <a href={getFullAuthedFileUrl(record.fileUrl)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {text}
        </a>
      ),
    },
    {
      title: '文件类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 100,
      render: (t: string) => <Tag>{String(t || '').split('/')[1] || t || '-'}</Tag>,
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      ellipsis: true,
      render: (v: string) => formatDateTime(v) || '-',
    },
  ];

  // 补充 Tab：补充纸样列表
  const supplementColumns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 220,
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => (
        <a href={getFullAuthedFileUrl(record.fileUrl)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {text}
        </a>
      ),
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
      width: 100,
      render: (_: any, record: StyleAttachment) => {
        const id = String(record.id || '');
        if (!id || record.completeTime) return null;
        if (record.claimTime) {
          return <Button type="link" size="small" onClick={() => handleComplete(id)}>完成</Button>;
        }
        return <Button type="link" size="small" onClick={() => handleClaim(id)}>领取</Button>;
      },
    },
  ];

  const storageKey = `pattern-manage-${String(styleId ?? styleNo ?? '')}`;

  return (
    <>
      <Button onClick={() => setOpen(true)} icon={<DownloadOutlined />}>{buttonText}</Button>
      <Drawer
        title={`纸样管理（${styleNo || styleId || ''}）`}
        open={open}
        onClose={() => setOpen(false)}
        placement="right"
        styles={{ wrapper: { width: '85%' }, body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', overflow: 'auto' } }}
        destroyOnHidden
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'download',
              label: '纸样下载',
              children: (
                <ResizableTable
                  rowKey={(r) => String((r as any).id)}
                  columns={downloadColumns as any}
                  dataSource={dlData as any}
                  loading={dlLoading}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  storageKey={`${storageKey}-download`}
                  emptyDescription="暂无纸样附件"
                />
              ),
            },
            {
              key: 'supplement',
              label: '补充纸样',
              children: (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={handleDrop}
                  onPaste={handlePaste}
                >
                  <Space>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={acceptFormats}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files?.length) handleFileSelect(e.target.files);
                      }}
                    />
                    <Button
                      type="primary"
                      icon={<UploadOutlined />}
                      loading={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      上传纸样
                    </Button>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      支持拖拽/粘贴文件，格式：{acceptFormats}
                    </span>
                  </Space>
                  <ResizableTable
                    rowKey={(r) => String((r as any).id)}
                    columns={supplementColumns as any}
                    dataSource={supData as any}
                    loading={supLoading}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    storageKey={`${storageKey}-supplement`}
                    emptyDescription="暂无补充纸样"
                  />
                </div>
              ),
            },
          ]}
        />
      </Drawer>
    </>
  );
};

export default PatternManageDrawer;
