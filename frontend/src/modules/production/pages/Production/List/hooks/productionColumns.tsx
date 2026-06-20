import React from 'react';
import { Tag, Popover, Space } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import type { ProductionOrder } from '@/types/production';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import SmartOrderHoverCard from '../../ProgressDetail/components/SmartOrderHoverCard';
import { StyleCoverThumb, StyleAttachmentsButton } from '@/components/StyleAssets';
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
import { isDirectCuttingOrder, isOrderFrozenByStatus, isOrderFrozenByStatusOrStock, withQuery } from '@/utils/api';
import { formatMoney } from '@/utils/format';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import { toCategoryCn } from '@/utils/styleCategory';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { safeString } from '../utils';
import { displayOrderStatus, displayDate, displayAmount } from '@/utils/display';
import DisplayStatusTag from '@/components/common/DisplayStatusTag';
import { buildCommonOrderActions } from '../../components/buildCommonOrderActions';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import dayjs from 'dayjs';
import {
  hasSecondaryProcessForOrder,
  renderStageProgressCell,
  renderMerchandiserCell,
} from './riskBadgeRenderers';
import type { StageProgressContext } from './riskBadgeRenderers';

export interface UseProductionColumnsProps {
  sortField: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (field: string, order: 'asc' | 'desc') => void;
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  handleCopyOrder?: (record: ProductionOrder) => void;
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
  openWorkflowEditor?: (styleNo?: string) => void;
  getStageCompletionTime?: (record: ProductionOrder, stageKeyword: string, rate?: number) => string;
  onOpenInspectDrawer?: (orderId: string) => void;
  onOpenSmartReceive?: (orderNo: string) => void;
}

