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
import { isDirectCuttingOrder, isOrderFrozenByStatus, isOrderFrozenByStatusOrStock, withQuery } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import { toCategoryCn } from '@/utils/styleCategory';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { getStatusConfig, safeString } from '../utils';
import { buildCommonOrderActions } from '../../components/buildCommonOrderActions';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import dayjs from 'dayjs';
import {
  hasSecondaryProcessForOrder,
  renderStageProgressCell,
  renderStagnantBadge,
  renderSlaStatus,
  renderMerchandiserCell,
  renderWarehousingCell,
} from './riskBadgeRenderers';
import type { StageProgressContext } from './riskBadgeRenderers';

export interface UseProductionColumnsProps {
  sortField: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (field: string, order: 'asc' | 'desc') => void;
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  handleTransferOrder: (record: ProductionOrder) => void;
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
}

export function useProductionColumns({
  sortField, sortOrder, handleSort,
  handleCloseOrder, handleScrapOrder, handleTransferOrder, handleCopyOrder,
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

  const stageProgressCtx: StageProgressContext = {
    openNodeDetail,
    openProcessDetail,
    renderCompletionTimeTag,
  };

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
      title: '客户',
      dataIndex: 'company',
      key: 'companyName',
      width: 120,
      ellipsis: true,
      render: (_: any, record: any) => record.customerName || record.company || '-',
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
      render: (v: any, record: ProductionOrder) => renderMerchandiserCell(v, record, onOpenRemark),
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
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'cutting', '裁剪', stageProgressCtx),
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
        return renderStageProgressCell(rate, record, 'secondaryProcess', '二次工艺', stageProgressCtx);
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'carSewing', '车缝', stageProgressCtx),
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'tailProcess', '尾部', stageProgressCtx),
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
      render: (_: unknown, record: ProductionOrder) => renderWarehousingCell(record, openProcessDetail, renderCompletionTimeTag),
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
        const progress = calcOrderProgress(record);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag color={color} style={{ margin: 0 }}>{text}</Tag>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{progress}%</span>
            </div>
            {renderStagnantBadge(stagnantDays)}
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
            {record.isQuickResponse && <Tag color="volcano" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>快反</Tag>}
            {renderSlaStatus(record)}
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
              ...buildCommonOrderActions({
                record,
                frozen,
                completed,
                canManageOrderLifecycle,
                isSupervisorOrAbove,
                onQuickEdit: (r) => quickEditModal.open(r),
                handleCloseOrder,
                handleScrapOrder,
                handleTransferOrder,
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
