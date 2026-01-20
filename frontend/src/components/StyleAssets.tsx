import React from 'react';
import { Button, Space, Tag, message } from 'antd';
import api from '../utils/api';
import { StyleAttachment } from '../types/style';
import ResizableModal, {
  ResizableModalFlex,
  ResizableModalFlexFill,
  useResizableModalTableScrollY,
} from './common/ResizableModal';
import ResizableTable from './common/ResizableTable';

/**
 * 标识类型定义
 */
type IdLike = string | number;

/**
 * 款号封面缩略图组件
 */
export const StyleCoverThumb: React.FC<{
  /** 款号标识 */
  styleId?: IdLike;
  /** 款号编号 */
  styleNo?: string;
  /** 封面图片链接 */
  src?: string | null;
  /** 缩略图尺寸，默认48px */
  size?: number;
  /** 圆角半径，默认6px */
  borderRadius?: number;
}> = ({ styleId, styleNo, src, size = 48, borderRadius = 6 }) => {
  // 图片链接状态
  const [url, setUrl] = React.useState<string | null>(src || null);
  // 加载状态
  const [loading, setLoading] = React.useState(false);

  // 当src变化时更新链接
  React.useEffect(() => {
    setUrl(src || null);
  }, [src]);

  // 加载款号封面图片
  React.useEffect(() => {
    let mounted = true;
    if (!styleId && !styleNo) return () => { mounted = false; };

    (async () => {
      setLoading(true);
      try {
        // 获取款号附件列表
        const res = await api.get<any>('/style/attachment/list', { params: { styleId, styleNo } });
        const result = res as any;
        if (result.code === 200) {
          // 筛选图片类型附件
          const images = (result.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          // 取第一张图片作为封面
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

/**
 * 款号附件按钮组件
 */
export const StyleAttachmentsButton: React.FC<{
  /** 款号ID */
  styleId?: IdLike;
  /** 款号编号 */
  styleNo?: string;
  /** 按钮文本，默认"附件" */
  buttonText?: string;
  /** 模态框标题，默认"附件" */
  modalTitle?: string;
}> = ({ styleId, styleNo, buttonText = '附件', modalTitle = '附件' }) => {
  // 模态框打开状态
  const [open, setOpen] = React.useState(false);
  // 加载状态
  const [loading, setLoading] = React.useState(false);
  // 附件数据列表
  const [data, setData] = React.useState<StyleAttachment[]>([]);

  const tableWrapRef = React.useRef<HTMLDivElement | null>(null);
  const tableScrollY = useResizableModalTableScrollY({ open, ref: tableWrapRef });

  // 获取附件列表
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

  // 当模态框打开时获取附件列表
  React.useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // 表格列配置
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

  // 本地存储键名
  const storageKey = `style-assets-${String(styleId ?? styleNo ?? '')}`;

  return (
    <>
      {/* 附件按钮 */}
      <Button size="small" onClick={() => setOpen(true)}>{buttonText}</Button>
      {/* 附件列表模态框 */}
      <ResizableModal
        open={open}
        title={modalTitle}
        onCancel={() => setOpen(false)}
        footer={<Space><Button onClick={() => setOpen(false)}>关闭</Button></Space>}
        width={
          typeof window === 'undefined'
            ? '60vw'
            : window.innerWidth < 768
              ? '96vw'
              : window.innerWidth < 1024
                ? '66vw'
                : '60vw'
        }
        initialHeight={720}
        tableDensity="auto"
        scaleWithViewport
      >
        <ResizableModalFlex>
          <ResizableModalFlexFill ref={tableWrapRef}>
            <ResizableTable
              rowKey={(r) => String((r as any).id)}
              columns={columns as any}
              dataSource={data}
              loading={loading}
              pagination={false}
              scroll={{ x: 'max-content', y: tableScrollY }}
              storageKey={storageKey}
              minColumnWidth={70}
            />
          </ResizableModalFlexFill>
        </ResizableModalFlex>
      </ResizableModal>
    </>
  );
};
