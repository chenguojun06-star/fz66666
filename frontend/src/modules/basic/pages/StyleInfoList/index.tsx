import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import api from '@/utils/api';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { usePinnedRows } from '@/hooks/usePinnedRows';
import { StyleInfo } from '@/types/style';

import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';
import { useStyleViewMode } from './hooks/useStyleViewMode';
import { useStyleListData } from './hooks/useStyleListData';
import { useStyleFocus } from './hooks/useStyleFocus';
import { useStyleMaintenance } from './hooks/useStyleMaintenance';
import { useStylePrint } from './hooks/useStylePrint';
import { useStyleListPage } from './hooks/useStyleListPage';

import StyleFilterPanel from './components/StyleFilterPanel';
import StyleStatsCard from './components/StyleStatsCard';
import StyleListView, { STYLE_LIST_COLUMNS, STYLE_LIST_DEFAULT_VISIBLE } from './components/StyleListView';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';
import StyleStatCardsSection from './components/StyleStatCardsSection';
import StyleFilterBarExtra from './components/StyleFilterBarExtra';
import StyleModals from './components/StyleModals';
import { useColumnSettings, ColumnSettingsDrawer } from '@/components/common/ColumnSettings';

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
    handleUnscrap,
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

  const styleColumnSettings = useColumnSettings({
    pageKey: 'style-list-table',
    bizType: 'style',
    allColumns: STYLE_LIST_COLUMNS,
    defaultVisible: STYLE_LIST_DEFAULT_VISIBLE,
  });
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // 置顶（用户个人视角）：钉住的款式常驻列表最前，跨登录跟随账号（t_user_preference + 本地双写）。
  // 不在当前页的钉住款式按 id 补拉详情插到最前，保证"钉了就一定看得到"。
  const rowPins = usePinnedRows('style-info-list');
  const [pinnedExtraStyles, setPinnedExtraStyles] = useState<StyleInfo[]>([]);
  const currentPageStyleIds = useMemo(
    () => new Set(data.map((s) => String(s.id))),
    [data],
  );
  useEffect(() => {
    const missing = rowPins.pins.filter((id) => !currentPageStyleIds.has(id));
    if (!missing.length) {
      setPinnedExtraStyles((prev) => (prev.length ? [] : prev));
      return;
    }
    let cancelled = false;
    void (async () => {
      const fetched = await Promise.all(missing.slice(0, rowPins.maxPins).map(async (id) => {
        try {
          const res = await api.get<any>(`/style/info/${id}`);
          return res?.code === 200 && res.data ? (res.data as StyleInfo) : null;
        } catch { return null; }
      }));
      if (!cancelled) setPinnedExtraStyles(fetched.filter(Boolean) as StyleInfo[]);
    })();
    return () => { cancelled = true; };
  }, [rowPins.pins, rowPins.maxPins, currentPageStyleIds]);

  // 展示数据 = 置顶行（含补拉的场外钉住款）按钉住顺序排最前 + 其余按原排序；
  // 延期环节跳转（focusStyleIds）聚焦态下不插入场外置顶行，保持聚焦口径
  const pinDisplayData = useMemo(() => {
    const extras = focusStyleIds.size > 0 ? [] : pinnedExtraStyles;
    const all = [...extras, ...displayData];
    const pinIdx = new Map(rowPins.pins.map((id, i) => [String(id), i]));
    const pinned = all
      .filter((s) => pinIdx.has(String(s.id)))
      .sort((a, b) => (pinIdx.get(String(a.id)) ?? 0) - (pinIdx.get(String(b.id)) ?? 0));
    const rest = all.filter((s) => !pinIdx.has(String(s.id)));
    return [...pinned, ...rest];
  }, [pinnedExtraStyles, displayData, focusStyleIds.size, rowPins.pins]);
  const handleTogglePinStyle = useCallback((record: StyleInfo) => {
    rowPins.toggle(record.id);
  }, [rowPins]);
  const stylePinProps = useMemo(() => ({
    pinnedStyleIds: rowPins.pinSet,
    onTogglePinStyle: handleTogglePinStyle,
  }), [rowPins.pinSet, handleTogglePinStyle]);

  // D-323: 自定义字段统一纳入显隐管控（key = ext_<fieldKey>），过滤后再下发各视图
  const visibleCustomFields = useMemo(
    () => customFields.filter((f) => styleColumnSettings.visibleColumns[`ext_${f.fieldKey}`] !== false),
    [customFields, styleColumnSettings.visibleColumns],
  );
  const styleExtColumnOptions = useMemo(
    () => customFields.map((f) => ({ key: `ext_${f.fieldKey}`, label: f.label })),
    [customFields],
  );
  const styleMergedColumnOptions = useMemo(
    () => [...STYLE_LIST_COLUMNS, ...styleExtColumnOptions],
    [styleExtColumnOptions],
  );
  const styleColumnGroups = useMemo(() => [
    { title: '基本信息', keys: ['cover', 'styleNo', 'styleName', 'category', 'color', 'size', 'developmentSourceType'] },
    { title: '数量与交期', keys: ['sampleQuantity', 'deliveryDate', 'totalOrderQuantity', 'stockQuantity', 'createTime'] },
    { title: '开发进度', keys: ['progressNode', 'procurementProgress', 'patternCompletedTime', 'sampleCompletedTime'] },
  ], []);
  const styleColumnPresets = useMemo(() => [
    {
      key: 'simple', label: '精简',
      values: { cover: true, styleNo: true, styleName: true, color: true, size: true, progressNode: true, deliveryDate: true },
    },
    { key: 'standard', label: '标准', values: STYLE_LIST_DEFAULT_VISIBLE },
    { key: 'full', label: '完整', values: Object.fromEntries(STYLE_LIST_COLUMNS.map((c) => [c.key, true])) },
  ], []);

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
                onRefresh={() => fetchList()}
                onNavigateNew={() => navigate('/style-info/new')}
                openColumnSettings={() => setColumnSettingsOpen(true)}
              />
            }
          />
        }
      >
        {viewMode === 'list' ? (
          <StyleListView
            data={pinDisplayData}
            stockStateMap={stockStateMap}
            loading={loading}
            total={displayTotal}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onUnscrap={handleUnscrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            onRefresh={() => fetchList()}
            customFields={visibleCustomFields}
            orderedColumns={styleColumnSettings.orderedVisibleColumns}
            {...stylePinProps}
          />
        ) : viewMode === 'smart' ? (
          <StyleTableView
            data={pinDisplayData}
            stockStateMap={stockStateMap}
            loading={loading}
            total={displayTotal}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onUnscrap={handleUnscrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            categoryOptions={categoryOptions}
            onRefresh={() => fetchList()}
            focusedStyleId={focusedStyleId}
            dateSortAsc={dateSortAsc}
            customFields={visibleCustomFields}
            {...stylePinProps}
          />
        ) : (
          <StyleCardView
            data={pinDisplayData}
            stockStateMap={stockStateMap}
            loading={loading}
            total={displayTotal}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onUnscrap={handleUnscrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            onRefresh={() => fetchList()}
            focusedStyleId={focusedStyleId}
            customFields={visibleCustomFields}
            {...stylePinProps}
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
      <ColumnSettingsDrawer
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
        columnOptions={styleMergedColumnOptions}
        visibleColumns={styleColumnSettings.visibleColumns}
        onToggle={(key, visible) => styleColumnSettings.setVisible(key, visible)}
        onReset={styleColumnSettings.reset}
        title="显示字段"
        groups={styleColumnGroups}
        presets={styleColumnPresets}
        onApplyPreset={styleColumnSettings.applyValues}
      />
    </>
  );
};

export default StyleInfoListPage;
