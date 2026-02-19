import React from 'react';
import { Button, Col, Row, Space, Tag, message, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import api, { parseProductionOrderLines, sortSizeNames, toNumberSafe, ProductionOrderLine } from '../utils/api';
import { StyleAttachment } from '../types/style';
import ResizableModal, {
  useResizableModalTableScrollY,
} from './common/ResizableModal';
import ResizableTable from './common/ResizableTable';
import { useViewport } from '../utils/useViewport';
import { useAuth } from '../utils/AuthContext';
import { getFullAuthedFileUrl } from '../utils/fileUrl';

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
        const res = await api.get<{ code: number; data: any[] }>('/style/attachment/list', { params: { styleId, styleNo } });
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
  }, [styleId, styleNo]);

  return (
    <div style={{ width: size, height: size, borderRadius, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? (
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>...</span>
      ) : url ? (
        <img src={getFullAuthedFileUrl(url)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

type OrderHeaderCuttingSizeItem = {
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
  cuttingSizeItems?: OrderHeaderCuttingSizeItem[]; // 新增：裁剪数量明细
  totalQuantity?: number;
  color?: string;
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  styleId?: IdLike;
  styleCover?: string | null;
  coverSize?: number;
  className?: string;
  extraFields?: OrderHeaderField[];
}> = ({
  order,
  orderLines,
  sizeItems,
  cuttingSizeItems, // 新增参数
  totalQuantity,
  color,
  orderNo,
  styleNo,
  styleName,
  styleId,
  styleCover,
  coverSize = 160,
  className,
  extraFields,
}) => {
    const resolvedOrderNo = String(orderNo ?? (order as any)?.orderNo ?? (order as any)?.productionOrderNo ?? '').trim();
    const resolvedStyleNo = String(styleNo ?? (order as any)?.styleNo ?? '').trim();
    const resolvedStyleName = String(styleName ?? (order as any)?.styleName ?? '').trim();
    const resolvedStyleId = (styleId ?? (order as any)?.styleId) as IdLike | undefined;
    const resolvedCover = (styleCover ?? (order as any)?.styleCover ?? null) as string | null;
    const resolvedColor = String(color ?? (order as any)?.color ?? '').trim();

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
      return toNumberSafe((order as any)?.orderQuantity);
    }, [totalQuantity, computedSizeItems, order]);

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
                {(() => {
                  const sizeArray = computedSizeItems.length
                    ? computedSizeItems.map((x) => String(x.size || '').trim()).filter(Boolean)
                    : ['-'];
                  const sizeQuantityMap = computedSizeItems.reduce<Record<string, number>>((acc, item) => {
                    const key = String(item.size || '').trim();
                    if (key) acc[key] = toNumberSafe(item.quantity);
                    return acc;
                  }, {});

                  // 计算裁剪数量（如果有传入裁剪数据）
                  const cuttingQuantityMap = (cuttingSizeItems || []).reduce<Record<string, number>>((acc, item) => {
                    const key = String(item.size || '').trim();
                    if (key) acc[key] = toNumberSafe(item.quantity);
                    return acc;
                  }, {});
                  const hasCuttingData = cuttingSizeItems && cuttingSizeItems.length > 0;
                  const cuttingTotalQty = hasCuttingData
                    ? cuttingSizeItems.reduce((sum, item) => sum + toNumberSafe(item.quantity), 0)
                    : 0;

                  const totalText = `总下单数：${toNumberSafe(computedTotal)}`;
                  return (
                    <ResizableTable
                      storageKey="style-assets"
                      dataSource={[
                        { key: 'size', type: '码数', ...sizeArray.reduce((acc, s) => ({ ...acc, [s]: s }), {}), total: totalText } as any,
                        { key: 'qty', type: '数量', ...sizeArray.reduce((acc, s) => ({ ...acc, [s]: sizeQuantityMap[s] || 0 }), {}), total: '' } as any,
                        ...(hasCuttingData ? [
                          { key: 'cutting', type: '裁剪数量', ...sizeArray.reduce((acc, s) => ({ ...acc, [s]: cuttingQuantityMap[s] || 0 }), {}), total: `${cuttingTotalQty}` } as any
                        ] : [])
                      ]}
                      columns={[
                        {
                          title: '',
                          dataIndex: 'type',
                          key: 'type',
                          width: 150,
                          align: 'center',
                          render: (text: string) => (
                            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--neutral-text)' }}>{text}</div>
                          )
                        },
                        ...sizeArray.map((size) => ({
                          title: size,
                          dataIndex: size,
                          key: size,
                          width: 100,
                          align: 'center' as const,
                          render: (value: string | number) => (
                            <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--neutral-text)' }}>
                              {value}
                            </div>
                          )
                        })),
                        {
                          title: '',
                          dataIndex: 'total',
                          key: 'total',
                          align: 'right',
                          render: (text: string, record: { key: string }) => record.key === 'size' ? (
                            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--neutral-text)', whiteSpace: 'nowrap' }}>{text}</div>
                          ) : null
                        }
                      ] as ColumnsType<OrderHeaderSizeItem>}
                      size="small"
                      pagination={false}
                      showHeader={false}
                      bordered
                      rowKey="key"
                    />
                  );
                })()}
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
          // 默认筛选纸样类型附件（包括开发中和已完成流转的）
          // pattern/pattern_grading: 开发中的纸样
          // pattern_final/pattern_grading_final: 样衣完成后流转到数据中心的纸样
          attachments = attachments.filter((item: any) => {
            const bizType = String((item as any)?.bizType || '').trim();
            return bizType === 'pattern' || bizType === 'pattern_grading'
              || bizType === 'pattern_final' || bizType === 'pattern_grading_final';
          });
        }
        // 在指定场景下，仅展示使用中的最新纸样，隐藏归档历史版本
        if (onlyActive) {
          attachments = attachments.filter((item: any) => String((item as any)?.status || 'active') === 'active');
        }
        setData(attachments as StyleAttachment[]);
      } else {
        setData([]);
        message.error(res.message || '获取附件失败');
      }
    } catch (e: any) {
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
              <span style={{ color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }}>{text}</span>
            </Tooltip>
          );
        }

        // 将相对路径转换为带认证的完整URL
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
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid #ffe58f',

              fontSize: "var(--font-size-sm)",
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
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ffccc7',

              fontSize: "var(--font-size-sm)",
              color: '#a8071a'
            }}>
              ⚠️ 暂无纸样附件，请先上传原始纸样和放码纸样
            </div>
          )}
          <div ref={tableWrapRef} style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ResizableTable
              rowKey={(r) => String((r as any).id)}
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
