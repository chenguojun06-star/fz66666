import React from 'react';
import { Tag, Popover, Space, Tooltip, Badge } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { NavigateFunction } from 'react-router-dom';
import type { ProductionOrder } from '@/types/production';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import { getProcessesByNodeFromOrder } from '../../ProgressDetail/utils';
import SmartOrderHoverCard from '../../ProgressDetail/components/SmartOrderHoverCard';
import { StyleCoverThumb, StyleAttachmentsButton } from '@/components/StyleAssets';
import { isDirectCuttingOrder, isOrderFrozenByStatus, isOrderFrozenByStatusOrStock, withQuery } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { toCategoryCn } from '@/utils/styleCategory';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { getStatusConfig, safeString } from '../utils';
import dayjs from 'dayjs';

export interface UseProductionColumnsProps {
  sortField: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (field: string, order: 'asc' | 'desc') => void;
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  handleTransferOrder: (record: ProductionOrder) => void;
  navigate: NavigateFunction;
  openProcessDetail: (record: ProductionOrder, type: string) => void;
  openNodeDetail?: (record: ProductionOrder, nodeType: string, nodeName: string, stats?: { done: number; total: number; percent: number; remaining: number }, unitPrice?: number, processList?: { name: string; unitPrice?: number; processCode?: string }[]) => void;
  syncProcessFromTemplate: (record: ProductionOrder) => void;
  setPrintModalVisible: (v: boolean) => void;
  setPrintingRecord: (r: ProductionOrder | null) => void;
  setRemarkPopoverId?: (id: string | null) => void;
  setRemarkText?: (text: string) => void;
  quickEditModal: { open: (r: ProductionOrder) => void };
  isSupervisorOrAbove: boolean;
  renderCompletionTimeTag: (record: ProductionOrder, stage: string, rate: number, position?: string) => React.ReactNode;
  deliveryRiskMap?: Map<string, DeliveryRiskItem>;
  stagnantOrderIds?: Map<string, number>;
  handleShareOrder: (record: ProductionOrder) => void;
  handlePrintLabel?: (record: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  openSubProcessRemap?: (record: ProductionOrder) => void;
  isFactoryAccount?: boolean;
  onOpenRemark?: (record: ProductionOrder, defaultRole?: string) => void;
}

/**
 * 生产订单列表列定义 Hook
 * 从 Production/List/index.tsx 提取，减少主文件体积 ~600 行
 */
export function useProductionColumns({
  sortField, sortOrder, handleSort,
  handleCloseOrder, handleScrapOrder, handleTransferOrder,
  navigate, openProcessDetail, openNodeDetail, syncProcessFromTemplate,
  setPrintModalVisible, setPrintingRecord,
  quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag, deliveryRiskMap,
  stagnantOrderIds,
  handleShareOrder,
  handlePrintLabel,
  canManageOrderLifecycle = false,
  openSubProcessRemap,
  isFactoryAccount = false,
  onOpenRemark,
}: UseProductionColumnsProps) {
  const renderStageTime = (value: unknown) => value ? formatDateTime(value) : '-';

  // ===== 工序进度列共享逻辑 =====
  const PROGRESS_CELL_BASE: React.CSSProperties = { padding: '4px', transition: 'background 0.2s' };
  const COUNT_TEXT_STYLE: React.CSSProperties = { fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' };

  /** 判断订单是否有二次工艺（列渲染 + action菜单共用） */
  const hasSecondaryProcessForOrder = (record: ProductionOrder): boolean => {
    if ((record as any).hasSecondaryProcess) return true;
    if ((record as any).secondaryProcessStartTime || (record as any).secondaryProcessEndTime) return true;
    const nodes = record.progressNodeUnitPrices;
    if (!Array.isArray(nodes) || nodes.length === 0) return false;
    return nodes.some((n: any) => {
      const name = String(n.name || n.processName || '').trim();
      return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
    });
  };

  /** 提取指定父节点下的子工序列表 */
  const getNodeProcessList = (record: ProductionOrder, nodeName: string): { name: string; unitPrice?: number; processCode?: string }[] => {
    const byParent = getProcessesByNodeFromOrder(record);
    if (nodeName === '二次工艺') {
      const exactChildren = byParent['二次工艺'] || [];
      const STD_STAGES = new Set(['采购', '裁剪', '车缝', '尾部', '入库', '二次工艺']);
      const orphanChildren = Object.entries(byParent)
        .filter(([stage]) => !STD_STAGES.has(stage))
        .flatMap(([, nodes]) => nodes || []);
      return [...exactChildren, ...orphanChildren].map(c => ({ name: c.name, unitPrice: c.unitPrice, processCode: c.processCode }));
    }
    const children = byParent[nodeName];
    return children?.length ? children.map(c => ({ name: c.name, unitPrice: c.unitPrice, processCode: c.processCode })) : [];
  };

  /** 通用工序进度列渲染器（裁剪/二次工艺/车缝/尾部共用） */
  const renderStageProgressCell = (rate: number, record: ProductionOrder, nodeType: string, nodeName: string) => {
    const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
    const completed = Math.round((rate || 0) * total / 100);
    const percent = rate || 0;
    const frozen = isOrderFrozenByStatus(record);
    // 进度条颜色基于实际完成率而非交期，避免一行5个红进度条导致视觉疲劳
    const colorStatus = frozen ? 'default' : 'normal';

    return (
      <div
        style={{ ...PROGRESS_CELL_BASE, cursor: frozen ? 'default' : 'pointer', opacity: frozen ? 0.6 : 1 }}
        onClick={(e) => {
          e.stopPropagation();
          if (frozen) return;
          if (openNodeDetail) {
            const processList = getNodeProcessList(record, nodeName);
            openNodeDetail(record, nodeType, nodeName, { done: completed, total, percent, remaining: Math.max(0, total - completed) }, undefined, processList);
          } else {
            openProcessDetail(record, nodeType);
          }
        }}
        onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
      >
        {renderCompletionTimeTag(record, nodeName, percent)}
        <div style={COUNT_TEXT_STYLE}>{completed}/{total}</div>
        <LiquidProgressBar percent={percent} width="100%" height={16} status={colorStatus} />
      </div>
    );
  };

  // ===== 表格列定义 =====
  const allColumns = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      render: (v: any, record: ProductionOrder) => {
        const orderNo = safeString(v, '');
        const styleNo = safeString((record as any)?.styleNo, '');
        const orderId = safeString((record as any)?.id, '');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Popover
              content={<SmartOrderHoverCard order={record} />}
              trigger="hover"
              placement="rightTop"
              mouseEnterDelay={0.3}
              overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
            >
            <a
              className="order-no-wrap"
              style={{ cursor: 'pointer', color: 'var(--primary-color, #1677ff)' }}
              onClick={(e) => {
                e.preventDefault();
                navigate(withQuery('/production/order-flow', { orderId, orderNo, styleNo }));
              }}
            >
              {orderNo || '-'}
            </a>
            </Popover>
            {(record as any).urgencyLevel === 'urgent' && (
              <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>
            )}
            {String((record as any).plateType || '').toUpperCase() === 'FIRST' && (
              <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首</Tag>
            )}
            {String((record as any).plateType || '').toUpperCase() === 'REORDER' && (
              <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻</Tag>
            )}
            {(record as any).orderBizType && (() => {
              const bizType = String((record as any).orderBizType);
              const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
              return <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>{bizType}</Tag>;
            })()}
          </div>
        );
      },
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: 'SKC',
      dataIndex: 'skc',
      key: 'skc',
      width: 140,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '品类',
      dataIndex: 'productCategory',
      key: 'productCategory',
      width: 100,
      render: (v: any) => toCategoryCn(v),
    },
    {
      title: '公司',
      dataIndex: 'company',
      key: 'company',
      width: 120,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={record.styleId}
          styleNo={record.styleNo}
          onlyActive
        />
      )
    },
    {
      title: '生产方',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 130,
      render: (v: any, record: any) => {
        const bizType = record.orderBizType as string | undefined;
        const factoryType = record.factoryType as string | undefined;
        const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
        return (
          <Space size={4} style={{ flexWrap: 'nowrap' }}>
            {factoryType === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
            {factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
            <SupplierNameTooltip
              name={v}
              contactPerson={record.factoryContactPerson}
              contactPhone={record.factoryContactPhone}
              label="工厂"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onOpenRemark?.(record, '生产方 — ' + (v || '')); }}
            />
            {bizType && (
              <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>{bizType}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 120,
      render: (v: any, record: ProductionOrder) => {
        const name = String(v || '').trim();
        const remark = String((record as unknown as Record<string, unknown>).remarks || '').trim();
        const tsMatch = remark.match(/^\[(\d{2}-\d{2} \d{2}:\d{2})\]\s*/);
        const remarkTime = tsMatch ? tsMatch[1] : '';
        const remarkBody = tsMatch ? remark.slice(tsMatch[0].length) : remark;

        return (
          <div
            style={{ position: 'relative', lineHeight: 1.3, cursor: 'pointer' }}
            onClick={() => onOpenRemark?.(record, '跟单员 — ' + name)}
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
                  <Badge dot color="var(--color-text-tertiary)" offset={[0, -2]}>
                    <ExclamationCircleOutlined style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }} />
                  </Badge>
                )}
              </div>
            </Tooltip>
            {remarkBody && (
              <Tooltip title={remarkBody} placement="bottom">
                <div style={{
                  fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 500, lineHeight: 1.2, marginTop: 2,
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
      title: '纸样师',
      dataIndex: 'patternMaker',
      key: 'patternMaker',
      width: 100,
      render: (v: any, record: ProductionOrder) => (
        <span
          style={{ cursor: v ? 'pointer' : 'default' }}
          onClick={() => v && onOpenRemark?.(record, '纸样师 — ' + v)}
        >{v || '-'}</span>
      ),
    },
    {
      title: '订单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '单价',
      key: 'factoryUnitPrice',
      width: 90,
      align: 'right' as const,
      render: (_: any, record: any) => {
        const v = Number(record?.factoryUnitPrice);
        return (Number.isFinite(v) && v > 0)
          ? <span style={{ fontWeight: 500 }}>¥{v.toFixed(2)}</span>
          : <span style={{ color: '#bfbfbf' }}>-</span>;
      },
    },
    {
      title: '下单人',
      dataIndex: 'orderOperatorName',
      key: 'orderOperatorName',
      width: 120,
      render: (v: any, record: ProductionOrder) => {
        const text = safeString(v);
        return (
          <span
            style={{ cursor: text ? 'pointer' : 'default' }}
            onClick={() => text && onOpenRemark?.(record, '下单人 — ' + text)}
          >{text || '-'}</span>
        );
      },
    },
    {
      title: <SortableColumnTitle
        title="下单时间"
        sortField={sortField}
        fieldName="createTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"
      />,
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: renderStageTime,
    },

    {
      title: <SortableColumnTitle title="预计出货" sortField={sortField} fieldName="expectedShipDate" sortOrder={sortOrder} onSort={handleSort} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '采购',
      dataIndex: 'procurementCompletionRate',
      key: 'procurementSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const directCutting = isDirectCuttingOrder(record as any);
        const frozen = isOrderFrozenByStatus(record);
        // 采购进度条颜色统一用中性色，交期信息由交期列专门展示
        const colorStatus = frozen ? 'default' : 'normal';

        if (directCutting) {
          return (
            <div
              style={{ cursor: 'default', padding: '4px', opacity: 0.8 }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
                无采购
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
                -/-
              </div>
              <LiquidProgressBar percent={0} width="100%" height={16} status="default" />
            </div>
          );
        }

        //  采购节点：有到货即显示 （不显示件数比），进度锁 100% 避免波浪死循环
        const procurePercent = (rate || 0) > 0 ? 100 : 0;
        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'procurement'); }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-container)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
          >
            {renderCompletionTimeTag(record, '采购', rate || 0)}
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {(rate || 0) > 0 ? '' : ''}
            </div>
            <LiquidProgressBar percent={procurePercent} width="100%" height={16} status={colorStatus} />
          </div>
        );
      },
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingCompletionRate',
      key: 'cuttingSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'cutting', '裁剪'),
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessRate',
      key: 'secondaryProcessSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        if (!hasSecondaryProcessForOrder(record)) {
          return (
            <div style={{ padding: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', opacity: 0.7 }}>无二次工艺</span>
            </div>
          );
        }
        return renderStageProgressCell(rate, record, 'secondaryProcess', '二次工艺');
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'carSewing', '车缝'),
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'tailProcess', '尾部'),
    },
    {
      title: '裁剪数量',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '扎数',
      dataIndex: 'cuttingBundleCount',
      key: 'cuttingBundleCount',
      width: 80,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '完成数量',
      dataIndex: 'completedQuantity',
      key: 'completedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '入库',
      dataIndex: 'warehousingQualifiedQuantity',
      key: 'warehousingQualifiedQuantity',
      width: 140,
      align: 'left' as const,
      render: (_: unknown, record: ProductionOrder) => {
        const qualified = Number(record.warehousingQualifiedQuantity ?? 0) || 0;
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 1;
        const rate = Math.min(100, Math.round((qualified / total) * 100));
        const frozen = isOrderFrozenByStatus(record);

        const getColor = () => {
          if (frozen) return 'var(--color-border)';
          if (rate === 100) return 'var(--color-success)';
          if (rate > 0) return 'var(--color-primary)';
          return 'var(--color-border)';
        };

        return (
          <div
            style={{ display: 'flex', flexDirection: 'column', cursor: frozen ? 'default' : 'pointer', padding: '4px 0', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'warehousing'); }}
          >
            {renderCompletionTimeTag(record, '入库', rate || 0, 'left')}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--neutral-text)' }}>{qualified}/{total}</span>
              <div style={{ position: 'relative', width: '42px', height: '42px' }}>
                <svg width="42" height="42" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="21" cy="21" r="19" fill="none" stroke="var(--color-bg-subtle)" strokeWidth="3" />
                  <circle cx="21" cy="21" r="19" fill="none" stroke={getColor()} strokeWidth="3"
                    strokeDasharray={`${(rate / 100) * 119.38} 119.38`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.3s ease' }} />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px', fontWeight: 700, color: getColor() }}>
                  {rate}%
                </div>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: '次品数',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '返修数',
      dataIndex: 'repairQuantity',
      key: 'repairQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '库存',
      dataIndex: 'inStockQuantity',
      key: 'inStockQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ProductionOrder['status'], record: ProductionOrder) => {
        const { text, color } = getStatusConfig(status);
        const stagnantDays = stagnantOrderIds?.get(String(record.id));
        const progress = record.productionProgress ?? 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag color={color} style={{ margin: 0 }}>{text}</Tag>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{progress}%</span>
            </div>
            {stagnantDays !== undefined && (
              <div className="stagnant-pulse-badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="stagnant-pulse-dot" />
                <span>停滞 {stagnantDays} 天</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: <SortableColumnTitle title="订单交期" fieldName="plannedEndDate" onSort={handleSort} sortField={sortField} sortOrder={sortOrder} />,
      dataIndex: 'plannedEndDate',
      key: 'plannedEndDate',
      width: 155,
      render: (value: unknown, record: ProductionOrder) => {
        const dateStr = value ? formatDateTime(value as string) : '-';
        const { text, color } = getRemainingDaysDisplay(value as string, record.createTime, record.actualEndDate, record.status);
        const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12 }}>{dateStr}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color }}>{text}</span>
            {aiRisk && aiRisk.riskLevel !== 'safe' && aiRisk.predictedEndDate && (
              <span style={{
                fontSize: 10, fontWeight: 500,
                color: 'var(--color-text-secondary)',
              }}>
                AI {dayjs(aiRisk.predictedEndDate).format('M/D')}
                {aiRisk.riskLevel === 'overdue' ? ' ⚠' : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      onCell: () => ({ className: 'prod-act-cell' }),
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatusOrStock(record);
        const completed = isOrderFrozenByStatus(record);
        const directCutting = isDirectCuttingOrder(record as any);

        return (
          <RowActions
            className="table-actions"
            maxInline={1}
            actions={[
              {
                key: 'print',
                label: '打印',
                title: frozen ? '打印（订单已关单）' : '打印生产制单',
                disabled: frozen,
                onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); },
              },
              ...(handlePrintLabel ? [{
                key: 'printLabel',
                label: '打印标签',
                title: '打印洗水唛 / 吊牌',
                onClick: () => handlePrintLabel(record),
              }] : []),
              ...(!isFactoryAccount ? [{  // RowAction[]
                key: 'process',
                label: '工序',
                title: frozen ? '工序（订单已关单）' : '查看工序详情',
                disabled: frozen,
                children: [
                  { key: 'all', label: ' 全部工序', onClick: () => openProcessDetail(record, 'all') },
                  { type: 'divider' },
                  ...(!directCutting ? [{ key: 'procurement', label: '采购', onClick: () => openProcessDetail(record, 'procurement') }] : []),
                  { key: 'cutting', label: '裁剪', onClick: () => openProcessDetail(record, 'cutting') },
                  { key: 'carSewing', label: '车缝', onClick: () => openProcessDetail(record, 'carSewing') },
                  ...(hasSecondaryProcessForOrder(record) ? [{ key: 'secondaryProcess', label: '二次工艺', onClick: () => openProcessDetail(record, 'secondaryProcess') }] : []),
                  { key: 'tailProcess', label: '尾部', onClick: () => openProcessDetail(record, 'tailProcess') },
                  { type: 'divider' },
                  { key: 'syncProcess', label: ' 从模板同步', onClick: () => syncProcessFromTemplate(record) },
                ],
              }] as RowAction[] : []),
              ...(isFactoryAccount && openSubProcessRemap ? [{
                key: 'subProcessRemap',
                label: '子工序',
                title: frozen ? '子工序单价配置（订单已关单）' : '子工序单价配置',
                disabled: frozen,
                onClick: () => openSubProcessRemap(record),
              }] : []),
              {
                key: 'quickEdit',
                label: '编辑',
                title: frozen ? '编辑（订单已关单）' : '快速编辑备注和预计出货',
                disabled: frozen,
                onClick: () => { quickEditModal.open(record); },
              },
              ...(canManageOrderLifecycle ? [
                {
                  key: 'close',
                  label: <span style={{ color: frozen ? undefined : 'var(--primary-color)' }}>{frozen ? '关单(已完成)' : '关单'}</span>,
                  disabled: frozen,
                  onClick: () => handleCloseOrder(record),
                },
                ...(isSupervisorOrAbove ? [{
                  key: 'scrap',
                  label: completed ? '报废(已完成)' : '报废',
                  danger: true,
                  disabled: completed,
                  onClick: () => handleScrapOrder(record),
                }] : []),
                {
                  key: 'transfer',
                  label: '转单',
                  title: frozen ? '转单（订单已关单）' : '转给其他人员处理',
                  disabled: frozen,
                  onClick: () => handleTransferOrder(record),
                }
              ] : []),
              {
                key: 'share',
                label: ' 分享',
                title: '生成客户查看链接（30天有效）',
                onClick: () => handleShareOrder(record),
              },
              {
                key: 'remark',
                label: '备注记录',
                onClick: () => onOpenRemark?.(record),
              },
            ]}
          />
        );
      },
    },
  ];

  return allColumns;
}
