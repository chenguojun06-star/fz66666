import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { AppstoreOutlined, ArrowUpOutlined, ArrowDownOutlined, RadarChartOutlined, SettingOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import PageStatCards from '@/components/common/PageStatCards';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { savePageSize } from '@/utils/pageSizeStore';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { StyleInfo } from '@/types/style';

// Hooks
import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';
import { useStyleViewMode } from './hooks/useStyleViewMode';
import { useStyleListData, StyleSmartFilter } from './hooks/useStyleListData';
import { useStyleFocus } from './hooks/useStyleFocus';
import { useStyleMaintenance } from './hooks/useStyleMaintenance';
import { useStylePrint } from './hooks/useStylePrint';

// Components
import StyleFilterPanel from './components/StyleFilterPanel';
import StyleStatsCard from './components/StyleStatsCard';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';
import StyleCostDetailDrawer from './components/StyleCostDetailDrawer';
import StyleMaintenanceModal from './components/StyleMaintenanceModal';
import StylePrintPreviewModal from './components/StylePrintPreviewModal';

import '../StyleInfo/styles.css';

/**
 * 款式信息列表页
 * 独立列表页面，路由: /style-info
 */
const StyleInfoListPage: React.FC = () => {
  const navigate = useNavigate();
  useCardGridLayout(10);

  // 字段配置：自定义字段（isSystem=0）展示到卡片/列表
  const { fields: styleFieldConfigs } = useFieldConfig({ bizType: 'style', platform: 'pc' });
  const customFields = useMemo(
    () => styleFieldConfigs.filter(f => f.isSystem === 0 && f.enabled !== 0),
    [styleFieldConfigs]
  );

  // 使用现有Hooks
  const {
    loading,
    data,
    total,
    queryParams,
    setQueryParams,
    fetchList
  } = useStyleList();

  const {
    statsRangeType,
    setStatsRangeType,
    dateRange,
    setDateRange,
    developmentStats,
    statsLoading,
    loadDevelopmentStats
  } = useStyleStats();

  const { handleScrap, confirmScrap, cancelScrap, pendingScrapId, scrapLoading, handleToggleTop: _handleToggleTop, handlePrint: _handlePrint } = useStyleActions(fetchList);

  // 延期环节数据（内联到智能提示标签）
  const { stageHints: delayedHints } = useDelayedStageBreakdown({ forceTab: 'sample' });

  // 视图模式（持久化）
  const { viewMode, setViewMode } = useStyleViewMode();

  // 数据 Hook：状态管理 + 加载 + 派生数据
  const {
    categoryOptions,
    stockStateMap,
    smartFilter,
    setSmartFilter,
    showAllStyles,
    setShowAllStyles,
    dateSortAsc,
    setDateSortAsc,
    focusStyleIds,
    setFocusStyleIds,
    styleStats,
    activeStatFilter,
    setActiveStatFilter,
    activeStyles,
    overdueStyles,
    warningStyles,
    overdueStyleCount,
    warningStyleCount,
    displayData,
    displayTotal,
  } = useStyleListData({
    data,
    total,
    queryParams,
    setQueryParams,
    fetchList,
    statsRangeType,
    loadDevelopmentStats,
  });

  // 焦点滚动 Hook
  const {
    pendingFocusStyleId,
    setPendingFocusStyleId,
    focusedStyleId,
    setFocusedStyleId,
    getStyleDomKey,
  } = useStyleFocus({ viewMode, data });

  // 维护功能 Hook
  const {
    maintenanceOpen,
    maintenanceSaving,
    maintenanceRecord,
    maintenanceReason,
    setMaintenanceReason,
    openMaintenance,
    closeMaintenance,
    submitMaintenance,
  } = useStyleMaintenance({ refreshCallback: fetchList });

  // 打印功能 Hook
  const { printModalVisible, printingRecord, handlePrintClick, closePrintModal } = useStylePrint();

  // 款式成本明细侧滑弹窗状态
  const [costDetailVisible, setCostDetailVisible] = useState(false);

  // ESC 键清除智能筛选（逾期/临近交期标记）
  useEffect(() => {
    if (smartFilter === 'all') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSmartFilter('all');
        setPendingFocusStyleId(null);
        setFocusedStyleId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [smartFilter, setPendingFocusStyleId, setFocusedStyleId]);

  // 智能筛选点击
  const handleSmartFilterClick = useCallback((target: Exclude<StyleSmartFilter, 'all'>, records: StyleInfo[]) => {
    if (smartFilter === target) {
      setSmartFilter('all');
      setPendingFocusStyleId(null);
      setFocusedStyleId(null);
      return;
    }
    setSmartFilter(target);
    setQueryParams(prev => ({ ...prev, page: 1 }));
    setPendingFocusStyleId(getStyleDomKey(records[0]));
  }, [getStyleDomKey, smartFilter, setQueryParams, setPendingFocusStyleId, setFocusedStyleId]);

  // 分页处理
  const handlePageChange = (page: number, pageSize: number) => {
    if (pageSize !== queryParams.pageSize) {
      savePageSize(pageSize);
    }
    setQueryParams((prev) => ({
      ...prev,
      page: pageSize !== prev.pageSize ? 1 : page,
      pageSize,
    }));
  };

  return (
    <>
      <PageLayout
        title="样衣开发与生产"
        headerContent={
          <>
            {/* 开发费用统计看板 */}
            <StyleStatsCard
              stats={developmentStats}
              loading={statsLoading}
              onViewDetails={() => setCostDetailVisible(true)}
            />

            <PageStatCards
              activeKey={activeStatFilter}
              cards={[
                {
                  key: 'all',
                  items: [
                    { label: '全部款号', value: styleStats.totalStyles, unit: '个', color: 'var(--color-text-primary)' },
                  ],
                  onClick: () => {
                    setActiveStatFilter('all');
                    setQueryParams(prev => ({ ...prev, progressNode: '', page: 1 }));
                    setSmartFilter('all');
                    setFocusStyleIds(new Set());
                  },
                  activeColor: 'var(--color-text-primary)',
                },
                {
                  key: 'developing',
                  items: [
                    { label: '开发中', value: styleStats.developingStyles, unit: '个', color: 'var(--color-primary)' },
                  ],
                  onClick: () => {
                    setActiveStatFilter('developing');
                    setQueryParams(prev => ({ ...prev, progressNode: '', page: 1 }));
                    setSmartFilter('all');
                    setFocusStyleIds(new Set());
                  },
                  activeColor: 'var(--color-primary)',
                },
                {
                  key: 'completed',
                  items: [
                    { label: '已完成', value: styleStats.completedStyles, unit: '个', color: 'var(--color-success)' },
                  ],
                  onClick: () => {
                    setActiveStatFilter('completed');
                    setQueryParams(prev => ({ ...prev, progressNode: '样衣完成', page: 1 }));
                    setSmartFilter('all');
                    setFocusStyleIds(new Set());
                  },
                  activeColor: 'var(--color-success)',
                },
                {
                  key: 'delayed',
                  items: [
                    { label: '已延期', value: styleStats.delayedStyles, unit: '个', color: 'var(--color-danger)' },
                  ],
                  onClick: () => {
                    setActiveStatFilter('delayed');
                    handleSmartFilterClick('overdue', overdueStyles);
                  },
                  activeColor: 'var(--color-danger)',
                },
              ]}
              hints={[
                {
                  key: 'overdue',
                  count: overdueStyleCount,
                  tone: 'red',
                  label: '已延期',
                  hint: overdueStyles[0]?.styleNo ? `点击定位到 ${overdueStyles[0].styleNo}` : '点击定位到延期款号',
                  active: smartFilter === 'overdue',
                  onClick: () => handleSmartFilterClick('overdue', overdueStyles),
                },
                {
                  key: 'warning',
                  count: warningStyleCount,
                  tone: 'orange',
                  label: '临近交期',
                  hint: warningStyles[0]?.styleNo ? `点击定位到 ${warningStyles[0].styleNo}` : '点击定位到临近交期款号',
                  active: smartFilter === 'warning',
                  onClick: () => handleSmartFilterClick('warning', warningStyles),
                },
                // 延期环节提示（只显示延期，不显示"进行中"统计，避免重复）
                ...delayedHints.map(h => ({
                  key: h.key,
                  count: h.count,
                  tone: 'orange' as const,
                  label: `${h.stageName}延期`,
                  hint: `点击查看${h.stageName}延期款式`,
                  active: focusStyleIds.size > 0 && h.items.some(item => focusStyleIds.has(String(item.id))),
                  onClick: () => {
                    const ids = h.items.map(item => String(item.id));
                    setFocusStyleIds(new Set(ids));
                    setSmartFilter('all');
                    setQueryParams(prev => ({ ...prev, page: 1 }));
                  },
                })),
              ]}
              onClearHints={smartFilter !== 'all' || focusStyleIds.size > 0 ? () => {
                setSmartFilter('all');
                setFocusStyleIds(new Set());
                setPendingFocusStyleId(null);
                setFocusedStyleId(null);
              } : undefined}
              extraRight={
                <button
                  type="button"
                  onClick={() => setShowAllStyles(v => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    border: '1px solid var(--color-border-antd)',
                    background: 'var(--color-bg-base)',
                    color: showAllStyles ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showAllStyles ? '只看进行中' : '显示全部'}
                </button>
              }
            />

          </>
        }
        filterBar={
          <StyleFilterPanel
            queryParams={queryParams}
            onQueryChange={(params) => setQueryParams(prev => ({ ...prev, ...params }))}
            onSearch={fetchList}
            loading={loading}
            extra={(
              <>
                <Button
                  onClick={() => fetchList()}
                  loading={loading}
                >
                  刷新
                </Button>
                <Button
                  icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  onClick={() => setDateSortAsc(v => !v)}
                  title={dateSortAsc ? '按时间升序' : '按时间降序'}
                />
                <Button
                  icon={viewMode === 'smart' ? <AppstoreOutlined /> : <RadarChartOutlined />}
                  onClick={() => {
                    const next = viewMode === 'smart' ? 'card' : 'smart';
                    setViewMode(next);
                    setQueryParams((prev) => ({ ...prev, page: 1 }));
                  }}
                >
                  {viewMode === 'smart' ? '卡片视图' : '智能视图'}
                </Button>
                <Button
                  type="primary"
                  onClick={() => navigate('/style-info/new')}
                >
                  新建
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={() => navigate('/system/field-config?bizType=style')}
                  title="配置本页显示哪些字段、字段顺序、字段标签"
                >
                  字段配置
                </Button>
              </>
            )}
          />
        }
      >
        {/* 列表/卡片视图 */}
        {viewMode === 'smart' ? (
          <StyleTableView
            data={displayData}
            stockStateMap={stockStateMap}
            loading={loading}
            total={displayTotal}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            categoryOptions={categoryOptions}
            onRefresh={fetchList}
            focusedStyleId={focusedStyleId}
            dateSortAsc={dateSortAsc}
            customFields={customFields}
          />
        ) : (
          <StyleCardView
            data={displayData}
            stockStateMap={stockStateMap}
            loading={loading}
            total={displayTotal}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            onRefresh={fetchList}
            focusedStyleId={focusedStyleId}
            customFields={customFields}
          />
        )}
      </PageLayout>

      {/* 打印预览弹窗 */}
      <StylePrintPreviewModal
        visible={printModalVisible}
        record={printingRecord}
        onClose={closePrintModal}
      />

      {/* 维护原因弹窗 */}
      <StyleMaintenanceModal
        open={maintenanceOpen}
        saving={maintenanceSaving}
        record={maintenanceRecord}
        reason={maintenanceReason}
        onReasonChange={setMaintenanceReason}
        onOk={submitMaintenance}
        onCancel={closeMaintenance}
      />

      <RejectReasonModal
        open={pendingScrapId !== null}
        title="确认报废"
        description="报废后记录会保留在当前页面，进度停止，并显示为开发样报废。"
        fieldLabel="报废原因"
        okText="确认报废"
        placeholder="请输入报废原因"
        required
        okDanger
        loading={scrapLoading}
        onOk={confirmScrap}
        onCancel={cancelScrap}
      />

      {/* 款式成本明细侧滑弹窗 */}
      <StyleCostDetailDrawer
        visible={costDetailVisible}
        onClose={() => setCostDetailVisible(false)}
        stats={developmentStats}
        loading={statsLoading}
        rangeType={statsRangeType}
        dateRange={dateRange}
        onRangeChange={(type) => {
          setStatsRangeType(type);
          loadDevelopmentStats(type);
        }}
        onDateRangeChange={(range) => {
          setStatsRangeType('custom');
          setDateRange(range);
          loadDevelopmentStats('custom', range);
        }}
      />
    </>
  );
};

export default StyleInfoListPage;
