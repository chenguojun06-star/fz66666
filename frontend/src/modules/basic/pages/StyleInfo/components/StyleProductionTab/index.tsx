import React from 'react';
import StyleStageControlBar from '../StyleStageControlBar';
import type { StyleProductionTabProps } from './types';
import { useStyleProductionTabData } from './useStyleProductionTabData';
import SampleReviewSection from './SampleReviewSection';
import ProductionRequirementsSection from './ProductionRequirementsSection';
import SampleReviewModal from './SampleReviewModal';
import OcrModal from './OcrModal';

const StyleProductionTab: React.FC<StyleProductionTabProps> = (props) => {
  const {
    styleId,
    styleNo,
    productionReqLocked,
    productionReqSaving,
    productionAssignee,
    productionStartTime,
    productionCompletedTime,
    onRefresh,
    onProductionReqSave,
    sampleCompleted,
    sampleReviewStatus,
    sampleReviewComment,
    sampleReviewer,
    sampleReviewTime,
    completedTime,
    styleName,
    color,
    size,
    sampleQuantity,
  } = props;

  const {
    allRequirements,
    reviewModalVisible,
    reviewSaving,
    reviewForm,
    openReviewModal,
    handleReviewSave,
    closeReviewModal,
    downloadWorkorder,
    printWorkorder,
    ocrModalOpen,
    ocrFile,
    ocrFileInputRef,
    ocrLoading,
    ocrText,
    ocrError,
    handleOcrOpen,
    handleOcrRecognize,
    handleOcrAppend,
    handleOcrReplace,
    closeOcrModal,
    handleOcrFileSelect,
    handleOcrFileRemove,
    handleTextChange,
  } = useStyleProductionTabData(props);

  return (
    <div data-production-req>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="生产制单"
        styleId={styleId}
        apiPath="production"
        styleNo={styleNo}
        status={productionCompletedTime ? 'COMPLETED' : productionStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={productionAssignee}
        startTime={productionStartTime}
        completedTime={productionCompletedTime}
        onRefresh={onRefresh ?? (() => {})}
      />

      {/* ===== 样衣审核区域 ===== */}
      <SampleReviewSection
        styleId={styleId}
        styleNo={styleNo}
        sampleCompleted={sampleCompleted}
        sampleReviewStatus={sampleReviewStatus}
        sampleReviewComment={sampleReviewComment}
        sampleReviewer={sampleReviewer}
        sampleReviewTime={sampleReviewTime}
        productionCompletedTime={productionCompletedTime}
        completedTime={completedTime}
        styleName={styleName}
        color={color}
        size={size}
        sampleQuantity={sampleQuantity}
        onOpenReviewModal={openReviewModal}
      />

      <ProductionRequirementsSection
        productionReqLocked={productionReqLocked}
        productionReqSaving={productionReqSaving}
        allRequirements={allRequirements}
        onProductionReqSave={onProductionReqSave}
        onDownloadWorkorder={downloadWorkorder}
        onPrintWorkorder={printWorkorder}
        onOpenOcr={handleOcrOpen}
        onTextChange={handleTextChange}
      />

      {/* 样衣审核 Modal */}
      <SampleReviewModal
        open={reviewModalVisible}
        saving={reviewSaving}
        form={reviewForm}
        onOk={handleReviewSave}
        onCancel={closeReviewModal}
      />

      {/* AI识别工艺单 Modal */}
      <OcrModal
        open={ocrModalOpen}
        file={ocrFile}
        fileInputRef={ocrFileInputRef}
        loading={ocrLoading}
        text={ocrText}
        error={ocrError}
        onRecognize={handleOcrRecognize}
        onAppend={handleOcrAppend}
        onReplace={handleOcrReplace}
        onClose={closeOcrModal}
        onFileSelect={handleOcrFileSelect}
        onFileRemove={handleOcrFileRemove}
      />
    </div>
  );
};

export default StyleProductionTab;
