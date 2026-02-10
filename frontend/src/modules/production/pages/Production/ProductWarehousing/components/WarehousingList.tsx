import React from 'react';
import { Button, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import SearchForm from './SearchForm';
import WarehousingTable from './WarehousingTable';
import WarehousingModal from './WarehousingModal';
import SimpleWarehousingModal from './SimpleWarehousingModal';
import IndependentDetailModal from './IndependentDetailModal';
import ImagePreviewModal from '@/components/common/ImagePreviewModal';
import { useProductWarehousing } from '../hooks/useProductWarehousing';

interface WarehousingListProps {
  hook: ReturnType<typeof useProductWarehousing>;
}

const WarehousingList: React.FC<WarehousingListProps> = ({ hook }) => {
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
    warehousingModalOpen,
    warehousingModalLoading,
    warehousingModalOrderNo,
    warehousingModalWarehousingNo,
    warehousingModalWarehouse,
    setWarehousingModalWarehouse,
    closeWarehousingModal,
    submitWarehousing,
    openWarehousingModal,
    openIndependentDetailPopup,
    closeIndependentDetailPopup,
    independentDetailOpen,
    independentDetailWarehousingNo,
    independentDetailSummary,
    isOrderFrozenById,
    previewOpen,
    previewUrl,
    previewTitle,
    setPreviewOpen,
    setPreviewUrl,
    setPreviewTitle,
    warehousingStats,
  } = hook;

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">质检入库</h2>
          </div>

          {/* 统计卡片 */}
          <PageStatCards
            cards={[
              {
                key: 'pendingQc',
                items: { label: '待质检', value: warehousingStats.pendingQcBundles, unit: '个菲号', color: 'var(--color-warning)' },
              },
              {
                key: 'pendingWarehouse',
                items: { label: '待入库', value: warehousingStats.pendingWarehouseBundles, unit: '个菲号', color: 'var(--color-primary)' },
              },
              {
                key: 'total',
                items: [
                  { label: '完成总数', value: warehousingStats.totalOrders, unit: '个订单', color: 'var(--color-primary)' },
                  { label: '总数量', value: warehousingStats.totalQuantity, color: 'var(--color-success)' },
                ],
              },
              {
                key: 'today',
                items: [
                  { label: '今日完成', value: warehousingStats.todayOrders, unit: '个订单', color: 'var(--color-success)' },
                  { label: '数量', value: warehousingStats.todayQuantity, color: 'var(--color-success)' },
                ],
              },
            ]}
          />

          <SearchForm
            queryParams={queryParams}
            setQueryParams={setQueryParams}
            onSearch={fetchWarehousingList}
            extra={(
              <Button type="primary" onClick={() => openDialog()}>
                新增质检
              </Button>
            )}
          />

          <WarehousingTable
            loading={loading}
            dataSource={warehousingList}
            total={total}
            queryParams={queryParams}
            setQueryParams={setQueryParams}
            onOpenIndependentDetail={openIndependentDetailPopup}
            onWarehousing={openWarehousingModal}
            isOrderFrozen={isOrderFrozenById}
          />
        </Card>
      </div>

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

      {/* Simple Warehousing Modal */}
      <SimpleWarehousingModal
        open={warehousingModalOpen}
        loading={warehousingModalLoading}
        orderNo={warehousingModalOrderNo}
        warehousingNo={warehousingModalWarehousingNo}
        warehouse={warehousingModalWarehouse}
        styleNo={hook.warehousingModalStyleNo}
        color={hook.warehousingModalColor}
        size={hook.warehousingModalSize}
        quantity={hook.warehousingModalQuantity}
        onClose={closeWarehousingModal}
        onSubmit={submitWarehousing}
        setWarehouse={setWarehousingModalWarehouse}
      />

      {/* Independent Detail Modal */}
      <IndependentDetailModal
        open={independentDetailOpen}
        warehousingNo={independentDetailWarehousingNo}
        summary={independentDetailSummary}
        onClose={closeIndependentDetailPopup}
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
