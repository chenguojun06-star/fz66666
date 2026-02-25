import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Upload, Tag, Space, Modal } from 'antd';
import {
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { StyleAttachment } from '@/types/style';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface Props {
  styleId: string | number;
  bizType?: string;
  uploadText?: string;
  readOnly?: boolean;
  onListChange?: (list: StyleAttachment[]) => void;
}

const StyleAttachmentTab: React.FC<Props> = ({ styleId, bizType, uploadText, readOnly, onListChange }) => {
  const [data, setData] = useState<StyleAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const { tableScrollY } = useViewport();
  const { message } = App.useApp();

  const isPattern = useMemo(() => {
    const type = String(bizType || '').trim().toLowerCase();
    return type === 'pattern' || type === 'pattern_grading';
  }, [bizType]);

  const acceptExts = useMemo(() => {
    if (isPattern) {
      return ['.dxf', '.plt', '.ets'];
    }
    return [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.bmp',
      '.pdf',
      '.xlsx',
      '.xls',
      '.doc',
      '.docx',
      '.dxf',
      '.plt',
      '.zip',
      '.rar',
      '.7z',
    ];
  }, [isPattern]);

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
    if (!styleId || styleId === 'undefined') {
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<StyleAttachment[]>('/style/attachment/list', {
        params: { styleId, ...(bizType ? { bizType } : {}) },
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
  }, [styleId, bizType]);

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
    } catch (error: any) {
      message.error(`删除失败（${error?.message || '请求失败'}）`);
    }
  };

  // 上传文件
  const uploadOne = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      message.error('文件过大，最大15MB');
      return Upload.LIST_IGNORE;
    }
    const ext = getExt(file.name);
    const type = String(file.type || '').toLowerCase();
    const mimeOk =
      type.startsWith('image/') ||
      type === 'application/pdf' ||
      type === 'application/vnd.ms-excel' ||
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'application/msword' ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      type === 'application/zip' ||
      type === 'application/x-zip-compressed' ||
      type === 'application/x-rar-compressed' ||
      type === 'application/x-7z-compressed' ||
      type === 'application/octet-stream'; // 用于 dxf/plt/ets 等特殊格式

    const extOk = acceptExts.includes(ext);

    if (isPattern) {
      if (!extOk) {
        message.error('仅支持上传 dxf/plt/ets 格式的纸样文件');
        return Upload.LIST_IGNORE;
      }
    } else {
      if (!mimeOk && !extOk) {
        message.error('不支持的文件类型');
        return Upload.LIST_IGNORE;
      }
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('styleId', String(styleId));
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
    } catch (error: any) {
      message.error(error?.message || '上传失败');
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

  const printByIframe = (url: string) => {
    const src = getFullAuthedFileUrl(url);
    if (!src) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = src;
    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
    // Intentionally empty
      // 忽略错误
        return;
      }
    };
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
    // Intentionally empty
      // 忽略错误
        return;
      } finally {
        setTimeout(cleanup, 1500);
      }
    };
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
    // Intentionally empty
      // 忽略错误
        return;
      }
    }, 900);
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      width: 260,
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => {
        // 将相对路径转换为带认证的完整URL
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
      width: 80,
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
      width: 110,
      render: (_: any, record: StyleAttachment) => {
        const type = resolveFileType(record);
        const show = type.includes('/') ? type.split('/')[1] || type : type;
        return <Tag>{show || '-'}</Tag>;
      }
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      width: 110,
      render: (size: number) => formatSize(size)
    },
    {
      title: '上传人',
      dataIndex: 'uploader',
      width: 140,
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      width: 180,
      ellipsis: true,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      resizable: false,
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
      <div style={{ marginBottom: 16 }}>
        <Upload
          multiple
          accept={acceptExts.join(',')}
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
        <span style={{ marginLeft: 16, color: 'var(--neutral-text-lighter)', fontSize: 'var(--font-size-sm)', lineHeight: 1.4 }}>
          {isPattern ? '仅支持dxf/plt/ets，单个文件不超过10MB，一次最多上传4个' : '支持设计稿、工艺单、PDF、纸样(dxf/plt/ets)等，单个文件不超过10MB，一次最多上传4个'}
        </span>
      </div>

      <ResizableTable
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content', y: tableScrollY }}
        storageKey={`style-attachment-${String(styleId)}`}
        minColumnWidth={70}
      />
    </div>
  );
};

export default StyleAttachmentTab;
