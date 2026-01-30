import React from 'react';
import { Button, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import SearchForm from './SearchForm';
import WarehousingTable from './WarehousingTable';
import WarehousingModal from './WarehousingModal';
import SimpleWarehousingModal from './SimpleWarehousingModal';
import IndependentDetailModal from './IndependentDetailModal';
import ResizableModal from '@/components/common/ResizableModal';
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
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
                新增质检
              </Button>
            </Space>
          </div>

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

      {/* Image Preview Modal */}
      <ResizableModal
        open={previewOpen}
        title={previewTitle}
        footer={
          <div className="modal-footer-actions">
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setPreviewUrl('');
                setPreviewTitle('');
              }}
            >
              关闭
            </Button>
          </div>
        }
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewUrl('');
          setPreviewTitle('');
        }}
        width={600}
        minWidth={600}
        minHeight={600}
        initialHeight={600}
      >
        {previewUrl ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img
              src={previewUrl}
              alt=""
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        ) : null}
      </ResizableModal>
    </Layout>
  );
};

export default WarehousingList;
