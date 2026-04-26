import React from 'react';
import { Button, Col, Row, Space, Tag, Tooltip } from 'antd';

import api, { parseProductionOrderLines, sortSizeNames, toNumberSafe, ProductionOrderLine } from '../../utils/api';
import { StyleAttachment } from '../../types/style';
import type { CardSizeQuantityItem } from '@/utils/cardSizeQuantity';
import ResizableModal, {
  useResizableModalTableScrollY,
} from '../common/ResizableModal';
import OrderInfoGrid from '../common/OrderInfoGrid';
import { createOrderColorSizeMatrixInfoItems } from '../common/OrderColorSizeMatrix';
import ResizableTable from '../common/ResizableTable';
import { useAuth } from '../../utils/AuthContext';
import { getFullAuthedFileUrl } from '../../utils/fileUrl';
import { message } from '@/utils/antdStatic';

/**
 * 标识类型定义
 */
type IdLike = string | number;
const EMPTY_COVER_OVERRIDE = '__EMPTY_STYLE_COVER__';
const STYLE_COVER_OVERRIDE_EVENT = 'style-cover-override-change';

const getStyleCoverOverrideKeys = (styleId?: IdLike, styleNo?: string) => ([
  styleId != null && String(styleId).trim() ? `style-cover-override:id:${String(styleId).trim()}` : null,
  styleNo != null && String(styleNo).trim() ? `style-cover-override:no:${String(styleNo).trim()}` : null,
].filter(Boolean) as string[]);

export const setStyleCoverOverride = (styleId?: IdLike, styleNo?: string, url?: string | null) => {
  if (typeof window === 'undefined') return;
  if (!styleId && !styleNo) return;
  const storedValue = url === null ? EMPTY_COVER_OVERRIDE : (url || null);
  getStyleCoverOverrideKeys(styleId, styleNo).forEach((key) => {
    if (storedValue !== null) {
      window.localStorage.setItem(key, storedValue);
    } else {
      window.localStorage.removeItem(key);
    }
  });
  window.dispatchEvent(new CustomEvent(STYLE_COVER_OVERRIDE_EVENT, {
    detail: {
      styleId: styleId != null ? String(styleId) : '',
      styleNo: styleNo != null ? String(styleNo) : '',
      url: url ?? null,
      keys: getStyleCoverOverrideKeys(styleId, styleNo),
    },
  }));
};

export const getStyleCoverOverride = (styleId?: IdLike, styleNo?: string) => {
  if (typeof window === 'undefined') return null;
  if (!styleId && !styleNo) return null;
  const keys = getStyleCoverOverrideKeys(styleId, styleNo);
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value === EMPTY_COVER_OVERRIDE) return '';
    if (value) return value;
  }
  return null;
};

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
  /** 缩略图尺寸，默认48px；传 'fill' 时填充父容器 100% */
  size?: number | 'fill';
  /** 圆角半径，默认6px */
  borderRadius?: number;
  /** 图片适配方式，默认 cover；可传 contain 避免裁切 */
  fit?: 'cover' | 'contain';
}> = ({ styleId, styleNo, src, size = 40, borderRadius = 6, fit = 'cover' }) => {
  const isFill = size === 'fill';
  // NaN 守卫：只有合法正数才使用，否则回退到默认值 40
  const numSize = (!isFill && typeof size === 'number' && !isNaN(size) && size > 0) ? size : 40;
  const preferredUrl = React.useMemo(() => {
    const override = getStyleCoverOverride(styleId, styleNo);
    if (override !== null) {
      return override || null;
    }
    return src || null;
  }, [src, styleId, styleNo]);
  const overrideKeys = React.useMemo(() => getStyleCoverOverrideKeys(styleId, styleNo), [styleId, styleNo]);
  const [url, setUrl] = React.useState<string | null>(preferredUrl);
  // 加载状态
  const [loading, setLoading] = React.useState(false);
  // src URL 是否已加载失败（用于触发 fallback 附件查询）
  const [srcFailed, setSrcFailed] = React.useState(false);
  // fallback 附件 URL 是否已失败，避免进入无限重试
  const [fallbackFailed, setFallbackFailed] = React.useState(false);

  // 当src变化时更新链接并重置失败状态
  React.useEffect(() => {
    setUrl((prev) => prev === preferredUrl ? prev : preferredUrl);
    setSrcFailed(false);
    setFallbackFailed(false);
  }, [preferredUrl]);

  React.useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (!event.key || !overrideKeys.includes(event.key)) return;
      const nextUrl = event.newValue === EMPTY_COVER_OVERRIDE ? null : (event.newValue || src || null);
      setUrl((prev) => prev === nextUrl ? prev : nextUrl);
      setSrcFailed(false);
      setFallbackFailed(false);
    };
    const customHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ keys?: string[]; url?: string | null }>).detail;
      if (!detail?.keys?.some((key) => overrideKeys.includes(key))) return;
      const nextUrl = detail.url || null;
      setUrl((prev) => prev === nextUrl ? prev : nextUrl);
      setSrcFailed(false);
      setFallbackFailed(false);
    };
    window.addEventListener('storage', handler);
    window.addEventListener(STYLE_COVER_OVERRIDE_EVENT, customHandler as any);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(STYLE_COVER_OVERRIDE_EVENT, customHandler as any);
    };
  }, [overrideKeys, src]);

  // 加载款号封面图片
  // - src 有值且未失败时：直接使用 src，不查附件 API
  // - src 为空时：查附件 API（无 cover 字段的款式）
  // - src 有值但加载失败（srcFailed=true）时：查附件 API 作为 fallback
  React.useEffect(() => {
    let mounted = true;
    if (fallbackFailed) return () => { mounted = false; };
    // src/override 有效且未加载失败时，跳过附件查询
    if (preferredUrl && !srcFailed) return () => { mounted = false; };
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
          if (mounted) {
            setUrl((prev) => prev === first ? prev : first);
          }
        }
      } catch {
        if (mounted) {
          setUrl((prev) => prev === null ? prev : null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fallbackFailed, preferredUrl, srcFailed, styleId, styleNo]);

  return (
    <div
      style={{
        width: isFill ? '100%' : numSize,
        height: isFill ? '100%' : numSize,
        borderRadius,
        overflow: 'hidden',
        background: 'var(--color-bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
      onClick={(e) => {
        e.stopPropagation();
        const validUrl = getFullAuthedFileUrl(url);
        if (validUrl) {
          window.open(validUrl, '_blank');
        }
      }}
    >
      {loading ? (
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>...</span>
      ) : url ? (
        <img
          src={getFullAuthedFileUrl(url)}
          alt="cover"
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            display: 'block',
            background: isFill ? '#f5f5f5' : undefined,
          }}
          onError={() => {
            // 判断当前是 src prop 直接给的URL，还是 fallback 附件 API 查出的URL
            if (url === preferredUrl && preferredUrl && !srcFailed) {
              setSrcFailed(true);
              setUrl(null);
            } else {
              setFallbackFailed(true);
              setUrl(null);
            }
          }}
        />
      ) : (
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center' }}>无图</span>
      )}
    </div>
  );
};

