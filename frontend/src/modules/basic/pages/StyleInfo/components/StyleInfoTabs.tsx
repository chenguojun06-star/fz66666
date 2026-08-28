import React from 'react';
import { Tabs } from 'antd';
import type { SizeColorConfigInput } from './stylePattern/helpers';

import StyleBomTab from './StyleBomTab';
import StyleQuotationTab from './StyleQuotationTab';
import StyleAttachmentTab from './StyleAttachmentTab';
import StylePatternTab from './StylePatternTab';
import StyleProcessTab from './StyleProcessTab';
import StyleProductionTab from './StyleProductionTab';
import StyleSecondaryProcessTab from './StyleSecondaryProcessTab';
import StyleWashLabelTab from './StyleWashLabelTab';

interface StyleInfoTabsProps {
  activeKey: string;
  onChange: (key: string) => void;
  currentStyle: any;
  styleIdParam?: string;
  sizeColorConfig?: SizeColorConfigInput;
  matrixSizes: string[];
  totalMatrixQty: number;
  production: {
    productionReqRows: string[];
    productionReqRowCount: number;
    productionReqEditable: boolean;
    productionSaving: boolean;
    productionRollbackSaving: boolean;
    updateProductionReqRow: (index: number, value: string) => void;
    handleSaveProduction: () => Promise<void>;
    resetProductionReqFromCurrent: () => void;
    handleRollbackProductionReq: () => Promise<void>;
  };
  onRefresh: () => void;
  onCartAdded: () => void;
  /** 基础信息 Tab 内容（由 StyleBasicInfoForm 注入，排在所有 Tab 最前面） */
  basicInfoContent?: React.ReactNode;
}

const tabContentStyle: React.CSSProperties = {
  padding: 12,
  // 给 tab 内容区一个最小高度，避免 tab 切换时 loading → 数据渲染导致高度突变，
  // 配合 tabBarStyle 的 sticky 防止 tabs bar "跳跃"。
  minHeight: '60vh',
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border)',
  borderTop: 'none',
  borderRadius: '0 0 10px 10px',
};

// 阶段状态圆点：绿色=已完成，蓝色=进行中，灰色=未开始
const StageDot: React.FC<{ completed?: boolean; inProgress?: boolean }> = ({ completed, inProgress }) => {
  const background = completed
    ? 'var(--color-success, #52c41a)'
    : inProgress
      ? 'var(--color-primary, #1677ff)'
      : 'var(--color-text-quaternary, #bfbfbf)';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background,
        marginRight: 8,
        verticalAlign: 'middle',
      }}
    />
  );
};

