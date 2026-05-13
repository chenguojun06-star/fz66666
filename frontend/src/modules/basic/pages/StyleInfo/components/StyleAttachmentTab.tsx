import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Upload, Tag, Space, Modal } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { StyleAttachment } from '@/types/style';
import api from '@/utils/api';
import RowActions from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl, getAuthedFileUrl } from '@/utils/fileUrl';

interface Props {
  styleId: string | number;
  styleNo?: string;
  bizType?: string;
  uploadText?: string;
  readOnly?: boolean;
  onListChange?: (list: StyleAttachment[]) => void;
}

const StyleAttachmentTab: React.FC<Props> = ({ styleId, styleNo, bizType, uploadText, readOnly, onListChange }) => {
  const [data, setData] = useState<StyleAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const normalizedStyleId = useMemo(() => {
    const value = String(styleId ?? '').trim();
    if (!value || value === 'undefined' || value === 'null') {
      return '';
    }
    return value;
  }, [styleId]);

  const normalizedStyleNo = useMemo(() => String(styleNo || '').trim(), [styleNo]);

  const isPattern = useMemo(() => {
    const type = String(bizType || '').trim().toLowerCase();
    return type === 'pattern' || type === 'pattern_grading';
  }, [bizType]);

  // 不限制格式，所有纸样/附件格式均允许上传（含 dxf/plt/ets/paj 及其他 CAD 格式）

  const getExt = (name?: string | null) => {
    const n = String(name || '').trim();
    const idx = n.lastIndexOf('.');
    if (idx < 0) return '';
    return n.slice(idx).toLowerCase();
  };

  const resolveFileType = (record: StyleAttachment) => {
    const t = String((record as any)?.fileType || '').trim();
    if (t) return t;
    const ext = getExt(record.fileName);
    return ext ? ext.slice(1) : '';
  };

  const debugValue = (value: unknown) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
    // Intentionally empty
      // 忽略错误
      return String(value);
    }
  };

  // 获取附件列表
  const fetchList = async () => {
    if (!normalizedStyleId && !normalizedStyleNo) {
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<StyleAttachment[]>('/style/attachment/list', {
        params: {
          ...(normalizedStyleId ? { styleId: normalizedStyleId } : {}),
          ...(normalizedStyleNo ? { styleNo: normalizedStyleNo } : {}),
          ...(bizType ? { bizType } : {}),
        },
      });
      const result = res as any;
      if (result.code === 200) {
        const list = Array.isArray(result.data) ? (result.data as StyleAttachment[]) : [];
        setData(list);
        onListChange?.(list);
      }
    } catch (error) {
      message.error('获取附件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [normalizedStyleId, normalizedStyleNo, bizType]);

  // 删除附件
  const handleDelete = async (id: string | number) => {
    try {
      const res = await api.delete(`/style/attachment/${id}`);
      const result = res as any;
      if (result.code === 200 && result.data === true) {
        message.success('删除成功');
        fetchList();
      } else {
        const detail = `code:${debugValue(result?.code)}, data:${debugValue(result?.data)}`;
        message.error(`${result?.message || '删除失败'}（${detail}）`);
      }
    } catch (error: unknown) {
      message.error(`删除失败（${error instanceof Error ? error.message : '请求失败'}）`);
    }
  };

  // 上传文件
  const uploadOne = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      message.error('文件过大，最大15MB');
      return Upload.LIST_IGNORE;
    }
    // 不限制文件类型，所有格式均允许（dxf/plt/ets/paj 等 CAD 纸样格式）
    if (!normalizedStyleId && !normalizedStyleNo) {
      message.error('请先保存基础信息，再上传附件');
      return Upload.LIST_IGNORE;
    }
    const formData = new FormData();
    formData.append('file', file);
    if (normalizedStyleId) {
      formData.append('styleId', normalizedStyleId);
    }
    if (normalizedStyleNo) {
      formData.append('styleNo', normalizedStyleNo);
    }
    if (bizType) {
      formData.append('bizType', String(bizType));
    }

    try {
      const res = await api.post('/style/attachment/upload', formData);
      const result = res as any;
      if (result.code === 200) {
        message.success('上传成功');
        fetchList();
      } else {
        message.error(result.message || '上传失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '上传失败');
    }
    return Upload.LIST_IGNORE;
  };

  // 获取文件图标
  const getFileIcon = (type: string) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(t)) return <FileImageOutlined style={{ color: 'var(--color-success)' }} />;
    if (t.includes('pdf') || t === 'pdf') return <FilePdfOutlined style={{ color: 'var(--color-danger)' }} />;
    return <FileOutlined style={{ color: 'var(--primary-color)' }} />;
  };

  // 格式化文件大小
  const formatSize = (size: number) => {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
    return (size / 1024 / 1024).toFixed(2) + ' MB';
  };

  const isWorkorderRecord = (record: StyleAttachment) => {
    const bt = String((record as any)?.bizType || '').trim().toLowerCase();
    if (bt === 'workorder') return true;
    const name = String(record.fileName || '').trim();
    return name.includes('生产制单');
  };

  const canPrintRecord = (record: StyleAttachment) => {
    if (!isWorkorderRecord(record)) return false;
    const ext = getExt(record.fileName);
    const t = resolveFileType(record).toLowerCase();
    return ext === '.pdf' || t.includes('pdf');
  };

  const buildDownloadUrl = (url: string) => {
    const src = getFullAuthedFileUrl(url);
    if (!src) return '';
    return src + (src.includes('?') ? '&' : '?') + 'download=1';
  };

  const printByIframe = async (url: string) => {
    const relativeUrl = getAuthedFileUrl(url);
    if (!relativeUrl) return;
    try {
      const resp = await fetch(relativeUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
      iframe.src = blobUrl;
      const cleanup = () => {
        try { document.body.removeChild(iframe); } catch { /* ignore */ }
        URL.revokeObjectURL(blobUrl);
      };
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch { /* ignore */ }
        setTimeout(cleanup, 1500);
      };
      document.body.appendChild(iframe);
    } catch {
      // fetch 失败时降级为新窗口打开
      window.open(getFullAuthedFileUrl(url), '_blank');
    }
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => {
        const fileUrl = getFullAuthedFileUrl(record.fileUrl);

        return (
          <Space style={{ maxWidth: '100%' }}>
            {getFileIcon(resolveFileType(record))}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'bottom',
              }}
            >
              {text}
            </a>
          </Space>
        );
      }
    },
    ...(isPattern ? [{
      title: '版本',
      dataIndex: 'version',
      render: (v: number, record: any) => {
        const version = v || 1;
        const status = record?.status || 'active';
        return (
          <Space size={4}>
            <Tag color={status === 'active' ? 'success' : 'default'}>V{version}</Tag>
            {status === 'archived' && <Tag color="default">历史</Tag>}
          </Space>
        );
      }
    }] : []),
    {
      title: '类型',
      dataIndex: 'fileType',
      render: (_: any, record: StyleAttachment) => {
        // 优先用文件名后缀，比原始 MIME type 更直观
        const ext = getExt(record.fileName);
        const show = ext ? ext.slice(1).toUpperCase() : resolveFileType(record).toUpperCase() || '-';
        return <Tag>{show}</Tag>;
      }
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      render: (size: number) => formatSize(size)
    },
    {
      title: '上传人',
      dataIndex: 'uploader',
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      ellipsis: true,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: StyleAttachment) => {
        const triggerDownload = () => {
          const url = buildDownloadUrl(record.fileUrl);
          if (!url) return;
          const a = document.createElement('a');
          a.href = url;
          a.download = String(record.fileName || '');
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
        };

        const actions = [
          {
            key: 'download',
            label: '下载',
            title: '下载',
            onClick: triggerDownload,
            primary: true,
          },
          ...(canPrintRecord(record)
            ? [
              {
                key: 'print',
                label: '打印',
                title: '打印',
                onClick: () => printByIframe(record.fileUrl),
                primary: true,
              },
            ]
            : []),
          {
            key: 'delete',
            label: '删除',
            title: '删除',
            danger: true,
            disabled: Boolean(readOnly),
            onClick: readOnly
              ? undefined
              : () => {
                Modal.confirm({
                  width: '30vw',
                  title: '确定删除?',
                  onOk: () => handleDelete(record.id!),
                });
              },
          },
        ];

        return <RowActions maxInline={3} actions={actions as any} />;
      },
    }
  ];

  return (
    <div className="style-attachment">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--neutral-text-lighter)', fontSize: 'var(--font-size-sm)', lineHeight: 1.4 }}>
          {'单个文件不超过10MB，一次最多上传4个'}
        </span>
        <Upload
          multiple
          accept="*"
          showUploadList={false}
          disabled={Boolean(readOnly)}
          beforeUpload={(file: any, fileList: unknown[]) => {
            if (readOnly) {
              return Upload.LIST_IGNORE;
            }
            const list = Array.isArray(fileList) ? fileList : [];
            if (list.length > 4) {
              if (list.indexOf(file) === 0) {
                message.error('一次最多上传4个附件');
              }
              if (list.indexOf(file) >= 4) {
                return Upload.LIST_IGNORE;
              }
            }
            return uploadOne(file as File);
          }}
        >
          <Button type="primary" disabled={Boolean(readOnly)}>{uploadText || '上传附件'}</Button>
        </Upload>
      </div>

      <ResizableTable
        storageKey="style-attachment-table"
        columns={columns as any}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={false}
       
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
};

export default StyleAttachmentTab;
