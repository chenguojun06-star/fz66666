import React from 'react';
import { Tag, Popover, Tooltip, Badge } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { NavigateFunction } from 'react-router-dom';
import type { ProductionOrder } from '@/types/production';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import SmartOrderHoverCard from '../../ProgressDetail/components/SmartOrderHoverCard';
import { StyleCoverThumb, StyleAttachmentsButton } from '@/components/StyleAssets';
import { isOrderFrozenByStatus, isOrderFrozenByStatusOrStock, withQuery } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { toCategoryCn } from '@/utils/styleCategory';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
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
  syncProcessFromTemplate: (record: ProductionOrder) => void;
  setPrintModalVisible: (v: boolean) => void;
  setPrintingRecord: (r: ProductionOrder | null) => void;
  setRemarkPopoverId: (id: string | null) => void;
  setRemarkText: (text: string) => void;
  quickEditModal: { open: (r: ProductionOrder) => void };
  isSupervisorOrAbove: boolean;
  renderCompletionTimeTag: (record: ProductionOrder, stage: string, rate: number, position?: string) => React.ReactNode;
}

/**
 * 生产订单列表列定义 Hook
 * 从 Production/List/index.tsx 提取，减少主文件体积 ~600 行
 */
export function useProductionColumns({
  sortField, sortOrder, handleSort,
  handleCloseOrder, handleScrapOrder, handleTransferOrder,
  navigate, openProcessDetail, syncProcessFromTemplate,
  setPrintModalVisible, setPrintingRecord,
  setRemarkPopoverId, setRemarkText,
  quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag,
}: UseProductionColumnsProps) {
  const renderStageTime = (value: unknown) => value ? formatDateTime(value) : '-';
  const renderStageText = (value: unknown) => safeString(value);

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
              overlayStyle={{ maxWidth: 280 }}
            >
            <a
              className="order-no-wrap"
              style={{ cursor: 'pointer' }}
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
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
      render: (v: any, record: any) => {
        const bizType = record.orderBizType as string | undefined;
        const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>{v || '-'}</span>
            {bizType && (
              <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16, width: 'fit-content' }}>{bizType}</Tag>
            )}
          </div>
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
      title: '纸样师',
      dataIndex: 'patternMaker',
      key: 'patternMaker',
      width: 100,
      render: (v: any) => v || '-',
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
      key: 'quotationUnitPrice',
      width: 90,
      align: 'right' as const,
      render: (_: any, record: any) => {
        const v = Number(record?.quotationUnitPrice);
        return (Number.isFinite(v) && v > 0)
          ? <span style={{ color: '#1677ff', fontWeight: 500 }}>¥{v.toFixed(2)}</span>
          : <span style={{ color: '#bfbfbf' }}>-</span>;
      },
    },
    {
      title: '下单人',
      dataIndex: 'orderOperatorName',
      key: 'orderOperatorName',
      width: 120,
      render: renderStageText,
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
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (v: any) => v || '-',
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
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const frozen = isOrderFrozenByStatus(record);
        const colorStatus = frozen ? 'default' : getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'procurement'); }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-container)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
          >
            {renderCompletionTimeTag(record, '采购', rate || 0)}
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar percent={rate || 0} width="100%" height={16} status={colorStatus} />
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
      render: (rate: number, record: ProductionOrder) => {
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const frozen = isOrderFrozenByStatus(record);
        const colorStatus = frozen ? 'default' : getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'cutting'); }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
          >
            {renderCompletionTimeTag(record, '裁剪', rate || 0)}
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar percent={rate || 0} width="100%" height={16} status={colorStatus} />
          </div>
        );
      },
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessRate',
      key: 'secondaryProcessSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const hasSecondaryProcessData = (() => {
          // 后端已查t_secondary_process表，直接使用
          if ((record as any).hasSecondaryProcess) return true;
          if ((record as any).secondaryProcessStartTime || (record as any).secondaryProcessEndTime) return true;
          const nodes = record.progressNodeUnitPrices;
          if (!Array.isArray(nodes) || nodes.length === 0) return false;
          return nodes.some((n: any) => {
            const name = String(n.name || n.processName || '').trim();
            return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
          });
        })();

        if (!hasSecondaryProcessData) {
          return (
            <div style={{ padding: '4px', opacity: 0.4 }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '2px', textAlign: 'center' }}>-</div>
              <div style={{ width: '100%', height: '16px', background: 'var(--color-border)', borderRadius: '8px' }} />
            </div>
          );
        }

        const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const frozen = isOrderFrozenByStatus(record);
        const colorStatus = frozen ? 'default' : getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'secondaryProcess'); }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
          >
            {renderCompletionTimeTag(record, '二次工艺', rate || 0)}
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar percent={rate || 0} width="100%" height={16} status={colorStatus} />
          </div>
        );
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const frozen = isOrderFrozenByStatus(record);
        const colorStatus = frozen ? 'default' : getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'carSewing'); }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
          >
            {renderCompletionTimeTag(record, '车缝', rate || 0)}
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar percent={rate || 0} width="100%" height={16} status={colorStatus} />
          </div>
        );
      },
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const frozen = isOrderFrozenByStatus(record);
        const colorStatus = frozen ? 'default' : getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: frozen ? 0.6 : 1 }}
            onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'tailProcess'); }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
          >
            {renderCompletionTimeTag(record, '尾部', rate || 0)}
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar percent={rate || 0} width="100%" height={16} status={colorStatus} />
          </div>
        );
      },
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '36px', height: '36px' }}>
                <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-bg-subtle)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={getColor()} strokeWidth="3"
                    strokeDasharray={`${(rate / 100) * 100.53} 100.53`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.3s ease' }} />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px', fontWeight: 700, color: getColor() }}>
                  {rate}%
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-text)' }}>{qualified}/{total}</span>
                <span style={{ fontSize: '11px', color: 'var(--neutral-text-disabled)' }}>{qualified > 0 ? '已入库' : '未入库'}</span>
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
      title: '生产进度',
      dataIndex: 'productionProgress',
      key: 'productionProgress',
      width: 100,
      render: (value: number) => `${value}%`,
      align: 'right' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ProductionOrder['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: <SortableColumnTitle title="订单交期" fieldName="plannedEndDate" onSort={handleSort} sortField={sortField} sortOrder={sortOrder} />,
      dataIndex: 'plannedEndDate',
      key: 'plannedEndDate',
      width: 155,
      render: (value: unknown, record: ProductionOrder) => {
        const dateStr = value ? formatDateTime(value as string) : '-';
        const { text, color } = getRemainingDaysDisplay(value as string, record.createTime, record.actualEndDate);
        // 进度风险标签：综合 daysLeft + productionProgress 给出预警
        const s = record.status;
        const prog = Number(record.productionProgress) || 0;
        const planEnd = value ? dayjs(value as string) : null;
        const dLeft = planEnd ? planEnd.diff(dayjs(), 'day') : null;
        let riskTag: { text: string; color: string } | null = null;
        if (s !== 'completed' && dLeft !== null && prog < 100) {
          if (dLeft < 0)                          riskTag = { text: '🔴 已逾期', color: '#ff4d4f' };
          else if (dLeft <= 3  && prog < 80)      riskTag = { text: '🔴 严重偏慢', color: '#ff4d4f' };
          else if (dLeft <= 7  && prog < 50)      riskTag = { text: '🟡 进度偏慢', color: '#fa8c16' };
          else if (dLeft <= 14 && prog < 30)      riskTag = { text: '🟡 需关注', color: '#faad14' };
          else if (prog >= 80 && dLeft >= 3)      riskTag = { text: '🟢 顺利', color: '#52c41a' };
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12 }}>{dateStr}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color }}>{text}</span>
            {riskTag && (
              <span style={{ fontSize: 10, fontWeight: 700, color: riskTag.color }}>
                {riskTag.text}
              </span>
            )}
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
        const frozen = isOrderFrozenByStatusOrStock(record);
        const completed = isOrderFrozenByStatus(record);

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
              {
                key: 'process',
                label: '工序',
                title: frozen ? '工序（订单已关单）' : '查看工序详情',
                disabled: frozen,
                children: [
                  { key: 'all', label: '📋 全部工序', onClick: () => openProcessDetail(record, 'all') },
                  { type: 'divider' },
                  { key: 'procurement', label: '采购', onClick: () => openProcessDetail(record, 'procurement') },
                  { key: 'cutting', label: '裁剪', onClick: () => openProcessDetail(record, 'cutting') },
                  { key: 'carSewing', label: '车缝', onClick: () => openProcessDetail(record, 'carSewing') },
                  ...(() => {
                    const nodes = record.progressNodeUnitPrices;
                    if (!Array.isArray(nodes)) return [];
                    const hasSecondary = nodes.some((n: any) => {
                      const name = String(n.name || n.processName || '').trim();
                      return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
                    });
                    return hasSecondary ? [{ key: 'secondaryProcess', label: '二次工艺', onClick: () => openProcessDetail(record, 'secondaryProcess') }] : [];
                  })(),
                  { key: 'tailProcess', label: '尾部', onClick: () => openProcessDetail(record, 'tailProcess') },
                  { type: 'divider' },
                  { key: 'syncProcess', label: '🔄 从模板同步', onClick: () => syncProcessFromTemplate(record) },
                ],
              },
              {
                key: 'quickEdit',
                label: '编辑',
                title: frozen ? '编辑（订单已关单）' : '快速编辑备注和预计出货',
                disabled: frozen,
                onClick: () => { quickEditModal.open(record); },
              },
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
              },
            ]}
          />
        );
      },
    },
  ];

  return allColumns;
}