export function useProductionColumns({
  sortField, sortOrder, handleSort,
  handleCloseOrder, handleScrapOrder, handleCopyOrder,
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
  openWorkflowEditor,
  getStageCompletionTime,
  onOpenInspectDrawer,
  onOpenSmartReceive,
}: UseProductionColumnsProps) {
  const renderStageTime = (value: unknown) => displayDate(value, 'datetime');

  const stageProgressCtx: StageProgressContext = {
    openNodeDetail,
    openProcessDetail,
    renderCompletionTimeTag,
    getStageCompletionTime,
    onOpenInspectDrawer,
  };

  const allColumns = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 60,
      render: (_: any, record: any) => (
        <StyleCoverThumb 
          styleId={record.styleId} 
          styleNo={record.styleNo} 
          src={record.styleCover || null} 
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={48} 
          borderRadius={6} 
        />
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 100,
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
              style={{ cursor: 'pointer', color: 'var(--primary-color, var(--color-primary))' }}
              onClick={(e) => {
                e.preventDefault();
                navigate(withQuery('/production/order-flow', { orderId, orderNo, styleNo }));
              }}
            >
              {orderNo || '-'}
            </a>
            </Popover>
            {(record as any).urgencyLevel === 'urgent' && (
              <Tag color="red" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>急</Tag>
            )}
            {String((record as any).plateType || '').toUpperCase() === 'FIRST' && (
              <Tag color="blue" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>首</Tag>
            )}
            {String((record as any).plateType || '').toUpperCase() === 'REORDER' && (
              <Tag color="gold" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>翻</Tag>
            )}
            {(record as any).orderBizType && (() => {
              const bizType = String((record as any).orderBizType);
              const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
              return <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{bizType}</Tag>;
            })()}
          </div>
        );
      },
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 80,
    },
    {
      title: 'SKC',
      dataIndex: 'skc',
      key: 'skc',
      width: 70,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '品类',
      dataIndex: 'productCategory',
      key: 'productCategory',
      width: 80,
      render: (v: any) => toCategoryCn(v),
    },
    {
      title: '客户',
      dataIndex: 'company',
      key: 'companyName',
      width: 80,
      ellipsis: true,
      render: (_: any, record: any) => record.customerName || record.company || '-',
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 50,
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
      width: 90,
      render: (v: any, record: any) => {
        const bizType = record.orderBizType as string | undefined;
        const factoryType = record.factoryType as string | undefined;
        const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
        return (
          <Space size={4} style={{ flexWrap: 'nowrap' }}>
            <FactoryTypeTag factoryType={factoryType} />
            <SupplierNameTooltip
              name={v}
              contactPerson={record.factoryContactPerson}
              contactPhone={record.factoryContactPhone}
              label="工厂"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onOpenRemark?.(record, '生产方 — ' + (v || '')); }}
            />
            {bizType && (
              <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{bizType}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 70,
      render: (v: any, record: ProductionOrder) => renderMerchandiserCell(v, record, onOpenRemark),
    },
    {
      title: '纸样师',
      dataIndex: 'patternMaker',
      key: 'patternMaker',
      width: 60,
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
      width: 80,
      align: 'right' as const,
    },
    {
      title: '单价',
      key: 'factoryUnitPrice',
      width: 70,
      align: 'right' as const,
      render: (_: any, record: any) => {
        const v = Number(record?.factoryUnitPrice);
        return (Number.isFinite(v) && v > 0)
          ? <span style={{ fontWeight: 500 }}>{displayAmount(v)}</span>
          : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
      },
    },
    {
      title: '下单人',
      dataIndex: 'orderOperatorName',
      key: 'orderOperatorName',
      width: 60,
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
      width: 150,
      render: renderStageTime,
    },
    {
      title: <SortableColumnTitle title="预计出货" sortField={sortField} fieldName="expectedShipDate" sortOrder={sortOrder} onSort={handleSort} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 100,
      render: (v: any) => displayDate(v, 'datetime'),
    },
    {
      title: '采购',
      dataIndex: 'procurementCompletionRate',
      key: 'procurementSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const directCutting = isDirectCuttingOrder(record as any);
        const frozen = isOrderFrozenByStatus(record);
        const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';
        const colorStatus = isCompletedOrClosed ? 'normal' : (frozen ? 'default' : 'normal');

        if (directCutting) {
          return (
            <div
              style={{ cursor: 'default', padding: '4px', opacity: 0.8 }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
                无采购
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
                -/-
              </div>
              <LiquidProgressBar percent={0} width="100%" height={16} status="default" />
            </div>
          );
        }

        const procurePercent = (rate || 0) > 0 ? 100 : 0;
        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: isCompletedOrClosed ? 0.75 : (frozen ? 0.6 : 1) }}
            onClick={(e) => {
              e.stopPropagation();
              if (frozen) return;
              if (openNodeDetail) {
                const procureCompleted = (rate || 0) > 0 ? 1 : 0;
                openNodeDetail(record, 'procurement', '采购', { done: procureCompleted, total: 1, percent: procurePercent, remaining: procureCompleted > 0 ? 0 : 1 });
              } else {
                openProcessDetail(record, 'procurement');
              }
            }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-container)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
          >
            {renderCompletionTimeTag(record, '采购', rate || 0)}
            <LiquidProgressBar percent={procurePercent} width="100%" height={16} status={colorStatus} />
            <BudgetDaysEditor
              record={record}
              nodeName="采购"
              stageEndTime={getStageCompletionTime?.(record, '采购', rate || 0) || undefined}
              isCompletedOrClosed={isCompletedOrClosed}
              isProcureNode
            />
          </div>
        );
      },
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingCompletionRate',
      key: 'cuttingSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'cutting', '裁剪', stageProgressCtx),
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessRate',
      key: 'secondaryProcessSummary',
      width: 70,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        if (!hasSecondaryProcessForOrder(record)) {
          return (
            <div style={{ padding: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', opacity: 0.7 }}>无二次工艺</span>
            </div>
          );
        }
        return renderStageProgressCell(rate, record, 'secondaryProcess', '二次工艺', stageProgressCtx);
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'carSewing', '车缝', stageProgressCtx),
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'tailProcess', '尾部', stageProgressCtx),
    },
    {
      title: '裁剪数量',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '扎数',
      dataIndex: 'cuttingBundleCount',
      key: 'cuttingBundleCount',
      width: 60,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '完成数量',
      dataIndex: 'completedQuantity',
      key: 'completedQuantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '入库',
      dataIndex: 'warehousingQualifiedQuantity',
      key: 'warehousingQualifiedQuantity',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, record: ProductionOrder) => {
        const qualified = Number(record.warehousingQualifiedQuantity ?? 0) || 0;
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 1;
        const rate = Math.min(100, Math.round((qualified / total) * 100));
        return renderStageProgressCell(rate, record, 'warehousing', '入库', stageProgressCtx);
      },
    },
    {
      title: '次品数',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '返修数',
      dataIndex: 'repairQuantity',
      key: 'repairQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '库存',
      dataIndex: 'inStockQuantity',
      key: 'inStockQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '状态/交期',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: ProductionOrder['status'], record: ProductionOrder) => {
        const { text, color } = displayOrderStatus(status);
        const stagnantDays = stagnantOrderIds?.get(String(record.id));
        const progress = calcOrderProgress(record);
        const deliveryDate = displayDate(record.plannedEndDate, 'month-day');
        const remain = getRemainingDaysDisplay(record.plannedEndDate as string, record.createTime, record.actualEndDate, record.status);
        const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
        const slaMap: Record<string, { color: string; label: string }> = {
          on_track: { color: 'var(--color-success)', label: '正常' },
          at_risk: { color: 'var(--color-warning)', label: '预警' },
          breached: { color: 'var(--color-danger)', label: '超期' },
          completed: { color: 'var(--color-info)', label: '达标' },
        };
        const sla = slaMap[record.deliverySlaStatus || ''] || null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Tag color={color} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' }}>{text}</Tag>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{progress}%</span>
              {deliveryDate !== '-' && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{deliveryDate}</span>}
              {remain.text && remain.text !== '-' && (
                <span style={{ fontSize: 12, fontWeight: 600, color: remain.color }}>{remain.text}</span>
              )}
              {record.isQuickResponse && <Tag color="volcano" style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' }}>快反</Tag>}
            </div>
            {stagnantDays !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--color-danger)', animation: 'pulse-dot 1.5s infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 500 }}>停滞{stagnantDays}天</span>
              </div>
            )}
            {sla && (
              <span style={{ fontSize: 12, fontWeight: 500, color: sla.color }}>
                SLA:{sla.label}{record.actualDeliveryDays != null ? ` ${record.actualDeliveryDays}天` : ''}
              </span>
            )}
            {aiRisk && aiRisk.riskLevel !== 'safe' && aiRisk.predictedEndDate && (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                AI预测 {displayDate(aiRisk.predictedEndDate, 'month-day')}{aiRisk.riskLevel === 'overdue' ? ' ⚠' : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
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
                  ...(directCutting && openWorkflowEditor ? [{ key: 'editWorkflow', label: '编辑工序', onClick: () => openWorkflowEditor(record.styleNo) }] : []),
                ],
              }] as RowAction[] : []),
              ...(isFactoryAccount && openSubProcessRemap ? [{
                key: 'subProcessRemap',
                label: '子工序',
                title: frozen ? '子工序单价配置（订单已关单）' : '子工序单价配置',
                disabled: frozen,
                onClick: () => openSubProcessRemap(record),
              }] : []),
              ...(onOpenSmartReceive ? [{
                key: 'smartReceive',
                label: '入库/出库',
                title: '面辅料智能领取（入库/出库）',
                onClick: () => onOpenSmartReceive(record.orderNo || ''),
              }] : []),
              ...buildCommonOrderActions({
                record,
                frozen,
                completed,
                canManageOrderLifecycle,
                isSupervisorOrAbove,
                onQuickEdit: (r) => quickEditModal.open(r),
                handleCloseOrder,
                handleScrapOrder,
                handleCopyOrder,
                handleShareOrder,
                onOpenRemark,
              }),
            ]}
          />
        );
      },
    },
  ];

  return allColumns;
}
