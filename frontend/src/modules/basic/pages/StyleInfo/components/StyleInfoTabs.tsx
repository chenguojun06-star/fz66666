import React from 'react';
import { Card, Tabs } from 'antd';
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
}

const tabContentStyle: React.CSSProperties = {
  padding: 12,
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border)',
  borderTop: 'none',
  borderRadius: '0 0 10px 10px',
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
}) => {
  const styleId = currentStyle?.id ?? '';
  const styleNo = currentStyle?.styleNo ?? '';

  return (
    <div style={{ marginTop: 4 }}>
      <Tabs
        activeKey={activeKey}
        onChange={onChange}
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
            <div style={tabContentStyle}>
              <StyleBomTab
                styleId={styleId}
                sizeColorConfig={sizeColorConfig}
                readOnly={Boolean((currentStyle as any)?.bomCompletedTime)}
                bomAssignee={(currentStyle as any)?.bomAssignee}
                bomStartTime={(currentStyle as any)?.bomStartTime}
                bomCompletedTime={(currentStyle as any)?.bomCompletedTime}
                onRefresh={onRefresh}
                onCartAdded={onCartAdded}
              />
              <Card title="纸样开发" id="section-pattern" style={{ marginTop: 8, borderRadius: 8 }}>
                <StylePatternTab
                  styleId={styleId}
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
              </Card>
              <Card title="生产制单" id="section-production" style={{ marginTop: 8, borderRadius: 8 }}>
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
              </Card>
              <Card title="二次工艺" id="section-secondary" style={{ marginTop: 8, borderRadius: 8 }}>
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
              </Card>
              <Card title="工序单价" id="section-process" style={{ marginTop: 8, borderRadius: 8 }}>
                <StyleProcessTab
                  styleId={styleId}
                  styleNo={styleNo}
                  readOnly={Boolean((currentStyle as any)?.processCompletedTime)}
                  processAssignee={(currentStyle as any)?.processAssignee}
                  processStartTime={(currentStyle as any)?.processStartTime}
                  processCompletedTime={(currentStyle as any)?.processCompletedTime}
                  onRefresh={onRefresh}
                />
              </Card>
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
