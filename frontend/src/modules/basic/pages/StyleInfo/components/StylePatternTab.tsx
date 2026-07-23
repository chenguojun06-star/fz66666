import React from 'react';
import StyleStageControlBar from './StyleStageControlBar';
import StyleAttachmentTab from './StyleAttachmentTab';
import StyleSizeTab from './StyleSizeTab';
import PatternUsageCard from './stylePattern/PatternUsageCard';
import { useUsageColumns } from './stylePattern/columns';
import type { SizeColorConfigInput } from './stylePattern/helpers';
import useStylePatternTabData from './hooks/useStylePatternTabData';

interface Props {
  styleId: string | number;
  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  patternAssignee?: string;
  readOnly?: boolean;
  onRefresh: () => void;
  sizeColorConfig?: SizeColorConfigInput;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
  linkedSizes?: string[];
}

const StylePatternTab: React.FC<Props> = ({
  styleId,
  patternStatus,
  patternStartTime,
  patternCompletedTime,
  patternAssignee,
  readOnly,
  onRefresh,
  sizeColorConfig,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
  linkedSizes,
}) => {
  const {
    setPatternFiles,
    patternCheckResult,
    bomList,
    bomLoading,
    usageEdits,
    lossEdits,
    savingUsage,
    setUsageEdits,
    extraSizes,
    setExtraSizes,
    sizeOptions,
    setSizeOptions,
    sizeSearchTimerRef,
    childReadOnly,
    activeSizes,
    allSizes,
    patternRows,
    handleUsageChange,
    handleLossChange,
    handleAddSizes,
    handleSaveUsage,
  } = useStylePatternTabData({ styleId, patternStatus, readOnly, sizeColorConfig });

  const usageColumns = useUsageColumns({
    allSizes,
    extraSizes,
    usageEdits,
    lossEdits,
    handleUsageChange,
    handleLossChange,
    childReadOnly,
    setExtraSizes,
    setUsageEdits,
  });

  return (
    <div>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="纸样开发"
        styleId={styleId}
        apiPath="pattern"
        status={patternStatus}
        assignee={patternAssignee}
        startTime={patternStartTime}
        completedTime={patternCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh}
        onBeforeComplete={async () => {
          return true;
        }}
        extraInfo={
          <>
            {/* 纸样齐全检查提示 */}
            {patternCheckResult && !patternCheckResult.complete && (
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--color-warning)',
                  backgroundColor: '#FFFBE6',
                  border: '1px solid var(--status-warning-border)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                 缺少: {patternCheckResult.missingItems.join('、')}
              </span>
            )}
          </>
        }
      />

      {/* 纸样文件上传区域 */}
      <div style={{ marginTop: 16 }}>
        <StyleAttachmentTab
          styleId={styleId}
          bizType="pattern"
          uploadText="上传纸样文件"
          readOnly={childReadOnly}
          onListChange={setPatternFiles}
        />
      </div>

      {/* 尺寸表模块 */}
      <div style={{ marginTop: 16 }}>
        <StyleSizeTab
          styleId={styleId}
          readOnly={childReadOnly}
          sizeAssignee={sizeAssignee}
          sizeStartTime={sizeStartTime}
          sizeCompletedTime={sizeCompletedTime}
          linkedSizes={linkedSizes}
          hideStageControl
          onRefresh={onRefresh}
        />
      </div>

      {/* 各码用量配比 */}
      <PatternUsageCard
        childReadOnly={childReadOnly}
        activeSizes={activeSizes}
        allSizes={allSizes}
        bomList={bomList}
        bomLoading={bomLoading}
        patternRows={patternRows}
        usageColumns={usageColumns}
        savingUsage={savingUsage}
        sizeOptions={sizeOptions}
        sizeSearchTimerRef={sizeSearchTimerRef}
        onAddSizes={handleAddSizes}
        onSaveUsage={handleSaveUsage}
        setSizeOptions={setSizeOptions}
      />
    </div>
  );
};

export default StylePatternTab;
