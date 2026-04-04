import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Input } from 'antd';
import { AppstoreOutlined, RadarChartOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import PageStatCards from '@/components/common/PageStatCards';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import dayjs from 'dayjs';

// Hooks
import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';
import { useStyleViewMode } from './hooks/useStyleViewMode';

// Components
import StyleFilterPanel from './components/StyleFilterPanel';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import StyleStatsCard from './components/StyleStatsCard';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { STYLE_INFO_LIST_REFRESH_KEY } from '@/modules/warehouse/pages/SampleInventory';
import { savePageSize } from '@/utils/pageSizeStore';

import '../StyleInfo/styles.css';

type StyleSmartFilter = 'all' | 'overdue' | 'warning';

/**
 * 款式信息列表页
 * 独立列表页面，路由: /style-info
 */
const StyleInfoListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  useCardGridLayout(10);

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
    developmentStats,
    statsLoading,
    loadDevelopmentStats
  } = useStyleStats();

  const { handleScrap, confirmScrap, cancelScrap, pendingScrapId, scrapLoading, handleToggleTop: _handleToggleTop, handlePrint: _handlePrint } = useStyleActions(fetchList);

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
  const [pendingFocusStyleId, setPendingFocusStyleId] = useState<string | null>(null);
  const [focusedStyleId, setFocusedStyleId] = useState<string | null>(null);
  const focusClearTimerRef = useRef<number | null>(null);

  // 初始化加载
  useEffect(() => {
    fetchList();
    loadDevelopmentStats(statsRangeType);
    loadCategoryOptions();
  }, []);

  // queryParams 变化时重新加载
  useEffect(() => {
    fetchList();
  }, [queryParams.page, queryParams.pageSize, queryParams.styleNo, queryParams.styleName, queryParams.progressNode]);

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

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchList, loadDevelopmentStats, statsRangeType]);

  useEffect(() => {
    const loadStockState = async () => {
      const styleNos = Array.from(new Set(
        data
          .map((item) => String(item.styleNo || '').trim())
          .filter(Boolean)
      ));
      if (!styleNos.length) {
        setStockStateMap({});
        return;
      }

      try {
        const results = await Promise.all(styleNos.map(async (styleNo) => {
          const res = await api.get('/stock/sample/list', {
            params: {
              page: 1,
              pageSize: 50,
              styleNo,
              sampleType: 'development',
              recordStatus: 'active',
            },
          });
          return { styleNo, records: (res as any)?.data?.records || [] };
        }));

        const nextMap: Record<string, boolean> = {};
        results.forEach(({ styleNo, records }) => {
          records.forEach((item: any) => {
            const key = `${String(styleNo || '').trim().toUpperCase()}|${String(item?.color || '').trim().toUpperCase()}`;
            if (key !== '|') {
              nextMap[key] = true;
            }
          });
        });
        setStockStateMap(nextMap);
      } catch {
        setStockStateMap({});
      }
    };

    void loadStockState();
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

  // 统计时间范围切换
  const handleStatsRangeChange = (value: string | number) => {
    const rangeType = value as 'day' | 'week' | 'month' | 'year';
    setStatsRangeType(rangeType);
    loadDevelopmentStats(rangeType);
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
        const _patternStatus = String(record?.patternStatus ?? '').trim().toUpperCase();
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
    } catch (e: any) {
      message.error(e?.message || '维护失败');
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
      return progressNode !== '样衣完成' && progressNode !== '开发样报废' && sampleStatus !== 'COMPLETED';
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
    setPendingFocusStyleId(getStyleDomKey(records[0]));
  }, [getStyleDomKey, smartFilter]);

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
    <Layout>
      <Card className="page-card">
        {/* 页面头部 */}
        <div className="page-header">
          <h2 className="page-title">样衣开发与生产</h2>
        </div>

        {/* 开发费用统计看板 */}
        <StyleStatsCard
          stats={developmentStats}
          loading={statsLoading}
          rangeType={statsRangeType}
          onRangeChange={handleStatsRangeChange}
        />

        <PageStatCards
          cards={[]}
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
          ]}
          onClearHints={smartFilter !== 'all' ? () => {
            setSmartFilter('all');
            setPendingFocusStyleId(null);
            setFocusedStyleId(null);
          } : undefined}
        />

        {/* 筛选面板 */}
        <StickyFilterBar>
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
            </>
          )}
        />
        </StickyFilterBar>

        {/* 列表/卡片视图 */}
        {viewMode === 'smart' ? (
          <StyleTableView
            data={data}
            stockStateMap={stockStateMap}
            loading={loading}
            total={total}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            categoryOptions={categoryOptions}
            onRefresh={fetchList}
            focusedStyleId={focusedStyleId}
          />
        ) : (
          <StyleCardView
            data={data}
            stockStateMap={stockStateMap}
            loading={loading}
            total={total}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            focusedStyleId={focusedStyleId}
          />
        )}
      </Card>

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
        color={printingRecord?.color}
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
    </Layout>
  );
};

export default StyleInfoListPage;
