import React from 'react';
import { Card, Spin, Button, Tabs, Alert, Drawer } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { CheckCircleOutlined } from '@ant-design/icons';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import BatchUnqualifiedModal from '../../components/WarehousingModal/BatchUnqualifiedModal';
import InspectFormPanel from './InspectFormPanel';
import AiQualityHelperCard from './AiQualityHelperCard';
import OrderLinesTable from './OrderLinesTable';
import QcRecordsPanel from './QcRecordsPanel';
import WarehousingActionPanel from './WarehousingActionPanel';
import ProductionSheetPanel from './ProductionSheetPanel';
import StyleInfoCard from './StyleInfoCard';
import InspectionHeader from './InspectionHeader';
import { BOM_COLUMNS } from './constants';
import { useInspectionDetail } from './useInspectionDetail';
import type { InspectionDetailProps, QualityBriefingData } from './types';

export type { InspectionDetailProps, QualityBriefingData };

const InspectionDetail: React.FC<InspectionDetailProps> = (props) => {
  const {
    loading,
    briefing,
    activeTab,
    setActiveTab,
    recordsLoading,
    qcRecords,
    aiSuggestion,
    aiLoading,
    orderDetail,
    orderDetailLoading,
    formHook,
    submitLoading,
    batchSelectedSummary,
    unqualifiedImageUrls,
    setUnqualifiedImageUrls,
    handleBatchUnqualifiedSubmit,
    orderLineWarehousingRows,
    qcStats,
    actualDefectSet,
    warehousingLoading,
    showWarehousingModal,
    setShowWarehousingModal,
    markingRepairBundleId,
    batchUnqualifiedModalOpen,
    setBatchUnqualifiedModalOpen,
    handleWarehouseSubmit,
    handleMarkRepaired,
    handleBack,
    highlightWhNo,
    autoInitDone,
  } = useInspectionDetail(props);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Spin size="large" spinning tip="加载中..."><div /></Spin>
    </div>
  );
  if (!briefing) return (
    <Card>
      <Alert type="error" title="无法加载质检简报数据" showIcon />
      <Button type="link" onClick={handleBack}>返回质检入库列表</Button>
    </Card>
  );

  const { order, style, bom } = briefing;
  const styleId = orderDetail?.styleId || (order as any)?.styleId;
  const plateTypeKey = String((order as any)?.plateType || '').trim().toUpperCase();
  const urgencyKey = String((order as any)?.urgencyLevel || '').trim().toLowerCase();

  const tabItems = [
    {
      key: 'records',
      label: '质检记录',
      children: (
        <QcRecordsPanel
          qcRecords={qcRecords}
          qcStats={qcStats}
          recordsLoading={recordsLoading}
          highlightWhNo={highlightWhNo}
        />
      ),
    },
    {
      key: 'orderLines',
      label: '入库进度',
      children: <OrderLinesTable rows={orderLineWarehousingRows} loading={orderDetailLoading} />,
    },
    {
      key: 'bom',
      label: 'BOM物料',
      children: (
        <ResizableTable
          storageKey="inspection-bom-table"
          rowKey="id" pagination={false}
          emptyDescription="暂无物料数据"
          scroll={{ x: 650 }} dataSource={bom}
          columns={BOM_COLUMNS}
        />
      ),
    },
    {
      key: 'sizeChart',
      label: '尺寸表',
      children: (
        <div style={{ padding: '8px 0' }}>
          {styleId ? (
            <StyleSizeTab styleId={styleId} readOnly simpleView />
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)' }}>
              暂无尺寸表数据
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'productionSheet',
      label: '生产制单',
      children: (
        <ProductionSheetPanel
          description={style?.description || ''}
          reviewStatus={style?.sampleReviewStatus}
          reviewComment={style?.sampleReviewComment}
          reviewer={style?.sampleReviewer}
          reviewTime={style?.sampleReviewTime}
        />
      ),
    },
  ];

  return (
    <>
      <InspectionHeader
        order={order}
        plateTypeKey={plateTypeKey}
        urgencyKey={urgencyKey}
        qcStatsCount={qcStats.count}
        pendingWarehouse={qcStats.pendingWarehouse}
        onBack={handleBack}
        onWarehouse={() => setShowWarehousingModal(true)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 'calc(100vh - 200px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <StyleInfoCard order={order} style={style} />
          <AiQualityHelperCard
            aiSuggestion={aiSuggestion}
            aiLoading={aiLoading}
            actualDefectSet={actualDefectSet}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto', maxWidth: '100%' }}>
          <Card style={{ overflow: 'hidden' }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              style={{ width: '100%' }}
              items={tabItems}
            />
          </Card>

          <Card title={<><CheckCircleOutlined style={{ marginRight: 6 }} />质检操作</>}>
            {formHook.batchSelectRows.length > 0 && formHook.batchSelectableQrs.length === 0 && qcStats.pendingWarehouse === 0 && qcStats.count > 0 ? (
              <Alert type="success" showIcon
                title="该订单所有菲号已完成质检入库，无需再操作"
                description="如需返修重检，请在质检记录中标记返修后重新操作" />
            ) : (
              <InspectFormPanel
                formHook={formHook}
                handleMarkRepaired={handleMarkRepaired}
                markingRepairBundleId={markingRepairBundleId}
                onOpenBatchUnqualified={() => setBatchUnqualifiedModalOpen(true)}
                autoInitDone={autoInitDone}
              />
            )}
          </Card>
        </div>
      </div>

      <Drawer
        title="入库操作"
        open={showWarehousingModal}
        onClose={() => setShowWarehousingModal(false)}
        size="large"
        styles={{ wrapper: { width: '80%' }, body: { padding: 16 } }}
      >
        <WarehousingActionPanel
          qcRecords={qcRecords}
          warehousingLoading={warehousingLoading}
          onSubmit={handleWarehouseSubmit}
        />
      </Drawer>

      <BatchUnqualifiedModal
        open={batchUnqualifiedModalOpen}
        totalQty={batchSelectedSummary?.totalQty || 0}
        submitLoading={submitLoading}
        unqualifiedImageUrls={unqualifiedImageUrls}
        onCancel={() => setBatchUnqualifiedModalOpen(false)}
        onOk={handleBatchUnqualifiedSubmit}
        onImageUrlsChange={setUnqualifiedImageUrls}
      />
    </>
  );
};

export default InspectionDetail;
