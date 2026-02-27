import React, { useMemo } from 'react';
import { Badge, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { isOrderFrozenByStatus } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { usePredictFinishHint } from './usePredictFinishHint';
import {
  stripWarehousingNode,
  formatTime,
  getOrderShipTime,
  getQuotationUnitPriceForOrder,
  resolveNodesForListOrder,
  defaultNodes,
} from '../utils';

// 节点名称 → 节点类型映射
const NODE_TYPE_MAP: Record<string, string> = {
  '采购': 'procurement', '物料': 'procurement', '备料': 'procurement',
  '裁剪': 'cutting', '裁床': 'cutting', '剪裁': 'cutting', '开裁': 'cutting',
  '缝制': 'sewing', '车缝': 'sewing', '缝纫': 'sewing', '车工': 'sewing',
  '整烫': 'ironing', '熨烫': 'ironing', '大烫': 'ironing',
  '质检': 'quality', '检验': 'quality', '品检': 'quality', '验货': 'quality',
  '包装': 'packaging', '后整': 'packaging', '打包': 'packaging', '装箱': 'packaging',
  '二次工艺': 'secondaryProcess', '绣花': 'secondaryProcess', '印花': 'secondaryProcess',
  '入库': 'warehousing', '仓库': 'warehousing',
};

/** 格式化完成时间为 MM-DD HH:mm */
const formatCompletionTime = (timeStr: string): string => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch { return ''; }
};

/** 根据交期计算水晶球颜色 */
const getNodeColor = (expectedShipDate: any, isColor2 = false): string => {
  if (!expectedShipDate) return isColor2 ? '#6ee7b7' : '#10b981';
  const now = new Date();
  const delivery = new Date(expectedShipDate as string);
  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return isColor2 ? '#f87171' : '#dc2626';
  if (diffDays <= 3) return isColor2 ? '#fbbf24' : '#d97706';
  return isColor2 ? '#6ee7b7' : '#10b981';
};

interface UseProgressColumnsParams {
  orderSortField: string;
  orderSortOrder: 'asc' | 'desc';
  handleOrderSort: (field: string, order: 'asc' | 'desc') => void;
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardTimesByOrder: Record<string, Record<string, string>>;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  openNodeDetail: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => void;
  isSupervisorOrAbove: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  setRemarkPopoverId: (id: string | null) => void;
  setRemarkText: (text: string) => void;
  openScan: (order: ProductionOrder) => void;
}

/**
 * 生产进度表格列定义
 */
