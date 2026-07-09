import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Drawer, Tag } from 'antd';

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
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import InspectionDetail from '../pages/InspectionDetail';
import { useViewport } from '@/utils/useViewport';

interface WarehousingListProps {
  hook: ReturnType<typeof useProductWarehousing>;
}

const WarehousingList: React.FC<WarehousingListProps> = ({ hook }) => {
  const navigate = useNavigate();
  const { isMobile } = useViewport();

  const [inspectDrawerVisible, setInspectDrawerVisible] = useState(false);
  const [inspectDrawerOrderId, setInspectDrawerOrderId] = useState('');
  const [inspectDrawerTab, setInspectDrawerTab] = useState('records');

  const openInspectDrawer = useCallback((orderId: string, tab?: string) => {
    setInspectDrawerOrderId(orderId);
    setInspectDrawerTab(tab || 'records');
    setInspectDrawerVisible(true);
  }, []);

  const {
    loading,
    warehousingList: _warehousingList,
    sortedWarehousingList,
    total,
    smartError,
    showSmartErrorNotice,
    queryParams,
    setQueryParams,
    fetchWarehousingList,
    openDialog: _openDialog,
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
    showAllWarehousing,
    setShowAllWarehousing,
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
      render: (cover: string, record: PendingBundleRow) => (
        <StyleCoverThumb 
          src={cover || null} 
          styleNo={record.styleNo} 
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={40} 
        />
      ),
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
            onClick: () => openInspectDrawer(record.orderId, 'records'),
          });
        } else if (statusFilter === 'pendingWarehouse') {
          actions.push({
            key: 'warehousing',
            label: '入库',
            primary: true,
            onClick: () => openInspectDrawer(record.orderId, 'warehousing'),
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
    unqualified: '不合格',
    completed: '已完成',
  };

  return (
    <>
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">质检入库</h2>
          </div>

          {showSmartErrorNotice && smartError ? (
            <Card style={{ marginBottom: 12 }}>
              <SmartErrorNotice
                error={smartError}
                onFix={() => {
                  void fetchWarehousingList();
                }}
              />
            </Card>
          ) : null}

          {/* 统计卡片（可点击筛选） */}
          <PageStatCards
            activeKey={statusFilter}
            cards={[
              {
                key: 'pendingQc',
                items: { label: '待质检', value: warehousingStats.pendingQcBundles, unit: '个菲号', color: 'var(--color-warning)' },
                onClick: () => handleStatusFilterChange(statusFilter === 'pendingQc' ? 'all' : 'pendingQc'),
                activeColor: 'var(--color-warning)',
              },
              {
                key: 'pendingPackaging',
                items: { label: '待包装', value: warehousingStats.pendingPackagingBundles ?? 0, unit: '个菲号', color: 'var(--color-accent-purple)' },
                onClick: () => handleStatusFilterChange(statusFilter === 'pendingPackaging' ? 'all' : 'pendingPackaging'),
                activeColor: 'var(--color-accent-purple)',
              },
              {
                key: 'pendingWarehouse',
                items: { label: '待入库', value: warehousingStats.pendingWarehouseBundles, unit: '个菲号', color: 'var(--color-primary)' },
                onClick: () => handleStatusFilterChange(statusFilter === 'pendingWarehouse' ? 'all' : 'pendingWarehouse'),
                activeColor: 'var(--color-primary)',
              },
              {
                key: 'unqualified',
                items: { label: '不合格', value: warehousingStats.unqualifiedCount, unit: '条', color: 'var(--color-danger)' },
                onClick: () => handleStatusFilterChange(statusFilter === 'unqualified' ? 'all' : 'unqualified'),
                activeColor: 'var(--color-danger)',
              },
              {
                key: 'completed',
                items: [
                  { label: '已完成', value: warehousingStats.totalOrders, unit: '个订单', color: 'var(--color-success)' },
                ],
                onClick: () => handleStatusFilterChange(statusFilter === 'completed' ? 'all' : 'completed'),
                activeColor: 'var(--color-success)',
              },
            ]}
            extraRight={
              <button
                type="button"
                onClick={() => setShowAllWarehousing(v => !v)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  border: '1px solid var(--color-border-antd)',
                  background: 'var(--color-bg-base)',
                  color: !showAllWarehousing ? 'var(--color-text-secondary)' : 'var(--color-primary)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                }}
              >
                {showAllWarehousing ? '只看进行中' : '显示全部'}
              </button>
            }
          />

          {/* 筛选栏：始终渲染，pending模式下关键词仅做客户端过滤 */}
          <SearchForm
            queryParams={queryParams}
            setQueryParams={setQueryParams}
            onSearch={statusFilter === 'all' || statusFilter === 'completed' || statusFilter === 'unqualified' ? fetchWarehousingList : () => {}}
          />

          {/* 根据筛选状态显示不同内容 */}
          {statusFilter === 'all' || statusFilter === 'completed' || statusFilter === 'unqualified' ? (
            <WarehousingTable
              loading={loading}
              dataSource={sortedWarehousingList}
              total={total}
              queryParams={queryParams}
              setQueryParams={setQueryParams}
              isOrderFrozen={isOrderFrozenById}
              onOpenInspect={openInspectDrawer}
            />
          ) : (
            <>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Tag color={statusFilter === 'pendingQc' ? 'warning' : statusFilter === 'pendingPackaging' ? 'purple' : 'processing'}>
                  {statusFilterLabels[statusFilter]} · {(() => {
                    const kw = (queryParams.warehousingNo || '').toLowerCase().trim();
                    return kw
                      ? pendingBundles.filter(b =>
                          b.orderNo?.toLowerCase().includes(kw) ||
                          b.styleNo?.toLowerCase().includes(kw) ||
                          String(b.bundleNo ?? '').includes(kw) ||
                          b.color?.toLowerCase().includes(kw)
                        ).length
                      : pendingBundles.length;
                  })()} 个菲号
                </Tag>
                <Button onClick={() => handleStatusFilterChange('all')}>
                  返回全部
                </Button>
              </div>
              <ResizableTable
                storageKey="warehousing-list"
                rowKey="bundleId"
                columns={pendingColumns}
                emptyDescription="暂无入库数据"
                dataSource={(() => {
                  const kw = (queryParams.warehousingNo || '').toLowerCase().trim();
                  return kw
                    ? pendingBundles.filter(b =>
                        b.orderNo?.toLowerCase().includes(kw) ||
                        b.styleNo?.toLowerCase().includes(kw) ||
                        String(b.bundleNo ?? '').includes(kw) ||
                        b.color?.toLowerCase().includes(kw)
                      )
                    : pendingBundles;
                })()}
                loading={pendingBundlesLoading}
               
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
        onSuccess={() => { fetchWarehousingList(); closeDialog(); }}
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

      <Drawer
        title="质检入库详情"
        open={inspectDrawerVisible}
        onClose={() => setInspectDrawerVisible(false)}
        size="large"
        destroyOnHidden
        styles={{ wrapper: { width: '85vw' }, body: { padding: 0 } }}
      >
        {inspectDrawerVisible && (
          <InspectionDetail
            orderId={inspectDrawerOrderId}
            defaultTab={inspectDrawerTab}
            embedded
            onClose={() => setInspectDrawerVisible(false)}
          />
        )}
      </Drawer>
    </>
  );
};

export default WarehousingList;
