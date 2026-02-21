import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Tag, Space, Image } from 'antd';
import { CheckCircleOutlined, InboxOutlined, EyeOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import SearchForm from './SearchForm';
import WarehousingTable from './WarehousingTable';
import WarehousingModal from './WarehousingModal';
import ImagePreviewModal from '@/components/common/ImagePreviewModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { useProductWarehousing } from '../hooks/useProductWarehousing';
import type { StatusFilter, PendingBundleRow } from '../hooks/useProductWarehousing';

interface WarehousingListProps {
  hook: ReturnType<typeof useProductWarehousing>;
}

const WarehousingList: React.FC<WarehousingListProps> = ({ hook }) => {
  const navigate = useNavigate();
  const {
    loading,
    warehousingList,
    total,
    queryParams,
    setQueryParams,
    fetchWarehousingList,
    openDialog,
    closeDialog,
    visible,
    currentWarehousing,
    isOrderFrozenById,
    previewOpen,
    previewUrl,
    previewTitle,
    setPreviewOpen,
    setPreviewUrl,
    setPreviewTitle,
    warehousingStats,
    statusFilter,
    handleStatusFilterChange,
    pendingBundles,
    pendingBundlesLoading,
    navigateToInspect,
  } = hook;

  // 待处理菲号表格列定义
  const pendingColumns = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 60,
      render: (cover: string) => <StyleCoverThumb src={cover} size={40} />,
    },
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', width: 120, ellipsis: true },
    { title: '菲号', dataIndex: 'bundleNo', key: 'bundleNo', width: 70 },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70 },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: PendingBundleRow) => {
        const actions: RowAction[] = [];
        if (statusFilter === 'pendingQc') {
          actions.push({
            key: 'inspect',
            label: '质检查货',
            primary: true,
            onClick: () => navigateToInspect(record.orderId, record.bundleId),
          });
        } else if (statusFilter === 'pendingWarehouse') {
          actions.push({
            key: 'warehousing',
            label: '入库',
            primary: true,
            onClick: () => {
              navigate(`/production/warehousing/inspect/${record.orderId}?tab=warehousing`);
            },
          });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  const statusFilterLabels: Record<StatusFilter, string> = {
    all: '全部',
    pendingQc: '待质检',
    pendingPackaging: '待包装',
    pendingWarehouse: '待入库',
    completed: '已完成',
  };

  return (
    <Layout>
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">质检入库</h2>
          </div>

          {/* 统计卡片（可点击筛选） */}
          <PageStatCards
            activeKey={statusFilter}
            cards={[
              {
                key: 'pendingQc',
                items: { label: '待质检', value: warehousingStats.pendingQcBundles, unit: '个菲号', color: 'var(--color-warning)' },
                onClick: () => handleStatusFilterChange(statusFilter === 'pendingQc' ? 'all' : 'pendingQc'),
                activeColor: 'var(--color-warning)',
                activeBg: '#fff7e6',
              },
              {
                key: 'pendingPackaging',
                items: { label: '待包装', value: warehousingStats.pendingPackagingBundles ?? 0, unit: '个菲号', color: '#722ed1' },
                onClick: () => handleStatusFilterChange(statusFilter === 'pendingPackaging' ? 'all' : 'pendingPackaging'),
                activeColor: '#722ed1',
                activeBg: '#f9f0ff',
              },
              {
                key: 'pendingWarehouse',
                items: { label: '待入库', value: warehousingStats.pendingWarehouseBundles, unit: '个菲号', color: 'var(--color-primary)' },
                onClick: () => handleStatusFilterChange(statusFilter === 'pendingWarehouse' ? 'all' : 'pendingWarehouse'),
                activeColor: '#2D7FF9',
                activeBg: '#e6f4ff',
              },
              {
                key: 'completed',
                items: [
                  { label: '完成总数', value: warehousingStats.totalOrders, unit: '个订单', color: 'var(--color-primary)' },
                  { label: '总数量', value: warehousingStats.totalQuantity, color: 'var(--color-success)' },
                ],
                onClick: () => handleStatusFilterChange(statusFilter === 'completed' ? 'all' : 'completed'),
                activeColor: 'var(--color-success)',
                activeBg: '#f6ffed',
              },
            ]}
          />

          {/* 根据筛选状态显示不同内容 */}
          {statusFilter === 'all' || statusFilter === 'completed' ? (
            <>
              <SearchForm
                queryParams={queryParams}
                setQueryParams={setQueryParams}
                onSearch={fetchWarehousingList}
              />
              <WarehousingTable
                loading={loading}
                dataSource={warehousingList}
                total={total}
                queryParams={queryParams}
                setQueryParams={setQueryParams}
                isOrderFrozen={isOrderFrozenById}
              />
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Tag color={statusFilter === 'pendingQc' ? 'warning' : statusFilter === 'pendingPackaging' ? 'purple' : 'processing'}>
                  {statusFilterLabels[statusFilter]} · {pendingBundles.length} 个菲号
                </Tag>
                <Button size="small" onClick={() => handleStatusFilterChange('all')}>
                  返回全部
                </Button>
              </div>
              <ResizableTable
                storageKey="warehousing-list"
                rowKey="bundleId"
                columns={pendingColumns}
                dataSource={pendingBundles}
                loading={pendingBundlesLoading}
                size="small"
                pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条`, showSizeChanger: false }}
              />
            </>
          )}
        </Card>

      {/* New/Edit Modal */}
      <WarehousingModal
        visible={visible}
        currentWarehousing={currentWarehousing}
        onCancel={closeDialog}
        onSuccess={fetchWarehousingList}
        openPreview={(url, title) => {
          setPreviewUrl(url);
          setPreviewTitle(title);
          setPreviewOpen(true);
        }}
      />

      <ImagePreviewModal
        open={previewOpen}
        imageUrl={previewUrl}
        title={previewTitle}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewUrl('');
          setPreviewTitle('');
        }}
      />
    </Layout>
  );
};

export default WarehousingList;
