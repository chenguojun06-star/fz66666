import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App, Button, Input } from 'antd';
import { AppstoreOutlined, ArrowUpOutlined, ArrowDownOutlined, RadarChartOutlined, SettingOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import PageStatCards from '@/components/common/PageStatCards';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';
import { useSync } from '@/utils/syncManager';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import { getStyleCardSizeText, getStyleCardColorText, getStyleCardQuantityText } from '@/utils/cardSizeQuantity';
import dayjs from 'dayjs';

// Hooks
import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';
import { useStyleViewMode } from './hooks/useStyleViewMode';

// Components
import StyleFilterPanel from './components/StyleFilterPanel';
import StyleStatsCard from './components/StyleStatsCard';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';
import StyleCostDetailDrawer from './components/StyleCostDetailDrawer';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { STYLE_INFO_LIST_REFRESH_KEY } from '@/modules/warehouse/pages/SampleInventory';
import { savePageSize } from '@/utils/pageSizeStore';
import { useFieldConfig } from '@/hooks/useFieldConfig';

import { isScrappedStyle } from './components/styleTableViewUtils';
import '../StyleInfo/styles.css';

type StyleSmartFilter = 'all' | 'overdue' | 'warning';

/**
 * 款式信息列表页
 * 独立列表页面，路由: /style-info
 */
const StyleInfoListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
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

  // 打印功能状态
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

  // 维护功能状态
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceRecord, setMaintenanceRecord] = useState<StyleInfo | null>(null);
  const [maintenanceReason, setMaintenanceReason] = useState('');

  // 字典选项（品类，用于表格展示代码转标签）
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [stockStateMap, setStockStateMap] = useState<Record<string, boolean>>({});
  const [smartFilter, setSmartFilter] = useState<StyleSmartFilter>('all');
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [pendingFocusStyleId, setPendingFocusStyleId] = useState<string | null>(null);
  const [focusedStyleId, setFocusedStyleId] = useState<string | null>(null);
  const [dateSortAsc, setDateSortAsc] = useState(false);
  const focusClearTimerRef = useRef<number | null>(null);

  // 延期环节跳转带来的精确款式 ID 筛选（来自 /dashboard/delayed-stage-breakdown）
  const [focusStyleIds, setFocusStyleIds] = useState<Set<string>>(new Set());

  // 从 URL 读取 styleIds 参数（延期环节跳转携带）
  // ⚠️ 必须监听 location.search 变化，否则同页面 navigate 只改 URL 不触发重渲染
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleIdsParam = (params.get('styleIds') || '').trim();
    if (styleIdsParam) {
      const ids = styleIdsParam.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 0) setFocusStyleIds(new Set(ids));
    } else {
      setFocusStyleIds(new Set());
    }
  }, [location.search]);

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
  }, [smartFilter]);

  // 初始化加载
  useEffect(() => {
    fetchList();
    loadDevelopmentStats(statsRangeType);
    loadCategoryOptions();
    loadStyleStats();
  }, [fetchList, loadDevelopmentStats, statsRangeType]);

  // 顶部统计卡片数据（总数/开发中/已完成/已延期）
  const [styleStats, setStyleStats] = useState<{ totalStyles: number; developingStyles: number; completedStyles: number; delayedStyles: number }>({ totalStyles: 0, developingStyles: 0, completedStyles: 0, delayedStyles: 0 });
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'developing' | 'completed' | 'delayed'>('developing');
  const loadStyleStats = useCallback(async () => {
    try {
      const res: any = await api.get('/style/info/stats');
      if (res.code === 200 && res.data) {
        setStyleStats({
          totalStyles: Number(res.data.totalStyles || 0),
          developingStyles: Number(res.data.developingStyles || 0),
          completedStyles: Number(res.data.completedStyles || 0),
          delayedStyles: Number(res.data.delayedStyles || 0),
        });
      }
    } catch {
      // 静默失败，不影响列表加载
    }
  }, []);

  // queryParams 变化时重新加载
  useEffect(() => {
    fetchList();
  }, [fetchList, queryParams.page, queryParams.pageSize, queryParams.styleNo, queryParams.styleName, queryParams.progressNode]);

  useEffect(() => {
    const refreshIfNeeded = () => {
      if (!localStorage.getItem(STYLE_INFO_LIST_REFRESH_KEY)) return;
      localStorage.removeItem(STYLE_INFO_LIST_REFRESH_KEY);
      fetchList();
      loadDevelopmentStats(statsRangeType);
    };

    refreshIfNeeded();
    const handleFocus = () => refreshIfNeeded();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshIfNeeded();
    };

    // 监听订单进度变更事件，实时刷新款式列表（500ms 防抖）
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleProgressChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchList();
        loadDevelopmentStats(statsRangeType);
      }, 500);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('order:progress:changed', handleProgressChange);
    window.addEventListener('data:changed', handleProgressChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('order:progress:changed', handleProgressChange);
      window.removeEventListener('data:changed', handleProgressChange);
    };
  }, [fetchList, loadDevelopmentStats, statsRangeType]);

  // 90s 轮询兜底（页面可见时才轮询，避免后台浪费资源）
  useSync(
    'style-info-list-poll',
    async () => {
      await fetchList();
      return null;
    },
    () => {},
    { interval: 90000, pauseOnHidden: true }
  );

  const stockStateLoadedRef = useRef('');

  useEffect(() => {
    const styleNos = Array.from(new Set(
      data
        .map((item) => String(item.styleNo || '').trim())
        .filter(Boolean)
    ));
    if (!styleNos.length) {
      setStockStateMap({});
      return;
    }

    const loadKey = styleNos.sort().join(',');
    if (stockStateLoadedRef.current === loadKey) return;
    stockStateLoadedRef.current = loadKey;

    let cancelled = false;

    const loadStockState = async () => {
      try {
        const BATCH_SIZE = 5;
        const nextMap: Record<string, boolean> = {};

        for (let i = 0; i < styleNos.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const batch = styleNos.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(async (styleNo) => {
            const res = await api.get('/stock/sample/list', {
              params: {
                page: 1,
                pageSize: 50,
                styleNo,
                sampleType: 'development',
                recordStatus: 'active',
              },
            });
            return { styleNo, records: res?.data?.records || [] };
          }));

          for (const { styleNo, records } of results) {
            for (const item of records) {
              const key = `${String(styleNo || '').trim().toUpperCase()}|${String(item?.color || '').trim().toUpperCase()}`;
              if (key !== '|') {
                nextMap[key] = true;
              }
            }
          }
        }

        if (!cancelled) setStockStateMap(nextMap);
      } catch {
        if (!cancelled) setStockStateMap({});
      }
    };

    void loadStockState();
    return () => { cancelled = true; };
  }, [data]);

  // 加载品类选项（从字典API动态加载，用于表格代码转标签）
  const loadCategoryOptions = async () => {
    try {
      const res = await api.get<{ code: number; data: { records?: { dictCode: string; dictLabel: string }[] } }>(        '/system/dict/list', { params: { dictType: 'category', page: 1, pageSize: 100 } }
      );
      if (res.code === 200) {
        const records = (res.data as any)?.records || [];
        if (records.length) {
          setCategoryOptions(records.map((r: any) => ({ label: r.dictLabel, value: r.dictCode })));
          return;
        }
      }
    } catch (_) { /* 静默失败 */ }
    // 默认备用
    setCategoryOptions([
      { label: '女装', value: 'WOMAN' }, { label: '男装', value: 'MAN' },
      { label: '童装', value: 'KIDS' }, { label: '女童装', value: 'WCMAN' },
      { label: '男女同款', value: 'UNISEX' },
    ]);
  };

  // 打印处理
  const handlePrintClick = (record: StyleInfo) => {
    setPrintingRecord(record);
    setPrintModalVisible(true);
  };

  // 维护功能
  const openMaintenance = (record: StyleInfo) => {
    setMaintenanceRecord(record);
    setMaintenanceReason('');
    setMaintenanceOpen(true);
  };

  const closeMaintenance = () => {
    setMaintenanceOpen(false);
    setMaintenanceSaving(false);
    setMaintenanceRecord(null);
    setMaintenanceReason('');
  };

  const submitMaintenance = async () => {
    const record = maintenanceRecord as any;
    if (!record?.id) {
      closeMaintenance();
      return;
    }

    const node = String(record?.progressNode || '').trim();
    const sampleStatus = String(record?.sampleStatus ?? '').trim().toUpperCase();
    const reviewStatus = String(record?.sampleReviewStatus ?? '').trim().toUpperCase();
    const latestPatternStatus = String(record?.latestPatternStatus ?? '').trim().toUpperCase();
    const styleFullyCompleted = ['PASS', 'APPROVED'].includes(reviewStatus) && latestPatternStatus === 'COMPLETED';
    if (!styleFullyCompleted) {
      message.error('只有款式全部完成后，再次修改才算维护');
      closeMaintenance();
      return;
    }
    const remark = String(maintenanceReason || '').trim();
    if (!remark) {
      message.error('请输入维护原因');
      return;
    }

    const stage = node === '样衣完成' || sampleStatus === 'COMPLETED' ? 'sample' : 'pattern';

    setMaintenanceSaving(true);
    try {
      const res = await api.post(`/style/info/${record.id}/stage-action?stage=${stage}&action=reset`, { reason: remark });
      if (res.code === 200) {
        message.success('维护成功');
        closeMaintenance();
        fetchList();
      } else {
        message.error(res.message || '维护失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '维护失败');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const activeStyles = useMemo(() => {
    return data.filter((item) => {
      const status = String(item.status || '').trim().toLowerCase();
      if (status === 'archived' || status === 'scrapped') return false;
      const progressNode = String(item.progressNode || '').trim();
      const sampleStatus = String(item.sampleStatus || '').trim().toUpperCase();
      // 样衣完成唯一判定：sampleStatus=COMPLETED（后端 completeSample 前置校验通过后才会设置）
      // 审核通过（PASS/APPROVED）不算完成，因为还需要入库环节
      // PRODUCTION_COMPLETED 也不算完成，只是样板制作完成
      if (progressNode === '样衣完成' || progressNode === '开发样报废') return false;
      if (sampleStatus === 'COMPLETED') return false;
      return true;
    });
  }, [data]);

  const overdueStyles = useMemo(() => {
    return activeStyles.filter((item) => {
      if (!item.deliveryDate) return false;
      return dayjs(item.deliveryDate).endOf('day').isBefore(dayjs());
    });
  }, [activeStyles]);

  const warningStyles = useMemo(() => {
    return activeStyles.filter((item) => {
      if (!item.deliveryDate) return false;
      const diffDays = dayjs(item.deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
      return diffDays >= 0 && diffDays <= 3;
    });
  }, [activeStyles]);

  const overdueStyleCount = useMemo(() => {
    return overdueStyles.length;
  }, [overdueStyles]);

  const warningStyleCount = useMemo(() => {
    return warningStyles.length;
  }, [warningStyles]);

  const displayData = useMemo(() => {
    let base = smartFilter === 'overdue' ? overdueStyles
             : smartFilter === 'warning' ? warningStyles
             : showAllStyles ? data
             : activeStyles;
    if (focusStyleIds.size > 0) {
      base = base.filter(s => focusStyleIds.has(String(s.id)));
    }
    if (base.length > 1) {
      base = [...base].sort((a, b) => {
        const aScrapped = isScrappedStyle(a) ? 1 : 0;
        const bScrapped = isScrappedStyle(b) ? 1 : 0;
        if (aScrapped !== bScrapped) return aScrapped - bScrapped;
        const aTime = new Date((a.updateTime || a.createTime || 0) as string | number).getTime();
        const bTime = new Date((b.updateTime || b.createTime || 0) as string | number).getTime();
        return dateSortAsc ? aTime - bTime : bTime - aTime;
      });
    }
    return base;
  }, [smartFilter, data, activeStyles, overdueStyles, warningStyles, dateSortAsc, focusStyleIds, showAllStyles]);

  const displayTotal = smartFilter !== 'all' || !showAllStyles ? displayData.length : total;

  const getStyleDomKey = useCallback((record: Partial<StyleInfo> | null | undefined) => {
    return String(record?.id || record?.styleNo || '').trim();
  }, []);

  const scrollToFocusedStyle = useCallback((styleId: string) => {
    const safeId = styleId.replace(/"/g, '\\"');
    const selector = viewMode === 'smart'
      ? `#style-smart-row-${safeId}`
      : `#style-card-${safeId}`;
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedStyleId(styleId);
    if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    focusClearTimerRef.current = window.setTimeout(() => setFocusedStyleId(null), 2200);
    return true;
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingFocusStyleId) return;
    const timer = window.setTimeout(() => {
      if (scrollToFocusedStyle(pendingFocusStyleId)) {
        setPendingFocusStyleId(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pendingFocusStyleId, scrollToFocusedStyle, viewMode, data]);

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
  }, [getStyleDomKey, smartFilter, setQueryParams]);

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
      <StylePrintModal
        visible={printModalVisible}
        onClose={() => {
          setPrintModalVisible(false);
          setPrintingRecord(null);
        }}
        styleId={printingRecord?.id}
        styleNo={printingRecord?.styleNo}
        styleName={printingRecord?.styleName}
        cover={printingRecord?.cover}
        color={printingRecord ? getStyleCardColorText(printingRecord) : undefined}
        sizes={printingRecord ? getStyleCardSizeText(printingRecord) : undefined}
        quantity={printingRecord ? Number(getStyleCardQuantityText(printingRecord) || '0') || undefined : undefined}
        category={printingRecord?.category}
        season={printingRecord?.season}
        sizeColorConfig={(printingRecord as any)?.sizeColorConfig}
      />

      {/* 维护原因弹窗 */}
      <SmallModal
        title="款式维护"
        open={maintenanceOpen}
        onCancel={closeMaintenance}
        onOk={submitMaintenance}
        confirmLoading={maintenanceSaving}
        okText="确定"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>
            维护说明：将重置 <strong>{maintenanceRecord?.styleNo}</strong> 的完成状态，允许再次修改和提交
          </div>
          <Input.TextArea
            id="maintenance-reason"
            name="maintenanceReason"
            placeholder="请输入维护原因（必填）"
            value={maintenanceReason}
            onChange={(e) => setMaintenanceReason(e.target.value)}
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
      </SmallModal>

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
