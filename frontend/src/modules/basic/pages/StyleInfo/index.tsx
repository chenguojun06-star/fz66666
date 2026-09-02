import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Form } from 'antd';
import api from '@/utils/api';
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
  const [unscrapLoading, setUnscrapLoading] = useState(false);

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
  const [bomAreaTabKey, setBomAreaTabKey] = useState('basic');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const basicInfoFormRef = useRef<StyleBasicInfoFormRef | null>(null);

  const { fields: fieldConfigs } = useFieldConfig({ bizType: 'style', platform: 'pc' });
  const customFields = useMemo(() => fieldConfigs.filter(f => f.isSystem === 0), [fieldConfigs]);

  const handleStyleParseResult = (result: StyleFieldParseResult) => {
    basicInfoFormRef.current?.applyStyleParseResult(result);
  };

  // 顶部档案卡的视觉AI分析（缓存 visionRaw / 手动"图像分析"产出）回填款式特征。
  // 此前卡片上的 AI 识别结果与表单完全两条链路，款式特征永远空着（用户："根本没打通"）。
  // 仅在特征为空时填充，人工已写的内容不被覆盖。
  const handleVisionAnalysisFill = React.useCallback((payload: { visionRaw: string; difficultyLabel?: string; difficultyScore?: number }) => {
    const text = String(payload?.visionRaw || '').trim();
    if (!text) return;
    const current = form.getFieldValue(['extJson', 'styleFeature']);
    if (typeof current === 'string' && current.trim()) return;
    basicInfoFormRef.current?.applyStyleParseResult({
      imageUrl: '',
      available: true,
      overallConfidence: 1,
      styleConfidence: 1,
      colorConfidence: 1,
      needManualReview: false,
      colors: [],
      summary: text,
    });
  }, [form]);

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

  // 用 ref 持有最新值，避免事件监听 effect 频繁重订阅导致闪动
  const editLockedRef = useRef(editLocked);
  editLockedRef.current = editLocked;
  const currentStyleIdRef = useRef(currentStyle?.id);
  currentStyleIdRef.current = currentStyle?.id;
  const fetchDetailRef = useRef(fetchDetail);
  fetchDetailRef.current = fetchDetail;

  useEffect(() => {
    if (!styleIdParam || isNewPage) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // 编辑中（解锁态编辑已有款式）：绝不自动刷新。
    // 此前守卫条件写反（锁定时跳过、编辑中反而刷新），导致：
    // 全局 data:changed 事件触发 fetchDetail → editLocked 被重置为 true（没点保存自动锁住）、
    // matrixSizes/matrixColors 被后端旧数据覆盖（减号删码数又弹回来）、
    // 未保存的颜色图片丢失、表单值被旧数据回填。
    const isEditing = () => !editLockedRef.current && Boolean(currentStyleIdRef.current);
    const handleChange = () => {
      if (isEditing()) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isEditing()) return;
        void fetchDetailRef.current(styleIdParam);
      }, 500);
    };
    window.addEventListener('order:progress:changed', handleChange);
    window.addEventListener('data:changed', handleChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('order:progress:changed', handleChange);
      window.removeEventListener('data:changed', handleChange);
    };
  }, [styleIdParam, isNewPage]);

  if (!isDetailPage && !isNewPage) {
    return null;
  }

  const handleRefresh = () => {
    if (styleIdParam) {
      void fetchDetail(styleIdParam);
    }
  };

  // 详情页内联取消报废：报废款式禁止编辑保存（后端 400 拦截），
  // 用户想重做单子时在详情页直接恢复，不必去列表页找入口
  const handleUnscrap = async () => {
    if (!currentStyle?.id) return;
    setUnscrapLoading(true);
    try {
      const res = await api.post(`/style/info/${currentStyle.id}/unscrap`);
      if (res.code === 200) {
        _message.success('已恢复为启用状态，现在可以编辑和下单');
        handleRefresh();
      } else {
        _message.error(res.message || '取消报废失败');
      }
    } catch (error: unknown) {
      _message.error(error instanceof Error ? error.message : '取消报废失败');
    } finally {
      setUnscrapLoading(false);
    }
  };
  const isScrapped = currentStyle?.status === 'SCRAPPED';

  // 顶部 extra 与底部 sticky 保存条共用同一按钮组
  const actionButtons = (
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
  );

  return (
    <>
      <PageLayout>
        {showSmartErrorNotice && smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={handleRefresh} />
          </Card>
        ) : null}
        {isScrapped && currentStyle?.id ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12, borderRadius: 10 }}
            message="该款式已报废，无法编辑保存"
            description="报废款式受保护，所有保存操作会被拦截。如需重新做单，请先取消报废恢复款式。"
            action={
              <Button danger ghost loading={unscrapLoading} onClick={handleUnscrap}>
                取消报废
              </Button>
            }
          />
        ) : null}
        <StyleIntelligenceProfileCard style={currentStyle} onVisionAnalysis={handleVisionAnalysisFill} />
        <Card
          title={
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>样衣详情</span>
          }
          style={{ marginBottom: 16, borderRadius: 10 }}
          bodyStyle={{ padding: 20 }}
          extra={actionButtons}
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
              renderBelowForm={(basicInfoTabContent?: React.ReactNode) => (
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
                  basicInfoContent={basicInfoTabContent}
                />
              )}
            />
          </Form>
          {/* 底部 sticky 保存条：长表单编辑到底部后无需滚回顶部保存。
              bottom/margin 负值抵消 Card body 底部 padding(20px)，使操作条贴住卡片底边 */}
          <div
            style={{
              position: 'sticky',
              bottom: -20,
              zIndex: 6,
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '10px 20px',
              margin: '4px -20px -20px',
              background: 'var(--color-bg-base)',
              borderTop: '1px solid var(--color-border-light)',
              borderRadius: '0 0 10px 10px',
            }}
          >
            {actionButtons}
          </div>
        </Card>
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
