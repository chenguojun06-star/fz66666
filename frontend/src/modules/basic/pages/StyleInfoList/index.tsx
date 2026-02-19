import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Modal } from 'antd';
import { PlusOutlined, AppstoreOutlined, UnorderedListOutlined, ReloadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import StylePrintModal from '@/components/common/StylePrintModal';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';

// Hooks
import { useStyleList, useStyleStats } from '../StyleInfo/hooks';
import { useStyleActions } from './hooks/useStyleActions';

// Components
import StyleFilterPanel from './components/StyleFilterPanel';
import StyleStatsCard from './components/StyleStatsCard';
import StyleTableView from './components/StyleTableView';
import StyleCardView from './components/StyleCardView';

import '../StyleInfo/styles.css';

/**
 * 款式信息列表页
 * 独立列表页面，路由: /style-info
 */
const StyleInfoListPage: React.FC = () => {
  const { message, modal: _antdModal } = App.useApp();
  const navigate = useNavigate();

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

  const { handleDelete, handleToggleTop: _handleToggleTop, handlePrint: _handlePrint } = useStyleActions(fetchList);

  // 视图模式
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  // 打印功能状态
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

  // 维护功能状态
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceRecord, setMaintenanceRecord] = useState<StyleInfo | null>(null);
  const [maintenanceReason, setMaintenanceReason] = useState('');

  // 字典选项
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [_seasonOptions, _setSeasonOptions] = useState<{ label: string; value: string }[]>([]);

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

  // 加载品类选项（硬编码，不依赖API）
  const loadCategoryOptions = () => {
    setCategoryOptions([
      { label: '女装', value: 'WOMAN' },
      { label: '男装', value: 'MAN' },
      { label: '童装', value: 'KIDS' }
    ]);
  };

  // 统计时间范围切换
  const handleStatsRangeChange = (value: string | number) => {
    const rangeType = value as 'day' | 'week' | 'month';
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
                onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
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
            onDelete={handleDelete}
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
            onDelete={handleDelete}
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
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>
            维护说明：将重置 <strong>{maintenanceRecord?.styleNo}</strong> 的完成状态，允许再次修改和提交
          </div>
          <textarea
            placeholder="请输入维护原因（必填）"
            value={maintenanceReason}
            onChange={(e) => setMaintenanceReason(e.target.value)}
            style={{
              width: '100%',
              minHeight: 100,
              padding: 8,
              border: '1px solid #d9d9d9',

              resize: 'vertical',
            }}
          />
        </div>
      </Modal>
    </Layout>
  );
};

export default StyleInfoListPage;
