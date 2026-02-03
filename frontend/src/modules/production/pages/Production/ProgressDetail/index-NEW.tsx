/**
 * ProgressDetail - 生产进度详情组件（精简版）
 * 功能：订单进度展示、扫码记录、裁剪扎号
 */
import React, { useState, useEffect } from 'react';
import { Segmented, Tabs, Pagination, Spin } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { ProductionOrder } from '@/types/production';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import { ProductionOrderHeader } from '@/components/StyleAssets';

// 导入 Hooks
import { useProgressData } from './hooks/useProgressData';
import { useProgressActions } from './hooks/useProgressActions';

// 导入组件
import OrderFilterPanel from './components/OrderFilterPanel';
import OrderProgressCard from './components/OrderProgressCard';
import ScanHistoryTable from './components/ScanHistoryTable';
import CuttingBundleTable from './components/CuttingBundleTable';
import ModernProgressBoard from './components/ModernProgressBoard';

interface ProgressDetailProps {
  embedded?: boolean;
}

const ProgressDetail: React.FC<ProgressDetailProps> = ({ embedded }) => {
  // Hooks
  const {
    loading,
    total,
    orders,
    activeOrder,
    scanHistory,
    cuttingBundles,
    cuttingBundlesLoading,
    queryParams,
    dateRange,
    progressNodesByStyleNo,
    setQueryParams,
    setDateRange,
    fetchOrders,
    openOrderDetail,
    setActiveOrder,
    handlePageChange,
  } = useProgressData();

  const {
    quickEditSaving,
    quickEdit,
  } = useProgressActions(() => {
    fetchOrders({ silent: true });
  });

  // 本地状态
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [detailOpen, setDetailOpen] = useState(false);
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditRecord, setQuickEditRecord] = useState<ProductionOrder | null>(null);

  // 初始加载
  useEffect(() => {
    fetchOrders();
  }, [queryParams]);

  // 处理函数
  const handleSearch = (filters: any) => {
    setQueryParams({ ...queryParams, ...filters, page: 1 });
  };

  const handleReset = () => {
    setQueryParams({ page: 1, pageSize: 10 });
  };

  const handleViewDetail = async (order: ProductionOrder) => {
    await openOrderDetail(order);
    setDetailOpen(true);
  };

  const handleQuickEdit = (order: ProductionOrder) => {
    setQuickEditRecord(order);
    setQuickEditVisible(true);
  };

  const handleQuickEditSave = async (values: any) => {
    if (quickEditRecord) {
      const success = await quickEdit(quickEditRecord, values);
      if (success) {
        setQuickEditVisible(false);
        setQuickEditRecord(null);
      }
    }
  };

  // 渲染内容
  const pageContent = (
    <div style={{ padding: embedded ? 0 : 24 }}>
      {/* 筛选面板 */}
      <OrderFilterPanel
        onSearch={handleSearch}
        onReset={handleReset}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />

      {/* 视图切换 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Segmented
          value={viewMode}
          onChange={(val) => setViewMode(val as 'list' | 'card')}
          options={[
            { label: '卡片', value: 'card', icon: <AppstoreOutlined /> },
            { label: '列表', value: 'list', icon: <UnorderedListOutlined /> },
          ]}
        />
      </div>

      {/* 订单列表 */}
      <Spin spinning={loading}>
        {viewMode === 'card' ? (
          <div>
            {orders.map((order) => (
              <OrderProgressCard
                key={order.id}
                order={order}
                onViewDetail={handleViewDetail}
                onQuickEdit={handleQuickEdit}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "var(--font-size-base)", color: 'var(--neutral-text-disabled)', textAlign: 'center', padding: 60 }}>
            列表视图待实现
          </div>
        )}
      </Spin>

      {/* 分页 */}
      {total > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Pagination
            current={queryParams.page}
            pageSize={queryParams.pageSize}
            total={total}
            onChange={handlePageChange}
            showSizeChanger
            showQuickJumper
            showTotal={(total) => `共 ${total} 条`}
          />
        </div>
      )}

      {/* 订单详情弹窗 */}
      <ResizableModal
        title={`订单详情 - ${activeOrder?.orderNo || ''}`}
        visible={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setActiveOrder(null);
        }}
        footer={null}
        defaultWidth="60vw"
        defaultHeight="60vh"
      >
        {activeOrder && (
          <div>
            {/* 订单头部信息 */}
            <ProductionOrderHeader order={activeOrder} />

            {/* Tab切换 */}
            <Tabs
              style={{ marginTop: 16 }}
              items={[
                {
                  key: 'progress',
                  label: '进度看板',
                  children: (
                    <ModernProgressBoard
                      order={activeOrder}
                      nodes={progressNodesByStyleNo[activeOrder.styleNo] || []}
                    />
                  ),
                },
                {
                  key: 'scan',
                  label: `扫码记录 (${scanHistory.length})`,
                  children: <ScanHistoryTable data={scanHistory} />,
                },
                {
                  key: 'bundles',
                  label: `裁剪扎号 (${cuttingBundles.length})`,
                  children: (
                    <CuttingBundleTable
                      data={cuttingBundles}
                      loading={cuttingBundlesLoading}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </ResizableModal>

      {/* 快速编辑弹窗 */}
      <QuickEditModal
        visible={quickEditVisible}
        loading={quickEditSaving}
        initialValues={{
          remarks: quickEditRecord?.remarks,
          expectedShipDate: quickEditRecord?.expectedShipDate,
        }}
        onSave={handleQuickEditSave}
        onCancel={() => {
          setQuickEditVisible(false);
          setQuickEditRecord(null);
        }}
      />
    </div>
  );

  if (embedded) return pageContent;

  return (
    <Layout
      title="生产进度详情"
      breadcrumb={[{ title: '生产管理' }, { title: '进度详情' }]}
    >
      {pageContent}
    </Layout>
  );
};

export default ProgressDetail;
