import React from 'react';
import { Button, Space, Tag, Tooltip } from 'antd';
import api from '@/utils/api';
import { StyleAttachment } from '@/types/style';
import ResizableModal, {
  useResizableModalTableScrollY,
} from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { useAuth } from '@/utils/AuthContext';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { message } from '@/utils/antdStatic';

type IdLike = string | number;

const StyleAttachmentsButton: React.FC<{
  styleId?: IdLike;
  styleNo?: string;
  buttonText?: string;
  modalTitle?: string;
  bizTypes?: string[];
  onlyActive?: boolean;
  onModalClose?: () => void;
}> = ({ styleId, styleNo, buttonText = '纸样', modalTitle = '纸样附件', bizTypes, onlyActive, onModalClose }) => {
  const { user } = useAuth();
  const isAdmin = user?.permissions?.includes('system:manage') ?? false;
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<StyleAttachment[]>([]);

  const tableWrapRef = React.useRef<HTMLDivElement | null>(null);
  const tableScrollY = useResizableModalTableScrollY({ open, ref: tableWrapRef });

  const fetchList = React.useCallback(async () => {
    if (!styleId && !styleNo) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any[] }>('/style/attachment/list', { params: { styleId, styleNo } });
      if (res.code === 200) {
        let attachments = res.data || [];
        const normalizedBizTypes = (bizTypes || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (normalizedBizTypes.length) {
          attachments = attachments.filter((item: any) => {
            const bizType = String((item as any)?.bizType || '').trim();
            return normalizedBizTypes.includes(bizType);
          });
        } else {
          attachments = attachments.filter((item: any) => {
            const bizType = String((item as any)?.bizType || '').trim();
            return bizType === 'pattern' || bizType === 'pattern_grading'
              || bizType === 'pattern_final' || bizType === 'pattern_grading_final';
          });
        }
        if (onlyActive) {
          attachments = attachments.filter((item: any) => String((item as any)?.status || 'active') === 'active');
        }
        setData(attachments as StyleAttachment[]);
      } else {
        setData([]);
        message.error(res.message || '获取附件失败');
      }
    } catch (e: unknown) {
      setData([]);
      message.error(e instanceof Error ? e.message : '获取附件失败');
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo]);

  React.useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  const columns = [
    {
      title: '纸样类型',
      dataIndex: 'bizType',
      key: 'bizType',
      width: 120,
      render: (t: string) => {
        if (t === 'pattern') return <Tag color="blue">原始纸样</Tag>;
        if (t === 'pattern_final') return <Tag color="blue">原始纸样 </Tag>;
        if (t === 'pattern_grading') return <Tag color="green">放码纸样</Tag>;
        if (t === 'pattern_grading_final') return <Tag color="green">放码纸样 </Tag>;
        if (t === 'order') return <Tag color="purple">下单附件</Tag>;
        return <Tag>{t}</Tag>;
      }
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: number) => v ? `V${v}` : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: string) => {
        if (s === 'active') return <Tag color="green">使用中</Tag>;
        if (s === 'archived') return <Tag color="default">已归档</Tag>;
        return <Tag>{s || '使用中'}</Tag>;
      }
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 240,
      ellipsis: true,
      render: (text: string, record: StyleAttachment) => {
        const isArchived = record.status === 'archived';
        const canDownload = !isArchived || isAdmin;

        if (!canDownload) {
          return (
            <Tooltip title="旧版本仅管理员可下载">
              <span style={{ color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }}>{text}</span>
            </Tooltip>
          );
        }

        const fileUrl = getFullAuthedFileUrl(record.fileUrl);

        return (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {text}
          </a>
        );
      }
    },
    {
      title: '文件类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 100,
      render: (t: string) => <Tag>{String(t || '').split('/')[1] || t}</Tag>
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
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
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => {
          setOpen(false);
          onModalClose?.();
        }}
        footer={<Space><Button onClick={() => {
          setOpen(false);
          onModalClose?.();
        }}>关闭</Button></Space>}
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

export default StyleAttachmentsButton;
