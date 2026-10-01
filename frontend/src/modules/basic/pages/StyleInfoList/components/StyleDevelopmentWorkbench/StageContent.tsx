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
          styleNo={detail.styleNo}
          sizeColorConfig={sizeColorConfig}
          readOnly={Boolean(detail.bomCompletedTime)}
          bomAssignee={detail.bomAssignee}
          bomStartTime={detail.bomStartTime}
          bomCompletedTime={detail.bomCompletedTime}
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
          styleNo={detail.styleNo}
          sizeColorConfig={sizeColorConfig as any}
          linkedSizes={sizeColorConfig.sizes}
          patternStatus={detail.patternStatus}
          patternStartTime={detail.patternStartTime}
          patternCompletedTime={detail.patternCompletedTime}
          patternAssignee={detail.patternAssignee}
          readOnly={Boolean(detail.patternCompletedTime)}
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
          sizeColorConfig={sizeColorConfig}
          readOnly={Boolean(detail.processCompletedTime)}
          progressNode={String(detail.progressNode || '')}
          processAssignee={detail.processAssignee}
          processStartTime={detail.processStartTime}
          processCompletedTime={detail.processCompletedTime}
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
          readOnly={Boolean(detail.secondaryCompletedTime)}
          secondaryAssignee={detail.secondaryAssignee}
          secondaryStartTime={detail.secondaryStartTime}
          secondaryCompletedTime={detail.secondaryCompletedTime}
          sampleQuantity={detail.sampleQuantity}
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
          productionReqLocked={Boolean(detail.productionCompletedTime)}
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
          productionAssignee={detail.productionAssignee}
          productionStartTime={detail.productionStartTime}
          productionCompletedTime={detail.productionCompletedTime}
          onRefresh={onSectionRefresh}
          sampleCompleted={detail.sampleStatus === 'COMPLETED'}
          sampleReviewStatus={detail.sampleReviewStatus}
          sampleReviewComment={detail.sampleReviewComment}
          sampleReviewer={detail.sampleReviewer}
          sampleReviewTime={detail.sampleReviewTime}
        />
      </div>
    );
  }

  if (activeSection === 'quotation') {
    return (
      <div className="style-workbench__editor">
        <StyleQuotationTab
          styleId={record.id!}
          styleNo={detail.styleNo}
          totalQty={Number(detail.quantity || 0)}
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
