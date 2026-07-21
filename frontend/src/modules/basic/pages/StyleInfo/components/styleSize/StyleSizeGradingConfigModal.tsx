import React, { useMemo } from 'react';
import { Button, Divider } from 'antd';
import Drawer from 'antd/es/drawer';
import { PlusOutlined } from '@ant-design/icons';
import { GradingZone, MatrixRow } from './shared';
import { useStyleSizeGradingConfigData } from './useStyleSizeGradingConfigData';
import { buildPreviewColumns } from './columns';
import PresetSection from './components/PresetSection';
import BaseSizeSection from './components/BaseSizeSection';
import ZoneCard from './components/ZoneCard';
import PreviewSection from './components/PreviewSection';

interface Props {
  open: boolean;
  gradingTargetRowKey: string;
  selectedRowCount: number;
  sizeColumns: string[];
  rows: MatrixRow[];
  gradingDraftBaseSize: string;
  gradingDraftZones: GradingZone[];
  setGradingDraftBaseSize: React.Dispatch<React.SetStateAction<string>>;
  setGradingDraftZones: React.Dispatch<React.SetStateAction<GradingZone[]>>;
  onCancel: () => void;
  onSubmit: () => void;
}

const StyleSizeGradingConfigModal: React.FC<Props> = ({
  open,
  gradingTargetRowKey,
  selectedRowCount,
  sizeColumns,
  rows,
  gradingDraftBaseSize,
  gradingDraftZones,
  setGradingDraftBaseSize,
  setGradingDraftZones,
  onCancel,
  onSubmit,
}) => {
  const {
    baseSizeValue,
    baseIndex,
    previewData,
    addSizeStepColumn,
    removeSizeStepColumn,
    updateSizeStepColumn,
    toggleSizeInColumn,
    updateZone,
    removeZone,
    toggleFrontSize,
    toggleBackSize,
    handleBaseSizeChange,
    handleAddZone,
    handleApplyPreset,
  } = useStyleSizeGradingConfigData({
    gradingTargetRowKey,
    sizeColumns,
    rows,
    gradingDraftBaseSize,
    gradingDraftZones,
    setGradingDraftBaseSize,
    setGradingDraftZones,
  });

  const previewColumns = useMemo(
    () => buildPreviewColumns(sizeColumns, gradingDraftBaseSize),
    [sizeColumns, gradingDraftBaseSize],
  );

  return (
    <Drawer
      open={open}
      title={gradingTargetRowKey === 'batch' ? `批量配置跳码区 (${selectedRowCount}个部位)` : '配置跳码区'}
      onClose={onCancel}
      size={Math.min(720, typeof window !== 'undefined' ? window.innerWidth * 0.55 : 720)}
      styles={{ body: { padding: '16px 20px', overflow: 'auto' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={onSubmit} disabled={!gradingDraftBaseSize}>
            保存并带出
          </Button>
        </div>
      }
    >
      {/* 行业预设模板 */}
      <PresetSection onApplyPreset={handleApplyPreset} />

      <Divider style={{ margin: '12px 0' }} />

      {/* 基准码选择 */}
      <BaseSizeSection
        gradingDraftBaseSize={gradingDraftBaseSize}
        sizeColumns={sizeColumns}
        baseSizeValue={baseSizeValue}
        onChange={handleBaseSizeChange}
      />

      <Divider style={{ margin: '12px 0' }} />

      {/* 跳码区配置 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>2. 配置跳码区</div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 12 }}>
          前区 = 比基准码小的码数，后区 = 比基准码大的码数。点击码数标签可切换选中状态。
        </div>

        {gradingDraftZones.map((zone, zoneIndex) => (
          <ZoneCard
            key={zone.key}
            zone={zone}
            zoneIndex={zoneIndex}
            sizeColumns={sizeColumns}
            rows={rows}
            canDelete={gradingDraftZones.length > 1}
            onUpdateZone={updateZone}
            onRemoveZone={removeZone}
            onToggleFrontSize={toggleFrontSize}
            onToggleBackSize={toggleBackSize}
            onAddSizeStepColumn={addSizeStepColumn}
            onRemoveSizeStepColumn={removeSizeStepColumn}
            onUpdateSizeStepColumn={updateSizeStepColumn}
            onToggleSizeInColumn={toggleSizeInColumn}
          />
        ))}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAddZone}
        >
          新增跳码区
        </Button>
      </div>

      {/* 实时预览 */}
      {baseIndex >= 0 && previewData.length > 0 && (
        <PreviewSection previewData={previewData} columns={previewColumns} />
      )}
    </Drawer>
  );
};

export default StyleSizeGradingConfigModal;
