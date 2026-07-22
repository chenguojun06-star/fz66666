import React from 'react';
import { Tag, Space, Modal } from 'antd';
import {
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { StyleAttachment } from '@/types/style';
import {
  getExt,
  resolveFileType,
  formatSize,
  canPrintRecord,
  buildDownloadUrl,
  printByIframe,
} from './helpers';

interface AttachmentTableProps {
  data: StyleAttachment[];
  loading: boolean;
  isPattern: boolean;
  readOnly?: boolean;
  onDelete: (id: string | number) => void;
}

const getFileIcon = (type: string) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(t)) return <FileImageOutlined style={{ color: 'var(--color-success)' }} />;
  if (t.includes('pdf') || t === 'pdf') return <FilePdfOutlined style={{ color: 'var(--color-danger)' }} />;
  return <FileOutlined style={{ color: 'var(--primary-color)' }} />;
};

const AttachmentTable: React.FC<AttachmentTableProps> = ({
  data,
  loading,
  isPattern,
  readOnly,
  onDelete,
}) => {
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
                  onOk: () => onDelete(record.id!),
                });
              },
          },
        ];

        return <RowActions maxInline={3} actions={actions as any} />;
      },
    }
  ];

  return (
    <ResizableTable
      storageKey="style-attachment-table"
      columns={columns as any}
      dataSource={data}
      rowKey="id"
      loading={loading}
      emptyDescription="暂无数据"
      pagination={false}
      scroll={{ x: 'max-content' }}
    />
  );
};

export default AttachmentTable;
