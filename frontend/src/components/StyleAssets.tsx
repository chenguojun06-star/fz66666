import React from 'react';
import { Button, Col, Row, Space, Tag, message, Tooltip } from 'antd';
import QRCodeBox from './common/QRCodeBox';
import api, { parseProductionOrderLines, sortSizeNames, toNumberSafe, ProductionOrderLine } from '../utils/api';
import { StyleAttachment } from '../types/style';
import ResizableModal, {
  useResizableModalTableScrollY,
} from './common/ResizableModal';
import ResizableTable from './common/ResizableTable';
import { useViewport } from '../utils/useViewport';
import { useAuth } from '../utils/AuthContext';

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
        const res = await api.get<{ code: number; data: unknown[] }>('/style/attachment/list', { params: { styleId, styleNo } });
        if (res.code === 200) {
          // 筛选图片类型附件
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          // 取第一张图片作为封面
          const first = (images[0] as any)?.fileUrl || null;
          if (mounted) setUrl(first);
        }
      } catch {
        // Intentionally empty
        // 忽略错误
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
        <span style={{ color: '#999', fontSize: 'var(--font-size-sm)' }}>...</span>
      ) : url ? (
        <img src={url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-sm)' }}>无图</span>
      )}
    </div>
  );
};

type OrderHeaderSizeItem = {
  size: string;
  quantity: number;
};

type OrderHeaderField = {
  label: string;
  value: React.ReactNode;
};