type OrderHeaderSizeItem = {
  size: string;
  quantity: number;
};

type OrderHeaderCuttingSizeItem = {
  color?: string;
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
  coverNode?: React.ReactNode;
  className?: string;
  extraFields?: OrderHeaderField[];
  showOrderNo?: boolean;
  showColor?: boolean;
  hideEmptyColor?: boolean;
  hideSizeBlockWhenNoRealSize?: boolean;
  matrixColumnMinWidth?: number;
  matrixGap?: number;
  matrixFontSize?: number;
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
  coverNode,
  className,
  extraFields,
  showOrderNo = true,
  showColor = true,
  hideEmptyColor = false,
  hideSizeBlockWhenNoRealSize = false,
  matrixColumnMinWidth = 0,
  matrixGap = 4,
  matrixFontSize = 12,
}) => {
    const resolvedOrderNo = String(orderNo ?? (order as any)?.orderNo ?? (order as any)?.productionOrderNo ?? '').trim();
    const resolvedStyleNo = String(styleNo ?? (order as any)?.styleNo ?? '').trim();
    const resolvedStyleName = String(styleName ?? (order as any)?.styleName ?? '').trim();
    const resolvedStyleId = (styleId ?? (order as any)?.styleId) as IdLike | undefined;
    const resolvedCover = (styleCover ?? (order as any)?.styleCover ?? null) as string | null;
    const normalizedOrderLines = React.useMemo(
      () => (orderLines ?? parseProductionOrderLines(order)).filter((line) => {
        const size = String(line?.size || '').trim();
        return !!size;
      }),
      [orderLines, order],
    );

    const resolvedColor = React.useMemo(() => {
      const lineColors = Array.from(new Set(
        normalizedOrderLines
          .map((line) => String(line?.color || '').trim())
          .filter(Boolean),
      ));
      if (lineColors.length > 1) {
        return `${lineColors.length}色：${lineColors.join(' / ')}`;
      }
      if (lineColors.length === 1) return lineColors[0];
      return String(color ?? (order as any)?.color ?? '').trim();
    }, [color, normalizedOrderLines, order]);

    const computedSizeItems = React.useMemo(() => {
      if (sizeItems) return sizeItems;
      const map = new Map<string, number>();
      normalizedOrderLines.forEach((l) => {
        const s = String(l.size || '').trim();
        if (!s) return;
        map.set(s, (map.get(s) || 0) + toNumberSafe(l.quantity));
      });
      const sizes = sortSizeNames(Array.from(map.keys()));
      return sizes.map((s) => ({ size: s, quantity: map.get(s) || 0 }));
    }, [sizeItems, normalizedOrderLines]);

    const computedTotal = React.useMemo(() => {
      if (typeof totalQuantity === 'number') return totalQuantity;
      if (computedSizeItems.length) {
        return computedSizeItems.reduce((sum, item) => sum + toNumberSafe(item.quantity), 0);
      }
      return toNumberSafe((order as any)?.orderQuantity);
    }, [totalQuantity, computedSizeItems, order]);

    const matrixItems = React.useMemo<CardSizeQuantityItem[]>(() => {
      if (normalizedOrderLines.length) {
        return normalizedOrderLines.map((line) => ({
          color: String(line?.color || '').trim(),
          size: String(line?.size || '').trim(),
          quantity: toNumberSafe(line?.quantity),
        }));
      }
      return computedSizeItems.map((item) => ({
        color: resolvedColor,
        size: String(item?.size || '').trim(),
        quantity: toNumberSafe(item?.quantity),
      }));
    }, [computedSizeItems, normalizedOrderLines, resolvedColor]);

    const cuttingMatrixItems = React.useMemo<CardSizeQuantityItem[]>(
      () => (cuttingSizeItems || []).map((item) => ({
        color: String(item?.color || '').trim() || '裁剪',
        size: String(item?.size || '').trim(),
        quantity: toNumberSafe(item?.quantity),
      })),
      [cuttingSizeItems],
    );

    const fields: OrderHeaderField[] = [
      ...(showOrderNo ? [{ label: '订单号', value: <span className="order-no-compact">{resolvedOrderNo || '-'}</span> }] : []),
      { label: '款号', value: resolvedStyleNo || '-' },
      { label: '款名', value: resolvedStyleName || '-' },
      ...(showColor && (!hideEmptyColor || !!resolvedColor) ? [{ label: '颜色', value: resolvedColor || '-' }] : []),
      { label: '下单数量', value: computedTotal > 0 ? `${computedTotal}` : '-' },
      ...(extraFields || []),
    ];
    const infoLabelStyle: React.CSSProperties = { fontSize: 'var(--font-size-sm)' };
    const infoValueStyle: React.CSSProperties = {
      fontSize: 'var(--font-size-md, 15px)',
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    };

    const hasRealSizeItems = computedSizeItems.some((item) => {
      const sizeText = String(item?.size || '').trim();
      return !!sizeText && sizeText !== '-';
    });

    return (
      <Row gutter={16} className={`purchase-detail-top${className ? ` ${className}` : ''}`}>
        <Col xs={24} md={8} lg={6}>
          <div className="purchase-detail-right">
            {coverNode || (
              <StyleCoverThumb
                styleId={resolvedStyleId}
                styleNo={resolvedStyleNo}
                src={resolvedCover}
                size={coverSize}
                borderRadius={8}
              />
            )}
          </div>
        </Col>
        <Col xs={24} md={16} lg={18}>
          <div className="purchase-detail-left">
            <OrderInfoGrid
              fontSize={14}
              rowGap={8}
              gap={12}
              items={[
                ...fields.map((field) => ({
                  label: field.label,
                  value: field.value,
                  labelStyle: infoLabelStyle,
                  valueStyle: infoValueStyle,
                })),
                ...((!hideSizeBlockWhenNoRealSize || hasRealSizeItems)
                  ? createOrderColorSizeMatrixInfoItems({
                      items: matrixItems,
                      fallbackColor: resolvedColor,
                      fallbackSize: computedSizeItems.map((item) => String(item?.size || '').trim()).filter(Boolean).join('/'),
                      fallbackQuantity: computedTotal,
                      totalLabel: '总下单数',
                      columnMinWidth: matrixColumnMinWidth,
                      gap: matrixGap,
                      fontSize: matrixFontSize,
                      labelStyle: infoLabelStyle,
                      valueStyle: infoValueStyle,
                    })
                  : []),
                ...(cuttingMatrixItems.length
                  ? createOrderColorSizeMatrixInfoItems({
                      items: cuttingMatrixItems,
                      totalLabel: '裁剪总数',
                      columnMinWidth: matrixColumnMinWidth,
                      gap: matrixGap,
                      fontSize: matrixFontSize,
                      labelStyle: infoLabelStyle,
                      valueStyle: infoValueStyle,
                    })
                  : []),
              ]}
            />
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
  /** 仅显示使用中的最新纸样（隐藏归档历史版本） */
  onlyActive?: boolean;
  /** 模态框关闭时的回调 */
  onModalClose?: () => void;
}> = ({ styleId, styleNo, buttonText = '纸样', modalTitle = '纸样附件', bizTypes, onlyActive, onModalClose }) => {
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
    } catch (e: unknown) {
      setData([]);
      message.error(e instanceof Error ? e.message : '获取附件失败');
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
              minColumnWidth={70}
            />
          </div>
        </div>
      </ResizableModal>
    </>
  );
};
