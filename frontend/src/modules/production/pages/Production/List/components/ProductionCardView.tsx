import React from 'react';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import UniversalCardView from '@/components/common/UniversalCardView';
import StandardPagination from '@/components/common/StandardPagination';
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
import { createOrderColorSizeGridFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import SmartOrderHoverCard from '../../ProgressDetail/components/SmartOrderHoverCard';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import { isOrderFrozenByStatus, withQuery } from '@/utils/api';
import { ProductionOrder } from '@/types/production';
import { buildCommonOrderActions } from '../../components/buildCommonOrderActions';

interface ProductionCardViewProps {
  sortedProductionList: ProductionOrder[];
  cardColumns: number;
  page: number;
  pageSize: number;
  handlePageChange: (page: number, pageSize: number) => void;
  smartQueueFilter: string;
  focusOrderIds: Set<string>;
  total: number;
  focusedOrderId: string | null;
  getOrderDomKey: (record: ProductionOrder) => string;
  calcCardProgress: (record: ProductionOrder) => number;
  patrolTitleTags: (record: ProductionOrder) => React.ReactNode;
  navigate: (path: string) => void;
  quickEditModal: { open: (data: ProductionOrder) => void };
  printModal: { open: (data: ProductionOrder) => void };
  handlePrintLabel: (record: ProductionOrder) => void;
  openProcessDetail: (record: ProductionOrder, type: string) => void;
  openSubProcessRemap: (record: ProductionOrder) => void;
  smartReceiveModal: { open: (data: string) => void };
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  handleCopyOrder: (record: ProductionOrder) => void;
  handleShareOrder: (record: ProductionOrder) => void;
  canManageOrderLifecycle: boolean;
  isSupervisorOrAbove: boolean;
  isFactoryAccount: boolean;
  setRemarkTarget: (target: { open: boolean; orderNo: string; merchandiser?: string; defaultRole?: string }) => void;
}

/**
 * 卡片视图组件
 * 从 ProductionList 主组件抽离：UniversalCardView + StandardPagination
 * 仅做结构拆分，不修改业务逻辑
 */
const ProductionCardView: React.FC<ProductionCardViewProps> = ({
  sortedProductionList,
  cardColumns,
  page,
  pageSize,
  handlePageChange,
  smartQueueFilter,
  focusOrderIds,
  total,
  focusedOrderId,
  getOrderDomKey,
  calcCardProgress,
  patrolTitleTags,
  navigate,
  quickEditModal,
  printModal,
  handlePrintLabel,
  openProcessDetail,
  openSubProcessRemap,
  smartReceiveModal,
  handleCloseOrder,
  handleScrapOrder,
  handleCopyOrder,
  handleShareOrder,
  canManageOrderLifecycle,
  isSupervisorOrAbove,
  isFactoryAccount,
  setRemarkTarget,
}) => {
  return (
    <>
    <UniversalCardView
      dataSource={sortedProductionList}
      columns={cardColumns}
      coverField="styleCover"
      titleField="orderNo"
      subtitleField="styleNo"
      fields={[]}
      fieldGroups={[
        [
          { label: '下单', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
        ],
        ...createOrderColorSizeGridFieldGroups<ProductionOrder>({
          gridKey: 'cardColorSizeGrid',
          getItems: (record) => getOrderCardSizeQuantityItems(record),
          getFallbackColor: (record) => String(record.color || '').trim(),
          getFallbackSize: (record) => String(record.size || '').trim(),
          getFallbackQuantity: (record) => Number(record.orderQuantity) || 0,
        }),
        [
          { label: '', key: 'statusTags', render: (_val: unknown, record: Record<string, unknown>) => {
            const statusKey = String(record?.status || '').trim().toLowerCase();
            const status = statusKey ? (ORDER_STATUS_LABEL[statusKey] || '未知') : '-';
            const statusColor = ORDER_STATUS_COLOR[statusKey] || 'default';
            const { text: remainText, color: remainColor } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string);
            const deliveryDate = record?.plannedEndDate ? dayjs(record.plannedEndDate as string).format('MM-DD') : '';
            return (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <Tag color={statusColor} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{status}</Tag>
                {deliveryDate && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{deliveryDate}</span>}
                {record?.urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>急</Tag>}
                {String(record?.plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>首单</Tag>}
                {String(record?.plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>翻单</Tag>}
                {remainText && remainText !== '已完成' && remainText !== '已报废' && remainText !== '已关单' && remainText !== '已取消' && remainText !== '-'
                  && <Tag style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px', color: remainColor, borderColor: remainColor, background: 'transparent', fontWeight: 600 }}>{remainText}</Tag>}
              </div>
            );
          }},
        ]
      ]}
      progressConfig={{
        calculate: calcCardProgress,
        getStatus: (record: ProductionOrder) => {
          const s = String(record.status || '').trim().toLowerCase();
          if (s === 'completed' || s === 'closed') return 'normal' as const;
          if (isOrderFrozenByStatus(record)) return 'default' as const;
          return getProgressColorStatus(record.plannedEndDate, record.status);
        },
        isCompleted: (record: ProductionOrder) => {
          const s = String(record.status || '').trim().toLowerCase();
          return s === 'completed' || s === 'closed';
        },
        minVisiblePercent: (record: ProductionOrder) => String(record.status || '').trim().toLowerCase() === 'in_progress' ? 5 : 0,
        show: true,
        type: 'liquid',
        progressExtra: (record: ProductionOrder) => {
          const frozen = isOrderFrozenByStatus(record);
          return (
            <BudgetDaysEditor
              record={record}
              nodeName="整体"
              stageEndTime={(record as any).actualEndDate || undefined}
              isCompletedOrClosed={frozen}
            />
          );
        },
      }}
      getCardId={(record) => `production-order-card-${getOrderDomKey(record as ProductionOrder)}`}
      getCardStyle={(record) => getOrderDomKey(record as ProductionOrder) === focusedOrderId ? {
        boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.35), 0 10px 24px rgba(250, 173, 20, 0.18)',
        transform: 'translateY(-2px)',
      } : undefined}
      actions={(record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        const frozenTitle = '订单已关单/报废/完成，无法操作';
        const commonActions = buildCommonOrderActions({
          record, frozen, completed: frozen,
          canManageOrderLifecycle: !!canManageOrderLifecycle,
          isSupervisorOrAbove: !!isSupervisorOrAbove,
          onQuickEdit: (r) => quickEditModal.open(r),
          handleCloseOrder, handleScrapOrder, handleCopyOrder, handleShareOrder,
          onOpenRemark: (r) => setRemarkTarget({ open: true, orderNo: r.orderNo || '', merchandiser: r.merchandiser }),
        });
        return [
          { key: 'detail', label: '详情', title: '查看订单详情', onClick: () => navigate(withQuery('/production/order-flow', { orderId: record.id, orderNo: record.orderNo, styleNo: record.styleNo })) },
          { key: 'print', label: '打印', disabled: frozen, title: frozen ? frozenTitle : '打印', onClick: () => printModal.open(record) },
          { key: 'printLabel', label: '打印标签', disabled: frozen, title: frozen ? frozenTitle : '打印标签', onClick: () => void handlePrintLabel(record) },
          ...(!isFactoryAccount ? [{ key: 'process', label: '工序', disabled: frozen, title: frozen ? frozenTitle : '工序', onClick: () => openProcessDetail(record, 'all') }] : []),
          ...(isFactoryAccount ? [{ key: 'subProcessRemap', label: '子工序', disabled: frozen, title: frozen ? frozenTitle : '子工序单价配置', onClick: () => openSubProcessRemap(record) }] : []),
          { key: 'receive', label: '入库/出库', title: '面辅料智能领取（入库/出库）', onClick: () => smartReceiveModal.open(record.orderNo || '') },
          ...commonActions,
          ...(isFactoryAccount ? [{ key: 'orderFlow', label: '全流程', title: '查看订单全流程记录', onClick: () => navigate(withQuery('/production/order-flow', { orderId: record.id, orderNo: record.orderNo, styleNo: record.styleNo })) }] : []),
        ];
      }}
      hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
      titleTags={patrolTitleTags}
    />
    {/* 卡片视图分页器 */}
    <StandardPagination
      current={page}
      pageSize={pageSize}
      total={smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? sortedProductionList.length : total}
      wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
      onChange={handlePageChange}
    />
    </>
  );
};

export default ProductionCardView;