export const ProductionOrderHeader: React.FC<{
  order?: any | null;
  orderLines?: ProductionOrderLine[];
  sizeItems?: OrderHeaderSizeItem[];
  totalQuantity?: number;
  color?: string;
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  styleId?: IdLike;
  styleCover?: string | null;
  qrCodeValue?: string;
  coverSize?: number;
  qrSize?: number;
  className?: string;
  extraFields?: OrderHeaderField[];
}> = ({
  order,
  orderLines,
  sizeItems,
  totalQuantity,
  color,
  orderNo,
  styleNo,
  styleName,
  styleId,
  styleCover,
  qrCodeValue,
  coverSize = 160,
  qrSize = 120,
  className,
  extraFields,
}) => {
    const resolvedOrderNo = String(orderNo ?? (order as Record<string, unknown>)?.orderNo ?? (order as Record<string, unknown>)?.productionOrderNo ?? '').trim();
    const resolvedStyleNo = String(styleNo ?? (order as Record<string, unknown>)?.styleNo ?? '').trim();
    const resolvedStyleName = String(styleName ?? (order as Record<string, unknown>)?.styleName ?? '').trim();
    const resolvedStyleId = (styleId ?? (order as Record<string, unknown>)?.styleId) as IdLike | undefined;
    const resolvedCover = (styleCover ?? (order as Record<string, unknown>)?.styleCover ?? null) as string | null;
    const resolvedColor = String(color ?? (order as Record<string, unknown>)?.color ?? '').trim();

    const computedSizeItems = React.useMemo(() => {
      if (sizeItems) return sizeItems;
      const lines = orderLines ?? parseProductionOrderLines(order);
      const map = new Map<string, number>();
      lines.forEach((l) => {
        const s = String(l.size || '').trim();
        if (!s) return;
        map.set(s, (map.get(s) || 0) + toNumberSafe(l.quantity));
      });
      const sizes = sortSizeNames(Array.from(map.keys()));
      return sizes.map((s) => ({ size: s, quantity: map.get(s) || 0 }));
    }, [sizeItems, orderLines, order]);

    const computedTotal = React.useMemo(() => {
      if (typeof totalQuantity === 'number') return totalQuantity;
      if (computedSizeItems.length) {
        return computedSizeItems.reduce((sum, item) => sum + toNumberSafe(item.quantity), 0);
      }
      return toNumberSafe((order as Record<string, unknown>)?.orderQuantity);
    }, [totalQuantity, computedSizeItems, order]);

    const qrValue = qrCodeValue
      ?? (String((order as Record<string, unknown>)?.qrCode || '').trim()
        || (resolvedOrderNo
          ? JSON.stringify({
            type: 'order',
            orderNo: resolvedOrderNo,
            styleNo: resolvedStyleNo,
            styleName: resolvedStyleName,
          })
          : ''));

    const fields: OrderHeaderField[] = [
      { label: '订单号', value: <span className="order-no-compact">{resolvedOrderNo || '-'}</span> },
      { label: '款号', value: resolvedStyleNo || '-' },
      { label: '款名', value: resolvedStyleName || '-' },
      { label: '颜色', value: resolvedColor || '-' },
      ...(extraFields || []),
    ];

    return (
      <Row gutter={16} className={`purchase-detail-top${className ? ` ${className}` : ''}`}>
        <Col xs={24} md={8} lg={6}>
          <div className="purchase-detail-right">
            <StyleCoverThumb
              styleId={resolvedStyleId}
              styleNo={resolvedStyleNo}
              src={resolvedCover}
              size={coverSize}
              borderRadius={8}
            />
            {qrValue ? (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <QRCodeBox
                  value={qrValue}
                  label={`订单号: ${resolvedOrderNo || '-'}`}
                  variant="primary"
                  size={qrSize}
                />
              </div>
            ) : null}
          </div>
        </Col>
        <Col xs={24} md={16} lg={18}>
          <div className="purchase-detail-left">
            <Row gutter={16}>
              {fields.map((field, idx) => (
                <Col key={`${field.label}-${idx}`} xs={24} sm={12} lg={8}>
                  <div className="purchase-detail-field">
                    <div className="purchase-detail-label">{field.label}</div>
                    <div className="purchase-detail-value">{field.value}</div>
                  </div>
                </Col>
              ))}
            </Row>

            <div className="purchase-detail-size-block">
              <div className="purchase-detail-size-table-wrap">
                <table className="purchase-detail-size-table">
                  <tbody>
                    <tr>
                      <th className="purchase-detail-size-th">码数</th>
                      {computedSizeItems.length
                        ? computedSizeItems.map((x) => (
                          <td key={x.size} className="purchase-detail-size-td">{x.size}</td>
                        ))
                        : <td className="purchase-detail-size-td">-</td>
                      }
                      <td className="purchase-detail-size-total-cell" />
                    </tr>
                    <tr>
                      <th className="purchase-detail-size-th">数量</th>
                      {computedSizeItems.length
                        ? computedSizeItems.map((x) => (
                          <td key={x.size} className="purchase-detail-size-td">{toNumberSafe(x.quantity)}</td>
                        ))
                        : <td className="purchase-detail-size-td">-</td>
                      }
                      <td className="purchase-detail-size-total-cell">总下单数：{toNumberSafe(computedTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Col>
      </Row>
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
  /** 模态框标题，默认"纸样附件" */
  modalTitle?: string;
  /** 仅展示指定业务类型 */
  bizTypes?: string[];
  /** @deprecated 已废弃，不再使用 */
  onlyGradingPattern?: boolean;
  /** 仅显示使用中的最新纸样（隐藏归档历史版本） */
  onlyActive?: boolean;
  /** 模态框关闭时的回调 */
  onModalClose?: () => void;
}> = ({ styleId, styleNo, buttonText = '纸样', modalTitle = '纸样附件', bizTypes, onlyActive, onModalClose }) => {
  const { modalWidth: _modalWidth } = useViewport();
  const { user } = useAuth();
  // 检查是否为管理员（拥有system:manage权限）
  const isAdmin = user?.permissions?.includes('system:manage') ?? false;
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
      const res = await api.get<{ code: number; message: string; data: unknown[] }>('/style/attachment/list', { params: { styleId, styleNo } });
      if (res.code === 200) {
        let attachments = res.data || [];
        const normalizedBizTypes = (bizTypes || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (normalizedBizTypes.length) {
          attachments = attachments.filter((item: any) => {
            const bizType = String((item as Record<string, unknown>)?.bizType || '').trim();
            return normalizedBizTypes.includes(bizType);
          });
        } else {
          // 默认筛选纸样类型附件（包括开发中和已完成流转的）
          // pattern/pattern_grading: 开发中的纸样
          // pattern_final/pattern_grading_final: 样衣完成后流转到数据中心的纸样
          attachments = attachments.filter((item: any) => {
            const bizType = String((item as Record<string, unknown>)?.bizType || '').trim();
            return bizType === 'pattern' || bizType === 'pattern_grading'
              || bizType === 'pattern_final' || bizType === 'pattern_grading_final';
          });
        }
        // 在指定场景下，仅展示使用中的最新纸样，隐藏归档历史版本
        if (onlyActive) {
          attachments = attachments.filter((item: any) => String((item as Record<string, unknown>)?.status || 'active') === 'active');
        }
        setData(attachments as StyleAttachment[]);
      } else {
        setData([]);
        message.error(res.message || '获取附件失败');
      }
    } catch (e: unknown) {
      setData([]);
      message.error((e as Error)?.message || '获取附件失败');
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo]);

  // 检查纸样类型分布
  const patternTypeInfo = React.useMemo(() => {
    const hasPattern = data.some((item) => item.bizType === 'pattern' || item.bizType === 'pattern_final');
    const hasGrading = data.some((item) => item.bizType === 'pattern_grading' || item.bizType === 'pattern_grading_final');
    return { hasPattern, hasGrading, onlyOneType: (hasPattern && !hasGrading) || (!hasPattern && hasGrading) };
  }, [data]);

  // 当模态框打开时获取附件列表
  React.useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // 表格列配置
  const columns = [
    {
      title: '纸样类型',
      dataIndex: 'bizType',
      key: 'bizType',
      width: 120,
      render: (t: string) => {
        if (t === 'pattern') return <Tag color="blue">原始纸样</Tag>;
        if (t === 'pattern_final') return <Tag color="blue">原始纸样 ✓</Tag>;
        if (t === 'pattern_grading') return <Tag color="green">放码纸样</Tag>;
        if (t === 'pattern_grading_final') return <Tag color="green">放码纸样 ✓</Tag>;
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
              <span style={{ color: '#999', cursor: 'not-allowed' }}>{text}</span>
            </Tooltip>
          );
        }

        // 将相对路径转换为后端完整URL
        const fileUrl = record.fileUrl?.startsWith('http')
          ? record.fileUrl
          : `${window.location.protocol}//${window.location.hostname}:8088${record.fileUrl}`;

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
        width="60vw"
        initialHeight={580}
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
          {/* 纸样类型提示 */}
          {!loading && data.length > 0 && patternTypeInfo.onlyOneType && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: 4,
              fontSize: 13,
              color: '#ad6800'
            }}>
              ⚠️ 当前只有{patternTypeInfo.hasPattern ? '原始纸样' : '放码纸样'}，
              {patternTypeInfo.hasPattern ? '缺少放码纸样' : '缺少原始纸样'}，请补充上传
            </div>
          )}
          {!loading && data.length === 0 && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 4,
              fontSize: 13,
              color: '#a8071a'
            }}>
              ⚠️ 暂无纸样附件，请先上传原始纸样和放码纸样
            </div>
          )}
          <div ref={tableWrapRef} style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ResizableTable
              rowKey={(r) => String((r as Record<string, unknown>).id)}
              columns={columns as any}
              dataSource={data as any}
              loading={loading}
              pagination={false}
              scroll={{ x: 'max-content', y: tableScrollY }}
              storageKey={storageKey}
              minColumnWidth={70}
            />
          </div>
        </div>
      </ResizableModal>
    </>
  );
};
