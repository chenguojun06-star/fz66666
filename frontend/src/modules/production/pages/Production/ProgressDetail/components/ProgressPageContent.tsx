import React, { useMemo } from 'react';
import { Card, Tag } from 'antd';
import dayjs from 'dayjs';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import UniversalCardView from '@/components/common/UniversalCardView';
import StandardPagination from '@/components/common/StandardPagination';
import { createOrderColorSizeGridFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import { isOrderFrozenByStatus } from '@/utils/api';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSize } from '@/utils/pageSizeStore';
import type { ProductionOrder, ProductionQueryParams } from '@/types/production';
import ProgressRowList from './ProgressRowList';
import ProgressAlerts from './ProgressAlerts';
import SmartOrderHoverCard from './SmartOrderHoverCard';
import { FilterSearchSection, FilterRightSection, EmbeddedFilterBar } from './ProgressFilterBar';

type ProgressPageContentProps = {
  embedded?: boolean;
  queryParams: ProductionQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<ProductionQueryParams>>;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  setDateRange: (range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
  statusOptions: Array<{ label: string; value: string }>;
  factoryTypeOptions: Array<{ label: string; value: string }>;
  viewMode: 'list' | 'card';
  setViewMode: (mode: 'list' | 'card') => void;
  dateSortAsc: boolean;
  toggleDateSort: () => void;
  activeStatFilter: string;
  handleStatClick: (key: string) => void;
  globalStats: Record<string, number>;
  showSmartErrorNotice: boolean;
  smartError: any;
  onFixError: () => void;
  bottleneckBannerVisible: boolean;
  bottleneckItems: any[];
  setBottleneckBannerVisible: (v: boolean) => void;
  bottleneckLoading: boolean;
  loading: boolean;
  orders: ProductionOrder[];
  sortedOrders: ProductionOrder[];
  sortedSmartQueueOrders: ProductionOrder[];
  total: number;
  columns: any[];
  cardColumns: number;
  cardActions: any;
  titleTags: any;
  boardStatsByOrder: Record<string, any>;
  focusedOrderId: string | null;
  getOrderDomKey: (order: ProductionOrder) => string;
  smartQueueFilter: string;
  smartQueueOrders: ProductionOrder[];
  smartActionItems: any[];
  setSmartQueueFilter: (v: any) => void;
  fetchOrders: () => void;
};

const STAT_CARDS_CONFIG = [
  {
    key: 'production',
    getItems: (gs: Record<string, number>) => [
      { label: '生产订单', value: Number(gs.activeOrders ?? gs.totalOrders ?? 0), unit: '个', color: 'var(--color-primary)' },
      { label: '生产数量', value: Number(gs.activeQuantity ?? gs.totalQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
    ],
    activeColor: 'var(--color-primary)',
  },
  {
    key: 'delayed',
    getItems: (gs: Record<string, number>) => [
      { label: '延期订单', value: gs.delayedOrders, unit: '个', color: 'var(--color-danger)' },
      { label: '延期数量', value: gs.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
    ],
    activeColor: 'var(--color-danger)',
  },
  {
    key: 'today',
    getItems: (gs: Record<string, number>) => [
      { label: '今日订单', value: gs.todayOrders, unit: '个', color: 'var(--color-primary)' },
      { label: '今日数量', value: gs.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
    ],
    activeColor: 'var(--color-primary)',
  },
];

const ProgressPageContent: React.FC<ProgressPageContentProps> = ({
  embedded, queryParams, setQueryParams, dateRange, setDateRange,
  statusOptions, factoryTypeOptions, viewMode, setViewMode,
  dateSortAsc, toggleDateSort, activeStatFilter, handleStatClick,
  globalStats, showSmartErrorNotice, smartError, onFixError,
  bottleneckBannerVisible, bottleneckItems, setBottleneckBannerVisible, bottleneckLoading,
  loading, orders, sortedOrders, sortedSmartQueueOrders, total, columns, cardColumns, cardActions,
  boardStatsByOrder, focusedOrderId, getOrderDomKey,
  smartQueueFilter, smartQueueOrders, smartActionItems, setSmartQueueFilter,
  fetchOrders,
}) => {
  const calcCardProgress = useMemo(() => (record: ProductionOrder): number =>
    calcOrderProgress(record, boardStatsByOrder[String(record.id || '')] ?? null),
    [boardStatsByOrder],
  );

  const productionCardFieldGroups = useMemo(() => [
    ...createOrderColorSizeGridFieldGroups<ProductionOrder>({
      gridKey: 'cardColorSizeGrid',
      getItems: (record) => getOrderCardSizeQuantityItems(record),
      getFallbackColor: (record) => String(record.color || '').trim(),
      getFallbackSize: (record) => String(record.size || '').trim(),
      getFallbackQuantity: (record) => Number(record.orderQuantity) || 0,
    }),
    [
      { label: '下单', key: 'createTime', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' },
      { label: '交期', key: 'plannedEndDate', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' },
    ],
    [
      { label: '', key: 'statusTags', render: (_val: any, record: any) => {
        const status = ORDER_STATUS_LABEL[String(record?.status || '').trim().toLowerCase()] || record?.status || '-';
        const statusColor = ORDER_STATUS_COLOR[String(record?.status || '').trim().toLowerCase()] || 'default';
        const { text: remainText, color: remainColor } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string);
        return (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <Tag color={statusColor} style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', height: 18 }}>{status}</Tag>
            {record?.urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', height: 18 }}>急</Tag>}
            {String(record?.plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', height: 18 }}>首单</Tag>}
            {String(record?.plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', height: 18 }}>翻单</Tag>}
            {remainText && remainText !== '已完成' && remainText !== '已报废' && remainText !== '已关单' && remainText !== '-'
              && <Tag style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', height: 18, color: remainColor, borderColor: remainColor, background: 'transparent', fontWeight: 600 }}>{remainText}</Tag>}
          </div>
        );
      }},
    ],
  ], []);

  const productionCardProgressConfig = useMemo(() => ({
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
    type: 'liquid' as const,
  }), [calcCardProgress]);

  const statCardsConfig = useMemo(() => ({
    activeKey: activeStatFilter,
    cards: STAT_CARDS_CONFIG.map(cfg => ({
      key: cfg.key,
      items: cfg.getItems(globalStats),
      onClick: () => handleStatClick(cfg.key),
      activeColor: cfg.activeColor,
    })),
  }), [activeStatFilter, globalStats, handleStatClick]);

  const alerts = (
    <ProgressAlerts showSmartErrorNotice={showSmartErrorNotice} smartError={smartError} onFixError={onFixError} bottleneckBannerVisible={bottleneckBannerVisible} bottleneckItems={bottleneckItems} setBottleneckBannerVisible={setBottleneckBannerVisible} bottleneckLoading={bottleneckLoading} />
  );

  const paginationConfig = {
    current: queryParams.page, pageSize: queryParams.pageSize, total,
    pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
    onChange: (page: number, pageSize: number) => { savePageSize(pageSize); setQueryParams((prev) => ({ ...prev, page, pageSize })); },
  };

  const listView = (dataSource: ProductionOrder[], focusedId?: string | null) => (
    <ProgressRowList dataSource={dataSource} columns={columns} loading={loading && orders.length === 0} focusedOrderId={focusedId ?? undefined} getRowDomKey={getOrderDomKey} pagination={paginationConfig} />
  );

  const cardView = (dataSource: ProductionOrder[], showFocus?: boolean) => (
    <>
      <UniversalCardView
        dataSource={dataSource} loading={loading && orders.length === 0} columns={cardColumns}
        coverField="styleCover" titleField="orderNo" subtitleField="styleNo" fields={[]}
        fieldGroups={productionCardFieldGroups} progressConfig={productionCardProgressConfig}
        getCardId={showFocus ? (record) => `progress-order-card-${getOrderDomKey(record as ProductionOrder)}` : undefined}
        getCardStyle={showFocus ? (record) => getOrderDomKey(record as ProductionOrder) === focusedOrderId ? { boxShadow: '0 0 0 2px rgba(24, 144, 255, 0.28), 0 10px 24px rgba(24, 144, 255, 0.18)', transform: 'translateY(-2px)' } : undefined : undefined}
        actions={cardActions} hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />} titleTags={undefined}
      />
      <StandardPagination current={queryParams.page} pageSize={queryParams.pageSize} total={total} wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }} showQuickJumper={false} onChange={(page, pageSize) => { savePageSize(pageSize); setQueryParams((prev) => ({ ...prev, page, pageSize })); }} />
    </>
  );

  const filterBarProps = { queryParams, setQueryParams, dateRange, setDateRange, statusOptions, factoryTypeOptions, viewMode, setViewMode, dateSortAsc, toggleDateSort };

  if (embedded) {
    return (
      <>
        <Card size="small" className="filter-card mb-sm">
          <EmbeddedFilterBar {...filterBarProps} onReset={() => { setQueryParams({ page: 1, pageSize: queryParams.pageSize, keyword: '', includeScrapped: undefined, excludeTerminal: true }); setDateRange(null); }} />
        </Card>
        {alerts}
        <PageStatCards {...statCardsConfig} />
        {viewMode === 'list' ? listView(sortedOrders) : cardView(sortedOrders)}
      </>
    );
  }

  const cardDataSource = smartQueueFilter === 'all'
    ? sortedOrders
    : sortedOrders.filter((o) => smartQueueOrders.some((s) => String(s.id || '') === String(o.id || '')));

  return (
    <PageLayout
      title="工序跟进"
      headerContent={
        <PageStatCards
          {...statCardsConfig}
          hints={smartActionItems.map((item: any) => ({ ...item, count: item.value }))}
          onClearHints={smartQueueFilter !== 'all' ? () => setSmartQueueFilter('all') : undefined}
        />
      }
      filterLeft={<FilterSearchSection {...filterBarProps} />}
      filterRight={<FilterRightSection viewMode={viewMode} setViewMode={setViewMode} dateSortAsc={dateSortAsc} toggleDateSort={toggleDateSort} onRefresh={() => fetchOrders()} />}
    >
      {alerts}
      {viewMode === 'list' ? listView(sortedSmartQueueOrders, focusedOrderId) : cardView(cardDataSource, true)}
    </PageLayout>
  );
};

export default ProgressPageContent;
