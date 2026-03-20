import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Input, Modal } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import SmartPredictionStrip from '@/components/common/SmartPredictionStrip';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import dayjs from 'dayjs';

// Hooks
import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';

// Components
import StyleFilterPanel from './components/StyleFilterPanel';
import StyleStatsCard from './components/StyleStatsCard';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';

import '../StyleInfo/styles.css';

/**
 * 款式信息列表页
 * 独立列表页面，路由: /style-info
 */
const StyleInfoListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { pageSize: cardPageSize } = useCardGridLayout(10);

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
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
    const saved = localStorage.getItem('viewMode_styleInfoList');
    return saved === 'card' ? 'card' : 'list';
  });

  useEffect(() => {
    if (viewMode === 'card') {
      setQueryParams((prev) => (
        prev.pageSize === cardPageSize ? prev : { ...prev, page: 1, pageSize: cardPageSize }
      ));
    }
  }, [viewMode, cardPageSize, setQueryParams]);

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
    const patternStatus = String(record?.patternStatus ?? '').trim().toUpperCase();
    const url =
      node === '样衣完成' || sampleStatus === 'COMPLETED'
        ? `/style/info/${record.id}/sample/reset`
        : node === '纸样完成' || patternStatus === 'COMPLETED'
          ? `/style/info/${record.id}/pattern/reset`
          : null;

    if (!url) {
      message.error('当前状态无需维护');
      closeMaintenance();
      return;
    }

    const remark = String(maintenanceReason || '').trim();
    if (!remark) {
      message.error('请输入维护原因');
      return;
    }

    setMaintenanceSaving(true);
    try {
      const res = await api.post(url, { reason: remark });
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

  const overdueStyleCount = useMemo(() => {
    return activeStyles.filter((item) => {
      if (!item.deliveryDate) return false;
      return dayjs(item.deliveryDate).endOf('day').isBefore(dayjs());
    }).length;
  }, [activeStyles]);

  const warningStyleCount = useMemo(() => {
    return activeStyles.filter((item) => {
      if (!item.deliveryDate) return false;
      const diffDays = dayjs(item.deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
      return diffDays >= 0 && diffDays <= 3;
    }).length;
  }, [activeStyles]);

  // 分页处理
  const handlePageChange = (page: number, pageSize: number) => {
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
          <h2 className="page-title">样衣开发</h2>
        </div>

        {/* 开发费用统计看板 */}
        <StyleStatsCard
          stats={developmentStats}
          loading={statsLoading}
          rangeType={statsRangeType}
          onRangeChange={handleStatsRangeChange}
        />

        <SmartPredictionStrip
          items={[
            { key: 'overdue', count: overdueStyleCount, tone: 'danger', label: '个样衣开发已延期' },
            { key: 'warning', count: warningStyleCount, tone: 'warning', label: '个样衣开发即将超期' },
          ]}
        />

        {/* 筛选面板 */}
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
                icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                onClick={() => {
                  const next = viewMode === 'list' ? 'card' : 'list';
                  setViewMode(next);
                  localStorage.setItem('viewMode_styleInfoList', next);
                  if (next === 'card') {
                    setQueryParams((prev) => ({ ...prev, page: 1, pageSize: cardPageSize }));
                  }
                }}
              >
                {viewMode === 'list' ? '卡片视图' : '列表视图'}
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

        {/* 列表/卡片视图 */}
        {viewMode === 'list' ? (
          <StyleTableView
            data={data}
            loading={loading}
            total={total}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
            categoryOptions={categoryOptions}
          />
        ) : (
          <StyleCardView
            data={data}
            loading={loading}
            total={total}
            pageSize={queryParams.pageSize}
            currentPage={queryParams.page}
            onPageChange={handlePageChange}
            onScrap={handleScrap}
            onPrint={handlePrintClick}
            onMaintenance={openMaintenance}
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
      <Modal
        title="款式维护"
        open={maintenanceOpen}
        onCancel={closeMaintenance}
        onOk={submitMaintenance}
        confirmLoading={maintenanceSaving}
        okText="确定"
        cancelText="取消"
        width="30vw"
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
      </Modal>

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