const StyleInfoTabs: React.FC<StyleInfoTabsProps> = ({
  activeKey,
  onChange,
  currentStyle,
  sizeColorConfig,
  matrixSizes,
  totalMatrixQty,
  production,
  onRefresh,
  onCartAdded,
  basicInfoContent,
}) => {
  const styleId = currentStyle?.id ?? '';
  const styleNo = currentStyle?.styleNo ?? '';

  // 读取各阶段完成状态
  const isStageCompleted = (stage: string): boolean => {
    const completedTime = (currentStyle as any)?.[`${stage}CompletedTime`];
    const status = (currentStyle as any)?.[`${stage}Status`];
    return Boolean(completedTime) || String(status || '').toUpperCase() === 'COMPLETED';
  };
  const isStageInProgress = (stage: string): boolean => {
    if (isStageCompleted(stage)) return false;
    const startTime = (currentStyle as any)?.[`${stage}StartTime`];
    const status = (currentStyle as any)?.[`${stage}Status`];
    return Boolean(startTime) || Boolean(status);
  };

  return (
    <div style={{ marginTop: 4 }}>
      <Tabs
        activeKey={activeKey}
        onChange={onChange}
        size="small"
        // 禁用切换动画，避免 antd Tabs animated + sticky 在内容高度突变时双重抖动
        animated={false}
        // 保留已切换过的 tab 内容 DOM（配合 minHeight），切回时立即显示已有内容，避免重新加载导致高度突变跳跃
        // 注：antd v6 已将 destroyInactiveTabPane 重命名为 destroyOnHidden
        destroyOnHidden={false}
        tabBarStyle={{
          background: 'var(--color-bg-base)',
          padding: '0 12px',
          borderRadius: '10px 10px 0 0',
          border: '1px solid var(--color-border)',
          margin: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
        items={[
          // 基础信息 Tab（排在所有开发流程 Tab 最前面）
          ...(basicInfoContent ? [{
            key: 'basic',
            label: <span><StageDot completed={false} inProgress={!isStageCompleted('bom')} />基础信息</span>,
            children: (
              <div style={tabContentStyle}>
                {basicInfoContent}
              </div>
            ),
          }] : []),
          { key: 'bom', label: <span><StageDot completed={isStageCompleted('bom')} inProgress={isStageInProgress('bom')} />物料清单</span>, children: (
            <div style={tabContentStyle}>
              <StyleBomTab
                styleId={styleId}
                styleNo={styleNo}
                sizeColorConfig={sizeColorConfig}
                readOnly={Boolean((currentStyle as any)?.bomCompletedTime)}
                bomAssignee={(currentStyle as any)?.bomAssignee}
                bomStartTime={(currentStyle as any)?.bomStartTime}
                bomCompletedTime={(currentStyle as any)?.bomCompletedTime}
                onRefresh={onRefresh}
                onCartAdded={onCartAdded}
              />
            </div>
          )},
          { key: 'pattern', label: <span><StageDot completed={isStageCompleted('pattern')} inProgress={isStageInProgress('pattern')} />纸样开发</span>, children: (
            <div style={tabContentStyle}>
              <StylePatternTab
                styleId={styleId}
                styleNo={styleNo}
                sizeColorConfig={sizeColorConfig}
                readOnly={Boolean((currentStyle as any)?.patternCompletedTime)}
                patternAssignee={(currentStyle as any)?.patternAssignee}
                patternStartTime={(currentStyle as any)?.patternStartTime}
                patternCompletedTime={(currentStyle as any)?.patternCompletedTime}
                patternStatus={currentStyle?.patternStatus}
                sizeAssignee={(currentStyle as any)?.sizeAssignee}
                sizeStartTime={(currentStyle as any)?.sizeStartTime}
                sizeCompletedTime={(currentStyle as any)?.sizeCompletedTime}
                linkedSizes={matrixSizes}
                onRefresh={onRefresh}
              />
            </div>
          )},
          { key: 'production', label: <span><StageDot completed={isStageCompleted('production')} inProgress={isStageInProgress('production')} />工艺说明</span>, children: (
            <div style={tabContentStyle}>
              <StyleProductionTab
                styleId={styleId}
                styleNo={styleNo}
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
                onRefresh={onRefresh}
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
            </div>
          )},
          { key: 'secondary', label: <span><StageDot completed={isStageCompleted('secondary')} inProgress={isStageInProgress('secondary')} />二次工艺</span>, children: (
            <div style={tabContentStyle}>
              <StyleSecondaryProcessTab
                styleId={styleId}
                styleNo={styleNo}
                readOnly={Boolean((currentStyle as any)?.secondaryCompletedTime)}
                secondaryAssignee={(currentStyle as any)?.secondaryAssignee}
                secondaryStartTime={(currentStyle as any)?.secondaryStartTime}
                secondaryCompletedTime={(currentStyle as any)?.secondaryCompletedTime}
                sampleQuantity={(currentStyle as any)?.sampleQuantity}
                onRefresh={onRefresh}
              />
            </div>
          )},
          { key: 'process', label: <span><StageDot completed={isStageCompleted('process')} inProgress={isStageInProgress('process')} />工序单价</span>, children: (
            <div style={tabContentStyle}>
              <StyleProcessTab
                styleId={styleId}
                styleNo={styleNo}
                sizeColorConfig={sizeColorConfig}
                readOnly={Boolean((currentStyle as any)?.processCompletedTime)}
                processAssignee={(currentStyle as any)?.processAssignee}
                processStartTime={(currentStyle as any)?.processStartTime}
                processCompletedTime={(currentStyle as any)?.processCompletedTime}
                onRefresh={onRefresh}
              />
            </div>
          )},
          { key: 'quotation', label: '报价单', children: (
            <div style={tabContentStyle}>
              <StyleQuotationTab styleId={styleId} styleNo={styleNo} totalQty={totalMatrixQty} />
            </div>
          )},
          { key: 'attachment', label: '附件文件', children: (
            <div style={tabContentStyle}>
              <StyleAttachmentTab styleId={styleId} styleNo={styleNo} />
            </div>
          )},
          { key: 'washlabel', label: '洗水唛', children: (
            <div style={tabContentStyle}>
              <StyleWashLabelTab
                styleId={String(styleId ?? '')}
                styleNo={styleNo}
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
                onRefresh={onRefresh}
              />
            </div>
          )},
        ]}
      />
    </div>
  );
};

export default StyleInfoTabs;
