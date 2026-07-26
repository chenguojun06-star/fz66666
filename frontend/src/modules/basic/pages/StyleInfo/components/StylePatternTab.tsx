import React from 'react';
import { App } from 'antd';
import StyleStageControlBar from './StyleStageControlBar';
import StyleAttachmentTab from './StyleAttachmentTab';
import StyleSizeTab from './StyleSizeTab';
import PatternUsageCard from './stylePattern/PatternUsageCard';
import { useUsageColumns } from './stylePattern/columns';
import type { SizeColorConfigInput } from './stylePattern/helpers';
import useStylePatternTabData from './hooks/useStylePatternTabData';
import { useUser } from '@/utils/AuthContext';
import { confirmAction } from '@/utils/confirm';
import api from '@/utils/api';
import type { StyleBom } from '@/types/style';

interface Props {
  styleId: string | number;
  styleNo?: string;
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
  styleNo,
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
  const { user } = useUser();
  const { message } = App.useApp();
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

  // 纸样开发领取面辅料
  const handleApplyPickup = React.useCallback((record: StyleBom) => {
    const pickupQty = record.devUsageAmount ?? record.usageAmount;
    confirmAction('纸样开发领取', `确认领取「${record.materialCode || ''} ${record.materialName || ''}」，数量：${pickupQty ?? ''}${record.unit || ''}？`, async () => {
      try {
        await api.post('/production/picking/pending', {
          picking: {
            styleId: String(styleId || ''),
            styleNo: styleNo || '',
            pickerId: String(user?.id || ''),
            pickerName: String(user?.name || user?.username || ''),
            pickupType: 'INTERNAL',
            usageType: 'PATTERN',
            remark: 'BOM_PICK_PATTERN',
          },
          items: [{
            materialId: record.materialId,
            materialCode: record.materialCode,
            materialName: record.materialName,
            color: record.color ?? '',
            size: '',
            quantity: pickupQty != null ? Number(pickupQty) : 1,
            unit: record.unit ?? '',
          }],
        });
        message.success('领取成功，将在「面辅料出入库 → 待出库领料」中显示');
      } catch (error: unknown) {
        message.error(`领取失败：${error instanceof Error ? error.message : '请求错误'}`);
      }
    }, { okText: '确认领取' });
  }, [styleId, styleNo, user, message]);

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
    onApplyPickup: handleApplyPickup,
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
