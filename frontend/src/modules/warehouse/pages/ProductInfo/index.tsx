import React from 'react';
import { Button, Input, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import { useViewport } from '@/utils/useViewport';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { StyleInfo } from '@/types/style';
import { useProductInfoData } from './hooks/useProductInfoData';
import { buildColumns } from './columns';
import EditModal from './components/EditModal';
import DetailDrawer from './components/DetailDrawer';

const ProductInfoPage: React.FC = () => {
  const { isMobile } = useViewport();
  const {
    loading,
    data,
    total,
    queryParams,
    setQueryParams,
    handlePageChange,
    modalOpen,
    editingItem,
    submitLoading,
    coverUrl,
    form,
    setModalOpen,
    setCoverUrl,
    openCreate,
    openEdit,
    handleSubmit,
    drawerOpen,
    drawerRecord,
    drawerLoading,
    skuList,
    skuLoading,
    closeDrawer,
    openDrawer,
    handleToggleStatus,
    handleInbound,
    handlePrintTag,
    localKeyword,
    handleKeywordChange,
    statCards,
  } = useProductInfoData();

  const columns = buildColumns({
    openDrawer,
    openEdit,
    handleInbound,
    handlePrintTag,
  });

  return (
    <>
      <PageLayout
        title="成品资料"
        headerContent={
          <PageStatCards
            cards={statCards}
            activeKey={queryParams.status || 'all'}
          />
        }
        filterLeft={
          <Space wrap>
            <Input
              placeholder="搜索款号/款名/SKC"
              allowClear
              style={{ width: 240 }}
              value={localKeyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
              onPressEnter={() => setQueryParams((p) => ({ ...p, page: 1 }))}
            />
            <Button
              onClick={() => setQueryParams((p) => ({ ...p, page: 1 }))}
            >
              搜索
            </Button>
            <Select
              placeholder="品类"
              allowClear
              style={{ width: 100 }}
              value={queryParams.category || undefined}
              onChange={(v) => setQueryParams((p) => ({ ...p, category: v || '', page: 1 }))}
              options={CATEGORY_CODE_OPTIONS}
            />
            <Select
              placeholder="季节"
              allowClear
              style={{ width: 90 }}
              value={queryParams.season || undefined}
              onChange={(v) => setQueryParams((p) => ({ ...p, season: v || '', page: 1 }))}
              options={SEASON_CODE_OPTIONS}
            />
          </Space>
        }
        filterRight={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增
          </Button>
        }
      >
        <ResizableTable<StyleInfo>
          columns={columns}
          dataSource={data}
          rowKey={(r) => String(r?.id || '')}
          loading={loading}
          stickyHeader
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
          emptyDescription="暂无款式数据"
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showTotal: (t) => `共 ${t} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            onChange: handlePageChange,
            size: isMobile ? 'small' : 'default',
          }}
        />
      </PageLayout>

      <DetailDrawer
        open={drawerOpen}
        drawerRecord={drawerRecord}
        drawerLoading={drawerLoading}
        skuList={skuList}
        skuLoading={skuLoading}
        onClose={closeDrawer}
        onEdit={openEdit}
        onInbound={handleInbound}
        onPrintTag={handlePrintTag}
        onToggleStatus={handleToggleStatus}
      />

      <EditModal
        open={modalOpen}
        editingItem={editingItem}
        form={form}
        coverUrl={coverUrl}
        setCoverUrl={setCoverUrl}
        submitLoading={submitLoading}
        isMobile={isMobile}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  );
};

export default ProductInfoPage;