export const useProgressColumns = ({
  orderSortField,
  orderSortOrder,
  handleOrderSort,
  boardStatsByOrder,
  boardTimesByOrder,
  progressNodesByStyleNo,
  openNodeDetail,
  isSupervisorOrAbove,
  handleCloseOrder,
  setPrintingRecord,
  setQuickEditRecord,
  setQuickEditVisible,
  setRemarkPopoverId,
  setRemarkText,
  openScan,
}: UseProgressColumnsParams) => {
  const { getPredictHint, triggerPredict } = usePredictFinishHint(formatCompletionTime);

  const columns = useMemo<any[]>(() => [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: ProductionOrder) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={(record as any).styleCover || null}
          size={48}
          borderRadius={6}
        />
      ),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
      render: (v: any, record: ProductionOrder) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>
          {record.urgencyLevel === 'urgent' && (
            <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>
          )}
          {String(record.plateType || '').toUpperCase() === 'FIRST' && (
            <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首</Tag>
          )}
          {String(record.plateType || '').toUpperCase() === 'REORDER' && (
            <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻</Tag>
          )}
        </div>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 140,
      render: (v: any) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 120,
      render: (v: any, record: ProductionOrder) => {
        const name = String(v || '').trim();
        const remark = String((record as Record<string, unknown>).remarks || '').trim();
        const orderId = String(record.id || '');
        const tsMatch = remark.match(/^\[(\d{2}-\d{2} \d{2}:\d{2})\]\s*/);
        const remarkTime = tsMatch ? tsMatch[1] : '';
        const remarkBody = tsMatch ? remark.slice(tsMatch[0].length) : remark;

        return (
          <div
            style={{ position: 'relative', lineHeight: 1.3, cursor: 'pointer' }}
            onClick={() => { setRemarkPopoverId(orderId); setRemarkText(remarkBody); }}
          >
            {remarkTime && (
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                {remarkTime}
              </div>
            )}
            <Tooltip title={remark ? `备注：${remark}` : '点击添加备注'} placement="top">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 500, color: '#1f2937' }}>{name || '-'}</span>
                {remark && (
                  <Badge dot color="#ef4444" offset={[0, -2]}>
                    <ExclamationCircleOutlined style={{ fontSize: 12, color: '#ef4444' }} />
                  </Badge>
                )}
              </div>
            </Tooltip>
            {remarkBody && (
              <Tooltip title={remarkBody} placement="bottom">
                <div style={{
                  fontSize: 10, color: '#ef4444', fontWeight: 500, lineHeight: 1.2, marginTop: 2,
                  maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {remarkBody.length > 6 ? remarkBody.substring(0, 6) + '...' : remarkBody}
                </div>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '下单人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      width: 100,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: (
        <Tooltip title="款式报价单单价（BOM+工序成本合计含利润）">
          <span>单价</span>
        </Tooltip>
      ),
      key: 'quotationUnitPrice',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => {
        const v = getQuotationUnitPriceForOrder(record);
        return v > 0 ? (
          <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{v.toFixed(2)}</span>
        ) : (
          <span style={{ color: 'var(--neutral-text-secondary)' }}>未报价</span>
        );
      },
    },
    {
      title: '入库数量',
      key: 'warehousingQualifiedQuantity',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => Number((record as Record<string, unknown>).warehousingQualifiedQuantity) || 0,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '下单时间',
      key: 'createTime',
      width: 170,
      render: (_: any, record: ProductionOrder) => formatTime(record.createTime),
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: (
        <SortableColumnTitle
          title="预计出货"
          fieldName="expectedShipDate"
          onSort={handleOrderSort}
          sortField={orderSortField}
          sortOrder={orderSortOrder}
        />
      ),
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: (
        <SortableColumnTitle
          title="订单交期"
          fieldName="plannedEndDate"
          onSort={handleOrderSort}
          sortField={orderSortField}
          sortOrder={orderSortOrder}
        />
      ),
      key: 'shipTime',
      width: 170,
      render: (_: any, record: ProductionOrder) => {
        const dateStr = formatTime(getOrderShipTime(record));
        const { text, color } = getRemainingDaysDisplay(record.plannedEndDate, record.createTime);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12 }}>{dateStr}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color }}>{text}</span>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: ProductionOrder['status']) => {
        const map: any = {
          pending: { color: 'default', label: '待开始' },
          production: { color: 'success', label: '生产中' },
          completed: { color: 'default', label: '已完成' },
          delayed: { color: 'warning', label: '延期' },
        };
        const t = map[value] || { color: 'default', label: value };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '生产进度',
      key: 'progressNodes',
      width: 900,
      align: 'center' as const,
      render: (_: any, record: ProductionOrder) => {
        const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));
        const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
        const nodeTimeMap = boardTimesByOrder[String(record.id || '')];

        if (!ns || ns.length === 0) {
          return (
            <div style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-base)', padding: '20px 0' }}>
              暂无工序进度数据
            </div>
          );
        }

        return (
          <div style={{
            display: 'flex',
            gap: 0,
            alignItems: 'flex-start',
            justifyContent: 'space-evenly',
            padding: '12px 8px',
            width: '100%',
          }}>
            {ns.map((node: ProgressNode, index: number) => {
              const nodeName = node.name || '-';
              const completedQty = nodeDoneMap?.[nodeName] || 0;
              const percent = totalQty > 0
                ? Math.min(100, Math.round((completedQty / totalQty) * 100))
                : 0;
              const remaining = totalQty - completedQty;
              const completionTime = nodeTimeMap?.[nodeName] || '';
              const nodeType = NODE_TYPE_MAP[nodeName] || nodeName.toLowerCase();
              const predictHint = getPredictHint(String(record.id || ''), nodeName, percent);

              return (
                <div
                  key={node.id || index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    flex: 1,
                    cursor: 'pointer',
                    padding: 4,
                    transition: 'background 0.2s',
                  }}
                  onClick={() => openNodeDetail(
                    record,
                    nodeType,
                    nodeName,
                    { done: completedQty, total: totalQty, percent, remaining },
                    node.unitPrice,
                    ns.map(n => ({
                      id: String(n.id || '').trim() || undefined,
                      processCode: String(n.id || '').trim() || undefined,
                      name: n.name,
                      unitPrice: n.unitPrice,
                    }))
                  )}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                    void triggerPredict({
                      orderId: String(record.id || '').trim(),
                      orderNo: String(record.orderNo || '').trim() || undefined,
                      stageName: nodeName,
                      currentProgress: percent,
                    });
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
                  title={completionTime
                    ? `${nodeName} 完成时间：${completionTime}${predictHint ? `\n预计完成：${predictHint}` : ''}\n点击查看详情`
                    : `${predictHint ? `预计完成：${predictHint}\n` : ''}点击查看 ${nodeName} 详情`}
                >
                  {completionTime ? (
                    <div style={{
                      fontSize: 10,
                      color: percent >= 100 ? '#10b981' : '#6b7280',
                      fontWeight: percent >= 100 ? 600 : 400,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      marginBottom: 2,
                    }}>
                      {formatCompletionTime(completionTime)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#d1d5db', lineHeight: 1.2, marginBottom: 2 }}>--</div>
                  )}
                  <LiquidProgressLottie
                    progress={percent}
                    size={60}
                    nodeName={nodeName}
                    text={`${completedQty}/${totalQty}`}
                    color1={percent >= 100 ? '#d1d5db' : getNodeColor(record.expectedShipDate)}
                    color2={percent >= 100 ? '#e5e7eb' : getNodeColor(record.expectedShipDate, true)}
                  />
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 140,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        return (
          <RowActions
            actions={[
              {
                key: 'print',
                label: '打印',
                primary: true,
                title: frozen ? '打印（订单已关单）' : '打印',
                disabled: frozen,
                onClick: () => setPrintingRecord(record),
              },
              {
                key: 'scan',
                label: '扫码',
                disabled: frozen,
                title: frozen ? '扫码（订单已关单）' : '扫码',
                onClick: () => openScan(record),
              },
              {
                key: 'edit',
                label: '编辑',
                title: frozen ? '编辑（订单已关单）' : '编辑',
                disabled: frozen,
                onClick: () => { setQuickEditRecord(record); setQuickEditVisible(true); },
              },
              ...(isSupervisorOrAbove
                ? [{ key: 'close', label: '关单', disabled: frozen, onClick: () => handleCloseOrder(record) }]
                : []),
            ]}
          />
        );
      },
    },

  ], [
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, setQuickEditRecord, setQuickEditVisible,
    setRemarkPopoverId, setRemarkText, openScan,
    getPredictHint, triggerPredict,
  ]);

  return { columns };
};
