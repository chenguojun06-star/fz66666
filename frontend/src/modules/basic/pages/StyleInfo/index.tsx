import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Checkbox, Form, Input, Tabs } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import PageLayout from '@/components/common/PageLayout';
import { useStyleDetail } from './hooks/useStyleDetail';
import { useStyleFormActions } from './hooks/useStyleFormActions';
import { useStyleColorSize } from './hooks/useStyleColorSize';
import { useStyleProduction } from './hooks/useStyleProduction';
import { useStylePushOrder } from './hooks/useStylePushOrder';
import StyleBasicInfoForm, { type StyleBasicInfoFormRef } from './components/StyleBasicInfoForm';
import StyleActionButtons from './components/StyleActionButtons';

import StyleBomTab from './components/StyleBomTab';
import StyleQuotationTab from './components/StyleQuotationTab';
import StyleAttachmentTab from './components/StyleAttachmentTab';
import StylePatternTab from './components/StylePatternTab';
import StyleProcessTab from './components/StyleProcessTab';
import StyleProductionTab from './components/StyleProductionTab';
import StyleSecondaryProcessTab from './components/StyleSecondaryProcessTab';
import StyleSkuTab from './components/StyleSkuTab';
import StyleCuttingInfoTab from './components/StyleCuttingInfoTab';
import StyleWashLabelTab from './components/StyleWashLabelTab';
import StyleIntelligenceProfileCard from './components/StyleIntelligenceProfileCard';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { type StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';
import { useFormDraft } from '@/hooks/useFormDraft';

import './styles.css';

const StyleInfoDetailPage: React.FC = () => {
  const params = useParams();
  const location = window.location;
  const isNewPath = location.pathname.endsWith('/new');
  const styleIdParam = isNewPath ? 'new' : (params.id as string | undefined);
  const { message: _message, modal } = App.useApp();

  const {
    loading: _loading,
    currentStyle,
    setCurrentStyle,
    form,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    activeTabKey,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [bomAreaTabKey, setBomAreaTabKey] = useState('bom');
  const basicInfoFormRef = useRef<StyleBasicInfoFormRef | null>(null);

  const handleStyleParseResult = (result: StyleFieldParseResult) => {
    basicInfoFormRef.current?.applyStyleParseResult(result);
  };

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const colorSize = useStyleColorSize({ currentStyle, setCurrentStyle, isNewPage, form });

  const styleDraft = useFormDraft('style-create', { debounceMs: 300 });
  const [draftChecked, setDraftChecked] = useState(false);

  useEffect(() => {
    if (!isNewPage || draftChecked) return;

    const draftInfo = styleDraft.getDraftInfo();
    if (draftInfo.hasDraft) {
      modal.confirm({
        title: '发现未保存的草稿',
        content: (
          <div>
            <p>检测到您有未保存的款号草稿（{draftInfo.timeDescription}），是否恢复？</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 8 }}>
              选择"恢复草稿"将恢复之前未保存的款号内容，选择"新建款号"将清空草稿并重新开始。
            </p>
          </div>
        ),
        okText: '恢复草稿',
        cancelText: '新建款号',
        onOk: () => {
          const draftData = styleDraft.loadDraft() as {
            formValues?: Record<string, unknown>;
            sizeColorConfig?: Record<string, unknown>;
          } | null;
          if (draftData) {
            if (draftData.formValues) {
              form.setFieldsValue(draftData.formValues);
            }
            if (draftData.sizeColorConfig) {
              setCurrentStyle((prev) => prev ? {
                ...prev,
                sizeColorConfig: JSON.stringify(draftData.sizeColorConfig),
              } as any : null);
            }
          }
          setDraftChecked(true);
        },
        onCancel: () => {
          styleDraft.clearDraft();
          setDraftChecked(true);
        },
      });
    } else {
      setDraftChecked(true);
    }
  }, [isNewPage, draftChecked, styleDraft, form, modal, setCurrentStyle]);

  useEffect(() => {
    if (!isNewPage || !draftChecked) return;
    const allValues = form.getFieldsValue(true);
    styleDraft.saveDraftDebounced({
      formValues: allValues,
      sizeColorConfig: colorSize.sizeColorConfig,
    });
  }, [form, colorSize.sizeColorConfig, isNewPage, draftChecked, styleDraft]);

  const {
    saving,
    completingSample,
    pushingToOrder,
    handleSave: _handleSave,
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

  const handleSave = async () => {
    const success = await _handleSave();
    if (success && isNewPage) {
      styleDraft.clearDraft();
    }
    return success;
  };

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

  const handleSkcClick = () => {
    setBomAreaTabKey('sku');
  };

  if (!isDetailPage && !isNewPage) {
    return null;
  }

  return (
    <>
      <PageLayout>
        {showSmartErrorNotice && smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { if (styleIdParam) void fetchDetail(styleIdParam); }} />
          </Card>
        ) : null}
        <StyleIntelligenceProfileCard style={currentStyle} />
        {/* 样衣详情 - 基础信息卡片 */}
        <Card
          title={
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>样衣详情</span>
          }
          style={{ marginBottom: 16, borderRadius: 10 }}
          bodyStyle={{ padding: 20 }}
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
          <Form layout="horizontal" form={form} labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
            <StyleBasicInfoForm
              _form={form}
              currentStyle={currentStyle}
              editLocked={editLocked}
              isNewPage={isNewPage}
              isFieldLocked={isFieldLocked}
              onSkcClick={handleSkcClick}
              pendingImages={colorSize.pendingImages}
              onPendingImagesChange={colorSize.setPendingImages}
              coverRefreshToken={colorSize.coverRefreshToken}
              onCoverChange={colorSize.handleCoverChange}
              forwardedRef={basicInfoFormRef}
              onStyleParseResult={handleStyleParseResult}
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

        {/* 业务流程区 —— 按业务流程分区展示 BOM / 报价单 / 其他信息 */}
        <div style={{ marginTop: 4 }}>
          <Tabs
            activeKey={bomAreaTabKey}
            onChange={setBomAreaTabKey}
            size="small"
            tabBarStyle={{
              background: 'var(--color-bg-base)',
              padding: '0 12px',
              borderRadius: '10px 10px 0 0',
              border: '1px solid var(--color-border)',
              margin: 0,
            }}
            items={[
              { key: 'bom', label: 'BOM清单 · 工艺 · 生产', children: (
                <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  <StyleBomTab
                    styleId={currentStyle?.id ?? ''}
                    sizeColorConfig={colorSize.sizeColorConfig}
                    readOnly={Boolean((currentStyle as any)?.bomCompletedTime)}
                    bomAssignee={(currentStyle as any)?.bomAssignee}
                    bomStartTime={(currentStyle as any)?.bomStartTime}
                    bomCompletedTime={(currentStyle as any)?.bomCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                  <Card title="纸样开发" id="section-pattern" style={{ marginTop: 8, borderRadius: 8 }}>
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
                  </Card>
                  <Card title="生产制单" id="section-production" style={{ marginTop: 8, borderRadius: 8 }}>
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
                  </Card>
                  <Card title="二次工艺" id="section-secondary" style={{ marginTop: 8, borderRadius: 8 }}>
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
                  </Card>
                  <Card title="工序单价" id="section-process" style={{ marginTop: 8, borderRadius: 8 }}>
                    <StyleProcessTab
                      styleId={currentStyle?.id ?? ''}
                      styleNo={currentStyle?.styleNo ?? ''}
                      readOnly={Boolean((currentStyle as any)?.processCompletedTime)}
                      processAssignee={(currentStyle as any)?.processAssignee}
                      processStartTime={(currentStyle as any)?.processStartTime}
                      processCompletedTime={(currentStyle as any)?.processCompletedTime}
                      onRefresh={() => { void fetchDetail(styleIdParam!); }}
                    />
                  </Card>
                </div>
              )},
              { key: 'quotation', label: '报价单', children: (
                <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  <StyleQuotationTab styleId={currentStyle?.id ?? ''} styleNo={currentStyle?.styleNo ?? ''} totalQty={colorSize.totalMatrixQty} />
                </div>
              )},
              { key: 'attachment', label: '附件文件', children: (
                <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  <StyleAttachmentTab styleId={currentStyle?.id ?? ''} styleNo={currentStyle?.styleNo ?? ''} />
                </div>
              )},
              { key: 'sku', label: 'SKU管理', children: (
                <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  <StyleSkuTab
                    styleId={String(currentStyle?.id ?? '')}
                    styleNo={currentStyle?.styleNo ?? ''}
                    skc={(currentStyle as any)?.skc}
                    skuMode={(currentStyle as any)?.skuMode}
                    useSkuPrefix={(currentStyle as any)?.useSkuPrefix}
                    onModeChange={() => { void fetchDetail(styleIdParam!); }}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                </div>
              )},
              { key: 'washlabel', label: '洗水唛', children: (
                <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  <StyleWashLabelTab
                    styleId={String(currentStyle?.id ?? '')}
                    styleNo={currentStyle?.styleNo ?? ''}
                    styleName={(currentStyle as any)?.styleName}
                    fabricCompositionParts={(currentStyle as any)?.fabricCompositionParts}
                    fabricComposition={(currentStyle as any)?.fabricComposition}
                    washInstructions={(currentStyle as any)?.washInstructions}
                    uCode={(currentStyle as any)?.uCode}
                    washTempCode={(currentStyle as any)?.washTempCode}
                    bleachCode={(currentStyle as any)?.bleachCode}
                    tumbleDryCode={(currentStyle as any)?.tumbleDryCode}
                    ironCode={(currentStyle as any)?.ironCode}
                    dryCleanCode={(currentStyle as any)?.dryCleanCode}
                    careIconCodes={(currentStyle as any)?.careIconCodes}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                </div>
              )},
              { key: 'cutting', label: '裁剪信息', children: (
                <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  <StyleCuttingInfoTab styleNo={currentStyle?.styleNo ?? ''} />
                </div>
              )},
            ]}
          />
        </div>
        </PageLayout>

      <ResizableModal
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
                <Checkbox value="sku">SKU管理</Checkbox>
              </div>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} placeholder="选填：推送备注" />
          </Form.Item>
        </Form>
      </ResizableModal>

    </>
  );
};

export default StyleInfoDetailPage;
