import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useFieldConfig } from '@/hooks/useFieldConfig';

import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';
import { useStyleViewMode } from './hooks/useStyleViewMode';
import { useStyleListData, StyleSmartFilter } from './hooks/useStyleListData';
import { useStyleFocus } from './hooks/useStyleFocus';
import { useStyleMaintenance } from './hooks/useStyleMaintenance';
import { useStylePrint } from './hooks/useStylePrint';
import { useStyleListPage } from './hooks/useStyleListPage';

import StyleFilterPanel from './components/StyleFilterPanel';
import StyleStatsCard from './components/StyleStatsCard';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';
import StyleStatCardsSection from './components/StyleStatCardsSection';
import StyleFilterBarExtra from './components/StyleFilterBarExtra';
import StyleModals from './components/StyleModals';

import '../StyleInfo/styles.css';

const StyleInfoListPage: React.FC = () => {
  const navigate = useNavigate();
  useCardGridLayout(10);

  const { fields: styleFieldConfigs } = useFieldConfig({ bizType: 'style', platform: 'pc' });
  const customFields = useMemo(
    () => styleFieldConfigs.filter((f) => f.isSystem === 0 && f.enabled !== 0),
    [styleFieldConfigs]
  );

  const { loading, data, total, queryParams, setQueryParams, fetchList } = useStyleList();

  const {
    statsRangeType,
    setStatsRangeType,
    dateRange,
    setDateRange,
    developmentStats,
    statsLoading,
    loadDevelopmentStats,
  } = useStyleStats();

  const {
    handleScrap,
    confirmScrap,
    cancelScrap,
    pendingScrapId,
    scrapLoading,
    handleToggleTop: _handleToggleTop,
    handlePrint: _handlePrint,
  } = useStyleActions(fetchList);

  const { stageHints: delayedHints } = useDelayedStageBreakdown({ forceTab: 'sample' });

  const { viewMode, setViewMode } = useStyleViewMode();

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

  const {
    pendingFocusStyleId,
    setPendingFocusStyleId,
    focusedStyleId,
    setFocusedStyleId,
    getStyleDomKey,
  } = useStyleFocus({ viewMode, data });

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

  const { printModalVisible, printingRecord, handlePrintClick, closePrintModal } = useStylePrint();

  const { costDetailVisible, setCostDetailVisible, handleSmartFilterClick, handlePageChange } =
    useStyleListPage({
      smartFilter,
      setSmartFilter,
      queryParams,
      setQueryParams,
      setPendingFocusStyleId,
      setFocusedStyleId,
      getStyleDomKey,
    });

  return (
    <>
      <PageLayout
        title="样衣开发与生产"
        headerContent={
          <>
            <StyleStatsCard
              stats={developmentStats}
              loading={statsLoading}
              onViewDetails={() => setCostDetailVisible(true)}
            />
            <StyleStatCardsSection
              styleStats={styleStats}
              activeStatFilter={activeStatFilter}
              setActiveStatFilter={setActiveStatFilter}
              setQueryParams={setQueryParams}
              smartFilter={smartFilter}
              setSmartFilter={setSmartFilter}
              focusStyleIds={focusStyleIds}
              setFocusStyleIds={setFocusStyleIds}
              setPendingFocusStyleId={setPendingFocusStyleId}
              setFocusedStyleId={setFocusedStyleId}
              overdueStyles={overdueStyles}
              warningStyles={warningStyles}
              overdueStyleCount={overdueStyleCount}
              warningStyleCount={warningStyleCount}
              delayedHints={delayedHints}
              showAllStyles={showAllStyles}
              setShowAllStyles={setShowAllStyles}
              handleSmartFilterClick={handleSmartFilterClick}
            />
          </>
        }
        filterBar={
          <StyleFilterPanel
            queryParams={queryParams}
            onQueryChange={(params) => setQueryParams((prev) => ({ ...prev, ...params }))}
            onSearch={fetchList}
            loading={loading}
            extra={
              <StyleFilterBarExtra
                loading={loading}
                dateSortAsc={dateSortAsc}
                setDateSortAsc={setDateSortAsc}
                viewMode={viewMode}
                setViewMode={setViewMode}
                setQueryParams={setQueryParams}
                onRefresh={fetchList}
                onNavigateNew={() => navigate('/style-info/new')}
                onNavigateFieldConfig={() => navigate('/system/field-config?bizType=style')}
              />
            }
          />
        }
      >
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
      <StyleModals
        printModalVisible={printModalVisible}
        printingRecord={printingRecord}
        closePrintModal={closePrintModal}
        maintenanceOpen={maintenanceOpen}
        maintenanceSaving={maintenanceSaving}
        maintenanceRecord={maintenanceRecord}
        maintenanceReason={maintenanceReason}
        setMaintenanceReason={setMaintenanceReason}
        submitMaintenance={submitMaintenance}
        closeMaintenance={closeMaintenance}
        pendingScrapId={pendingScrapId}
        scrapLoading={scrapLoading}
        confirmScrap={confirmScrap}
        cancelScrap={cancelScrap}
        costDetailVisible={costDetailVisible}
        setCostDetailVisible={setCostDetailVisible}
        developmentStats={developmentStats}
        statsLoading={statsLoading}
        statsRangeType={statsRangeType}
        dateRange={dateRange}
        setStatsRangeType={setStatsRangeType}
        setDateRange={setDateRange}
        loadDevelopmentStats={loadDevelopmentStats}
      />
    </>
  );
};

export default StyleInfoListPage;
