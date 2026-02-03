import React from 'react';
import { Button, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
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
    goToWarehousingDetail,
    isOrderFrozenById,
    previewOpen,
    previewUrl,
    previewTitle,
    setPreviewOpen,
    setPreviewUrl,
    setPreviewTitle,
  } = hook;

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">质检入库</h2>
          </div>

          <SearchForm
            queryParams={queryParams}
            setQueryParams={setQueryParams}
            onSearch={fetchWarehousingList}
            extra={(
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
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
            onViewDetail={goToWarehousingDetail}
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
