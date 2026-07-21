import React from 'react';
import { Alert, Button, Space, Tag, Tooltip } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import '../../../styles.css';
import { useOrderFlowData } from './useOrderFlowData';
import FlowStepRenderer from './components/FlowStepRenderer';
import OrderBasicInfoCard from './components/OrderBasicInfoCard';
import { useEditMode } from './hooks/useEditMode';
import { useSkuMatrixEdit } from './hooks/useSkuMatrixEdit';
import { useRemarkCount } from './hooks/useRemarkCount';

const OrderFlow: React.FC = () => {
  const {
    query, loading, data, order, isFactoryUser,
    smartError, showSmartErrorNotice, fetchFlow,
    enrichedStages, stageColumns, orderLines, orderLineColumns,
    warehousingTotal, warehousingQualified, warehousingUnqualified,
    cuttingSizeItems, cuttingBundles, cuttingTasks, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
  } = useOrderFlowData();

  const orderNoForImage = query.orderNo || (order as any)?.orderNo || '';
  const coverUrl = (order as any)?.styleCover || null;

  const {
    editing, savingField,
    handleStartEdit, handleFinishEdit, handleCancelEdit, handleFieldSave,
  } = useEditMode({ orderNoForImage, order, fetchFlow });

  const {
    skuEditMap, setSkuEditMap, savingMatrix, colorSizeMatrixModel,
    handleMatrixSave, handleMatrixClearAll, handleMatrixAutoGen, handleSkuAutoToggle,
  } = useSkuMatrixEdit({ order, orderLines, editing, fetchFlow });

  const { remarkOpen, setRemarkOpen, remarkCount } = useRemarkCount(orderNoForImage);

  return (
    <>
        <PageLayout
          title="订单全流程记录"
          titleExtra={
            <Space wrap>
              {query.orderNo ? <Tag>订单号：{query.orderNo}</Tag> : null}
              {query.styleNo ? <Tag>款号：{query.styleNo}</Tag> : null}
              {editing ? (
                <>
                  <Tooltip title="完成编辑并刷新数据">
                    <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleFinishEdit}>
                      完成编辑
                    </Button>
                  </Tooltip>
                  <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
                </>
              ) : (
                <Button size="small" icon={<EditOutlined />} onClick={handleStartEdit}>编辑</Button>
              )}
              <Button onClick={fetchFlow} loading={loading}>刷新数据</Button>
            </Space>
          }
          headerContent={
            <>
              {showSmartErrorNotice && smartError ? (
                <div style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={fetchFlow} /></div>
              ) : null}
              {!query.orderId ? (
                <Alert type="warning" showIcon title="缺少订单ID，无法打开全流程记录"
                  description="请从我的订单列表点击订单号进入。" />
              ) : null}
            </>
          }
        >

          <OrderBasicInfoCard
            loading={loading}
            order={order}
            orderNoForImage={orderNoForImage}
            coverUrl={coverUrl}
            editing={editing}
            orderLines={orderLines}
            colorSizeMatrixModel={colorSizeMatrixModel}
            skuEditMap={skuEditMap}
            setSkuEditMap={setSkuEditMap}
            savingMatrix={savingMatrix}
            handleMatrixSave={handleMatrixSave}
            handleMatrixClearAll={handleMatrixClearAll}
            handleMatrixAutoGen={handleMatrixAutoGen}
            handleSkuAutoToggle={handleSkuAutoToggle}
            handleFieldSave={handleFieldSave}
            savingField={savingField}
            warehousingTotal={warehousingTotal}
            warehousingQualified={warehousingQualified}
            warehousingUnqualified={warehousingUnqualified}
            remarkCount={remarkCount}
            onOpenRemark={() => setRemarkOpen(true)}
          />

          <FlowStepRenderer
            loading={loading} data={data} order={order} isFactoryUser={isFactoryUser}
            enrichedStages={enrichedStages} stageColumns={stageColumns}
            orderLines={orderLines} orderLineColumns={orderLineColumns}
            cuttingSizeItems={cuttingSizeItems ?? []}
            cuttingBundles={cuttingBundles ?? []}
            cuttingTasks={cuttingTasks ?? []}
            styleProcessDescriptionMap={styleProcessDescriptionMap}
            secondaryProcessDescriptionMap={secondaryProcessDescriptionMap ?? new Map<string, string>()}
            editing={editing}
            onStartEdit={handleStartEdit}
            onFinishEdit={handleFinishEdit}
            onCancelEdit={handleCancelEdit}
            onRefresh={fetchFlow}
          />
        </PageLayout>
        <RemarkTimelineModal
          open={remarkOpen}
          onClose={() => setRemarkOpen(false)}
          targetType="order"
          targetNo={orderNoForImage}
        />
    </>
  );
};

export default OrderFlow;
