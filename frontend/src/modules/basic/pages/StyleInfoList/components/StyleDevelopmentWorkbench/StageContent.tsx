import React from 'react';
import { Skeleton } from 'antd';
import type { StyleAttachment, StyleInfo, WorkbenchSection } from '@/types/style';
import StyleAttachmentTab from '../../../StyleInfo/components/StyleAttachmentTab';
import StyleBomTab from '../../../StyleInfo/components/StyleBomTab';
import StylePatternTab from '../../../StyleInfo/components/StylePatternTab';
import StyleProcessTab from '../../../StyleInfo/components/StyleProcessTab';
import StyleProductionTab from '../../../StyleInfo/components/StyleProductionTab';
import StyleQuotationTab from '../../../StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '../../../StyleInfo/components/StyleSecondaryProcessTab';
import type { SizeColorConfig } from './types';

interface StageContentProps {
  loading: boolean;
  activeSection: WorkbenchSection;
  record: StyleInfo;
  detail: StyleInfo;
  sizeColorConfig: SizeColorConfig;
  productionReqRows: string[];
  productionSaving: boolean;
  setProductionReqRows: React.Dispatch<React.SetStateAction<string[]>>;
  onSectionRefresh: () => void;
  onAttachmentListChange: (list: StyleAttachment[]) => void;
  onSaveProduction: () => void;
}

const StageContent: React.FC<StageContentProps> = ({
  loading,
  activeSection,
  record,
  detail,
  sizeColorConfig,
  productionReqRows,
  productionSaving,
  setProductionReqRows,
  onSectionRefresh,
  onAttachmentListChange,
  onSaveProduction,
}) => {
  if (loading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (activeSection === 'bom') {
    return (
      <div className="style-workbench__editor">
        <StyleBomTab
          styleId={record.id!}
          sizeColorConfig={sizeColorConfig}
          readOnly={Boolean((detail as any).bomCompletedTime)}
          bomAssignee={(detail as any).bomAssignee}
          bomStartTime={(detail as any).bomStartTime}
          bomCompletedTime={(detail as any).bomCompletedTime}
          onRefresh={onSectionRefresh}
        />
      </div>
    );
  }

  if (activeSection === 'pattern') {
    return (
      <div className="style-workbench__editor">
        <StylePatternTab
          styleId={record.id!}
          sizeColorConfig={sizeColorConfig as any}
          patternStatus={(detail as any).patternStatus}
          patternStartTime={(detail as any).patternStartTime}
          patternCompletedTime={(detail as any).patternCompletedTime}
          patternAssignee={(detail as any).patternAssignee}
          readOnly={Boolean((detail as any).patternCompletedTime)}
          onRefresh={onSectionRefresh}
        />
      </div>
    );
  }

  if (activeSection === 'process') {
    return (
      <div className="style-workbench__editor">
        <StyleProcessTab
          styleId={record.id!}
          styleNo={detail.styleNo}
          readOnly={Boolean((detail as any).processCompletedTime)}
          progressNode={String((detail as any).progressNode || '')}
          processAssignee={(detail as any).processAssignee}
          processStartTime={(detail as any).processStartTime}
          processCompletedTime={(detail as any).processCompletedTime}
          onRefresh={onSectionRefresh}
        />
      </div>
    );
  }

  if (activeSection === 'secondary') {
    return (
      <div className="style-workbench__editor">
        <StyleSecondaryProcessTab
          styleId={record.id!}
          styleNo={detail.styleNo}
          readOnly={Boolean((detail as any).secondaryCompletedTime)}
          secondaryAssignee={(detail as any).secondaryAssignee}
          secondaryStartTime={(detail as any).secondaryStartTime}
          secondaryCompletedTime={(detail as any).secondaryCompletedTime}
          sampleQuantity={(detail as any).sampleQuantity}
          onRefresh={onSectionRefresh}
        />
      </div>
    );
  }

  if (activeSection === 'production') {
    return (
      <div className="style-workbench__editor">
        <StyleProductionTab
          styleId={record.id!}
          styleNo={detail.styleNo}
          productionReqRows={productionReqRows}
          productionReqRowCount={15}
          productionReqLocked={Boolean((detail as any).productionCompletedTime)}
          productionReqEditable
          productionReqSaving={productionSaving}
          productionReqRollbackSaving={false}
          onProductionReqChange={(index, value) => {
            setProductionReqRows((prev) => {
              const next = [...prev];
              next[index] = value;
              return next;
            });
          }}
          onProductionReqSave={() => { void onSaveProduction(); }}
          onProductionReqReset={() => {}}
          onProductionReqRollback={() => {}}
          productionReqCanRollback={false}
          productionAssignee={(detail as any).productionAssignee}
          productionStartTime={(detail as any).productionStartTime}
          productionCompletedTime={(detail as any).productionCompletedTime}
          onRefresh={onSectionRefresh}
          sampleCompleted={(detail as any).sampleStatus === 'COMPLETED'}
          sampleReviewStatus={(detail as any).sampleReviewStatus}
          sampleReviewComment={(detail as any).sampleReviewComment}
          sampleReviewer={(detail as any).sampleReviewer}
          sampleReviewTime={(detail as any).sampleReviewTime}
        />
      </div>
    );
  }

  if (activeSection === 'quotation') {
    return (
      <div className="style-workbench__editor">
        <StyleQuotationTab
          styleId={record.id!}
          totalQty={Number((detail as any).quantity || 0)}
          onSaved={onSectionRefresh}
        />
      </div>
    );
  }

  if (activeSection === 'files') {
    return (
      <div className="style-workbench__editor">
        <StyleAttachmentTab
          styleId={record.id!}
          uploadText="上传开发资料"
          onListChange={onAttachmentListChange}
        />
      </div>
    );
  }

  return null;
};

export default StageContent;
