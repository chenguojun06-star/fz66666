import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Form } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import { PurchaseCartDrawer } from '@/components/common/PurchaseCartDrawer';
import { useStyleDetail } from './hooks/useStyleDetail';
import { useStyleFormActions } from './hooks/useStyleFormActions';
import { useStyleColorSize } from './hooks/useStyleColorSize';
import { useStyleProduction } from './hooks/useStyleProduction';
import { useStylePushOrder } from './hooks/useStylePushOrder';
import { useStyleDraft } from './hooks/useStyleDraft';
import StyleBasicInfoForm, { type StyleBasicInfoFormRef } from './components/StyleBasicInfoForm';
import StyleActionButtons from './components/StyleActionButtons';
import StyleInfoTabs from './components/StyleInfoTabs';
import PushToOrderModal from './components/PushToOrderModal';
import StyleIntelligenceProfileCard from './components/StyleIntelligenceProfileCard';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { type StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';
import { useFieldConfig } from '@/hooks/useFieldConfig';

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
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const basicInfoFormRef = useRef<StyleBasicInfoFormRef | null>(null);

  const { fields: fieldConfigs } = useFieldConfig({ bizType: 'style', platform: 'pc' });
  const customFields = useMemo(() => fieldConfigs.filter(f => f.isSystem === 0), [fieldConfigs]);

  const handleStyleParseResult = (result: StyleFieldParseResult) => {
    basicInfoFormRef.current?.applyStyleParseResult(result);
  };

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const colorSize = useStyleColorSize({ currentStyle, setCurrentStyle, isNewPage, form });

  const { clearDraft } = useStyleDraft({
    isNewPage,
    form,
    setCurrentStyle,
    sizeColorConfig: colorSize.sizeColorConfig,
  });

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
    customFields,
    sizeColorConfig: colorSize.sizeColorConfig,
    pendingImages: colorSize.pendingImages,
    pendingColorImages: colorSize.pendingColorImages,
  });

  const handleSave = async () => {
    const success = await _handleSave();
    if (success && isNewPage) {
      clearDraft();
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

  useEffect(() => {
    if (!styleIdParam || isNewPage) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (editLocked && Boolean(currentStyle?.id)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (editLocked && Boolean(currentStyle?.id)) return;
        void fetchDetail(styleIdParam);
      }, 500);
    };
    window.addEventListener('order:progress:changed', handleChange);
    window.addEventListener('data:changed', handleChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('order:progress:changed', handleChange);
      window.removeEventListener('data:changed', handleChange);
    };
  }, [styleIdParam, isNewPage, editLocked, currentStyle?.id, fetchDetail]);

  if (!isDetailPage && !isNewPage) {
    return null;
  }

  const handleRefresh = () => {
    if (styleIdParam) {
      void fetchDetail(styleIdParam);
    }
  };

  return (
    <>
      <PageLayout>
        {showSmartErrorNotice && smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={handleRefresh} />
          </Card>
        ) : null}
        <StyleIntelligenceProfileCard style={currentStyle} />
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
              customFields={customFields}
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
              styleId={String(currentStyle?.id ?? '')}
              styleNo={currentStyle?.styleNo ?? ''}
              skc={(currentStyle as any)?.skc}
              skuMode={(currentStyle as any)?.skuMode}
              useSkuPrefix={(currentStyle as any)?.useSkuPrefix}
              onRefresh={handleRefresh}
            />
          </Form>
        </Card>

        <StyleInfoTabs
          activeKey={bomAreaTabKey}
          onChange={setBomAreaTabKey}
          currentStyle={currentStyle}
          styleIdParam={styleIdParam}
          sizeColorConfig={colorSize.sizeColorConfig}
          matrixSizes={colorSize.matrixSizes}
          totalMatrixQty={colorSize.totalMatrixQty}
          production={production}
          onRefresh={handleRefresh}
          onCartAdded={() => setCartDrawerOpen(true)}
        />
      </PageLayout>

      <PushToOrderModal
        open={pushOrder.pushToOrderModalVisible}
        confirmLoading={pushOrder.pushToOrderSaving}
        pushToOrderForm={pushOrder.pushToOrderForm}
        pushToOrderTargets={pushOrder.pushToOrderTargets}
        setPushToOrderTargets={pushOrder.setPushToOrderTargets}
        setPushToOrderModalVisible={pushOrder.setPushToOrderModalVisible}
        onOk={pushOrder.submitPushToOrder}
      />

      <PurchaseCartDrawer
        open={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
      />
    </>
  );
};

export default StyleInfoDetailPage;
