import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Checkbox, Form, Input, Modal, Tabs } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import { useStyleDetail } from './hooks/useStyleDetail';
import { useStyleFormActions } from './hooks/useStyleFormActions';
import { useStyleColorSize } from './hooks/useStyleColorSize';
import { useStyleProduction } from './hooks/useStyleProduction';
import { useStylePushOrder } from './hooks/useStylePushOrder';
import StyleBasicInfoForm from './components/StyleBasicInfoForm';
import StyleActionButtons from './components/StyleActionButtons';

import StyleBomTab from './components/StyleBomTab';
import StyleQuotationTab from './components/StyleQuotationTab';
import StyleAttachmentTab from './components/StyleAttachmentTab';
import StylePatternTab from './components/StylePatternTab';
import StyleProcessTab from './components/StyleProcessTab';
import StyleProductionTab from './components/StyleProductionTab';
import StyleSecondaryProcessTab from './components/StyleSecondaryProcessTab';
import StyleIntelligenceProfileCard from './components/StyleIntelligenceProfileCard';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

import './styles.css';

const StyleInfoDetailPage: React.FC = () => {
  const params = useParams();
  const location = window.location;
  const isNewPath = location.pathname.endsWith('/new');
  const styleIdParam = isNewPath ? 'new' : (params.id as string | undefined);
  const { message: _message } = App.useApp();

  const {
    loading: _loading,
    currentStyle,
    setCurrentStyle,
    form,
    activeTabKey,
    setActiveTabKey,
    editLocked,
    setEditLocked,
    isNewPage,
    isDetailPage,
    fetchDetail,
    resetForm: _resetForm,
  } = useStyleDetail(styleIdParam);

  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const colorSize = useStyleColorSize({ currentStyle, setCurrentStyle, isNewPage, form });

  const {
    saving,
    completingSample,
    pushingToOrder,
    handleSave,
    handleCompleteSample,
    handlePushToOrder: handlePushToOrderDirect,
    handleUnlock,
    handleBackToList: _handleBackToList,
  } = useStyleFormActions({
    form,
    currentStyle,
    setCurrentStyle,
    fetchDetail,
    setEditLocked,
    isNewPage,
    sizeColorConfig: colorSize.sizeColorConfig,
    pendingImages: colorSize.pendingImages,
    pendingColorImages: colorSize.pendingColorImages,
  });

  const production = useStyleProduction({
    currentStyle,
    fetchDetail,
    styleIdParam,
    reportSmartError,
  });

  const pushOrder = useStylePushOrder({
    handlePushToOrderDirect,
    reportSmartError,
    showSmartErrorNotice,
    setSmartError,
  });

  const isFieldLocked = (_fieldValue: any) => {
    return editLocked && Boolean(currentStyle?.id);
  };

  if (!isDetailPage && !isNewPage) {
    return null;
  }

  return (
    <>
      <PageLayout>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { if (styleIdParam) void fetchDetail(styleIdParam); }} />
          </Card>
        ) : null}
        <StyleIntelligenceProfileCard style={currentStyle} />
        <Card
          title="样衣详情"
          style={{ marginBottom: 24 }}
          extra={
            <StyleActionButtons
              saving={saving}
              completingSample={completingSample}
              pushingToOrder={pushingToOrder}
              editLocked={editLocked}
              isNewPage={isNewPage}
              sampleCompleted={currentStyle?.sampleStatus === 'COMPLETED'}
              hasProcessData={Boolean((currentStyle as any)?.processCompletedTime)}
              pushedToOrder={Boolean((currentStyle as any)?.pushedToOrder)}
              onSave={handleSave}
              onCompleteSample={handleCompleteSample}
              onPushToOrder={pushOrder.handlePushToOrder}
              onUnlock={handleUnlock}
            />
          }
        >
          <Form layout="horizontal" form={form} labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
            <StyleBasicInfoForm
              _form={form}
              currentStyle={currentStyle}
              editLocked={editLocked}
              isNewPage={isNewPage}
              isFieldLocked={isFieldLocked}
              pendingImages={colorSize.pendingImages}
              onPendingImagesChange={colorSize.setPendingImages}
              coverRefreshToken={colorSize.coverRefreshToken}
              onCoverChange={colorSize.handleCoverChange}
              size1={colorSize.size1}
              setSize1={colorSize.setSize1}
              size2={colorSize.size2}
              setSize2={colorSize.setSize2}
              size3={colorSize.size3}
              setSize3={colorSize.setSize3}
              size4={colorSize.size4}
              setSize4={colorSize.setSize4}
              size5={colorSize.size5}
              setSize5={colorSize.setSize5}
              color1={colorSize.color1}
              setColor1={colorSize.setColor1}
              color2={colorSize.color2}
              setColor2={colorSize.setColor2}
              color3={colorSize.color3}
              setColor3={colorSize.setColor3}
              color4={colorSize.color4}
              setColor4={colorSize.setColor4}
              color5={colorSize.color5}
              setColor5={colorSize.setColor5}
              qty1={colorSize.qty1}
              setQty1={colorSize.setQty1}
              qty2={colorSize.qty2}
              setQty2={colorSize.setQty2}
              qty3={colorSize.qty3}
              setQty3={colorSize.setQty3}
              qty4={colorSize.qty4}
              setQty4={colorSize.setQty4}
              qty5={colorSize.qty5}
              setQty5={colorSize.setQty5}
              sizeOptions={colorSize.matrixSizes}
              setSizeOptions={colorSize.setMatrixSizes}
              colorOptions={colorSize.matrixColors}
              setColorOptions={colorSize.setMatrixColors}
              sizeColorMatrixRows={colorSize.sizeColorMatrixRows}
              setSizeColorMatrixRows={colorSize.setSizeColorMatrixRows}
              onColorImageSync={colorSize.handleColorImageSync}
              onColorImageClear={colorSize.handleColorImageClear}
              commonSizes={colorSize.commonSizes}
              setCommonSizes={colorSize.setCommonSizes}
              commonColors={colorSize.commonColors}
              setCommonColors={colorSize.setCommonColors}
            />
          </Form>
        </Card>

        <Card style={{ marginTop: 24 }}>
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={[
              {
                key: '2',
                label: 'BOM清单',
                disabled: !currentStyle?.id,
                children: (
                  <StyleBomTab
                    styleId={currentStyle?.id ?? ''}
                    sizeColorConfig={colorSize.sizeColorConfig}
                    readOnly={Boolean((currentStyle as any)?.bomCompletedTime)}
                    bomAssignee={(currentStyle as any)?.bomAssignee}
                    bomStartTime={(currentStyle as any)?.bomStartTime}
                    bomCompletedTime={(currentStyle as any)?.bomCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '5',
                label: '纸样开发',
                disabled: !currentStyle?.id,
                children: (
                  <StylePatternTab
                    styleId={currentStyle?.id ?? ''}
                    sizeColorConfig={colorSize.sizeColorConfig}
                    readOnly={Boolean((currentStyle as any)?.patternCompletedTime)}
                    patternAssignee={(currentStyle as any)?.patternAssignee}
                    patternStartTime={(currentStyle as any)?.patternStartTime}
                    patternCompletedTime={(currentStyle as any)?.patternCompletedTime}
                    patternStatus={currentStyle?.patternStatus}
                    sizeAssignee={(currentStyle as any)?.sizeAssignee}
                    sizeStartTime={(currentStyle as any)?.sizeStartTime}
                    sizeCompletedTime={(currentStyle as any)?.sizeCompletedTime}
                    linkedSizes={colorSize.matrixSizes}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '8',
                label: '生产制单',
                disabled: !currentStyle?.id,
                children: (
                  <StyleProductionTab
                    styleId={currentStyle?.id ?? ''}
                    styleNo={currentStyle?.styleNo ?? ''}
                    productionReqRows={production.productionReqRows}
                    productionReqRowCount={production.productionReqRowCount}
                    productionReqLocked={Boolean((currentStyle as any)?.productionCompletedTime)}
                    productionReqEditable={production.productionReqEditable}
                    productionReqSaving={production.productionSaving}
                    productionReqRollbackSaving={production.productionRollbackSaving}
                    onProductionReqChange={production.updateProductionReqRow}
                    onProductionReqSave={production.handleSaveProduction}
                    onProductionReqReset={production.resetProductionReqFromCurrent}
                    onProductionReqRollback={production.handleRollbackProductionReq}
                    productionReqCanRollback
                    productionAssignee={(currentStyle as any)?.productionAssignee}
                    productionStartTime={(currentStyle as any)?.productionStartTime}
                    productionCompletedTime={(currentStyle as any)?.productionCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                    sampleCompleted={(currentStyle as any)?.sampleStatus === 'COMPLETED'}
                    sampleReviewStatus={(currentStyle as any)?.sampleReviewStatus}
                    sampleReviewComment={(currentStyle as any)?.sampleReviewComment}
                    sampleReviewer={(currentStyle as any)?.sampleReviewer}
                    sampleReviewTime={(currentStyle as any)?.sampleReviewTime}
                    completedTime={(currentStyle as any)?.completedTime}
                    styleName={(currentStyle as any)?.styleName}
                    color={(currentStyle as any)?.color}
                    size={(currentStyle as any)?.size}
                    sampleQuantity={(currentStyle as any)?.sampleQuantity}
                  />
                )
              },
              {
                key: '9',
                label: '二次工艺',
                disabled: !currentStyle?.id,
                children: (
                  <StyleSecondaryProcessTab
                    styleId={currentStyle?.id ?? ''}
                    styleNo={currentStyle?.styleNo ?? ''}
                    readOnly={Boolean((currentStyle as any)?.secondaryCompletedTime)}
                    secondaryAssignee={(currentStyle as any)?.secondaryAssignee}
                    secondaryStartTime={(currentStyle as any)?.secondaryStartTime}
                    secondaryCompletedTime={(currentStyle as any)?.secondaryCompletedTime}
                    sampleQuantity={(currentStyle as any)?.sampleQuantity}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '7',
                label: '工序单价',
                disabled: !currentStyle?.id,
                children: (
                  <StyleProcessTab
                    styleId={currentStyle?.id ?? ''}
                    styleNo={currentStyle?.styleNo ?? ''}
                    readOnly={Boolean((currentStyle as any)?.processCompletedTime)}
                    processAssignee={(currentStyle as any)?.processAssignee}
                    processStartTime={(currentStyle as any)?.processStartTime}
                    processCompletedTime={(currentStyle as any)?.processCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '3',
                label: '报价单',
                disabled: !currentStyle?.id,
                children: <StyleQuotationTab styleId={currentStyle?.id ?? ''} styleNo={currentStyle?.styleNo ?? ''} totalQty={colorSize.totalMatrixQty} />
              },
              {
                key: '4',
                label: '附件文件',
                disabled: !currentStyle?.id,
                children: <StyleAttachmentTab styleId={currentStyle?.id ?? ''} styleNo={currentStyle?.styleNo ?? ''} />
              }
            ]}
          />
        </Card>
      </PageLayout>

      <Modal
        title="推送到下单管理"
        open={pushOrder.pushToOrderModalVisible}
        onOk={pushOrder.submitPushToOrder}
        onCancel={() => {
          pushOrder.setPushToOrderModalVisible(false);
          pushOrder.pushToOrderForm.resetFields();
        }}
        confirmLoading={pushOrder.pushToOrderSaving}
        width="40vw"
        forceRender
      >
        <Form form={pushOrder.pushToOrderForm} layout="vertical">
          <Form.Item label="同步目标（勾选才会过去）">
            <Checkbox.Group
              value={pushOrder.pushToOrderTargets}
              onChange={(values) => pushOrder.setPushToOrderTargets(values.map((v) => String(v)))}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <Checkbox value="pattern">纸样开发</Checkbox>
                <Checkbox value="size">尺寸表</Checkbox>
                <Checkbox value="bom">BOM清单</Checkbox>
                <Checkbox value="process">工序单价</Checkbox>
                <Checkbox value="production">生产制单</Checkbox>
                <Checkbox value="secondary">二次工艺</Checkbox>
              </div>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} placeholder="选填：推送备注" />
          </Form.Item>
        </Form>
      </Modal>

    </>
  );
};

export default StyleInfoDetailPage;
