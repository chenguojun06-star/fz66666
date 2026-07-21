import { useMemo } from 'react';
import { toNumberSafe } from '@/utils/api';
import { GradingZone, MatrixRow } from './shared';
import { matchPresetSteps } from './gradingPresets';
import { SizeStepColumn, computePreview, createEmptySizeStepColumn } from './helpers';

export interface UseStyleSizeGradingConfigDataParams {
  gradingTargetRowKey: string;
  sizeColumns: string[];
  rows: MatrixRow[];
  gradingDraftBaseSize: string;
  gradingDraftZones: GradingZone[];
  setGradingDraftBaseSize: React.Dispatch<React.SetStateAction<string>>;
  setGradingDraftZones: React.Dispatch<React.SetStateAction<GradingZone[]>>;
}

export const useStyleSizeGradingConfigData = ({
  gradingTargetRowKey,
  sizeColumns,
  rows,
  gradingDraftBaseSize,
  gradingDraftZones,
  setGradingDraftBaseSize,
  setGradingDraftZones,
}: UseStyleSizeGradingConfigDataParams) => {
  const getBaseSizeValue = () => {
    if (!gradingDraftBaseSize) return null;
    const firstRow = rows[0];
    if (!firstRow) return null;
    return firstRow.cells?.[gradingDraftBaseSize]?.value ?? null;
  };

  const baseSizeValue = getBaseSizeValue();
  const baseIndex = gradingDraftBaseSize ? sizeColumns.indexOf(gradingDraftBaseSize) : -1;

  // 实时预览数据
  const previewData = useMemo(() => {
    if (baseIndex < 0 || baseSizeValue === null) return [];
    return rows
      .filter((row) => {
        if (gradingTargetRowKey === 'batch') return true;
        return row.key === gradingTargetRowKey;
      })
      .slice(0, 8) // 最多预览8行
      .map((row) => {
        const rowBaseValue = toNumberSafe(row.cells[gradingDraftBaseSize]?.value);
        const rowPreview = computePreview(rowBaseValue, baseIndex, sizeColumns, gradingDraftZones);
        const result: Record<string, any> = {
          key: row.key,
          partName: row.partName || '未命名',
          baseValue: rowBaseValue,
        };
        sizeColumns.forEach((sn) => {
          result[sn] = rowPreview[sn];
        });
        return result;
      });
  }, [baseIndex, baseSizeValue, gradingDraftBaseSize, gradingDraftZones, gradingTargetRowKey, rows, sizeColumns]);

  const addSizeStepColumn = (zoneKey: string) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = zone.sizeStepColumns || [];
      return { ...zone, sizeStepColumns: [...columns, createEmptySizeStepColumn()] };
    }));
  };

  const removeSizeStepColumn = (zoneKey: string, columnKey: string) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = (zone.sizeStepColumns || []).filter((col) => col.key !== columnKey);
      return { ...zone, sizeStepColumns: columns };
    }));
  };

  const updateSizeStepColumn = (zoneKey: string, columnKey: string, updates: Partial<SizeStepColumn>) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = (zone.sizeStepColumns || []).map((col) => (
        col.key === columnKey ? { ...col, ...updates } : col
      ));
      return { ...zone, sizeStepColumns: columns };
    }));
  };

  const toggleSizeInColumn = (zoneKey: string, columnKey: string, size: string) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = (zone.sizeStepColumns || []).map((col) => {
        if (col.key !== columnKey) return col;
        const sizes = col.sizes.includes(size)
          ? col.sizes.filter((s) => s !== size)
          : [...col.sizes, size];
        return { ...col, sizes };
      });
      return { ...zone, sizeStepColumns: columns };
    }));
  };

  const updateZone = (zoneKey: string, updates: Partial<GradingZone>) => {
    setGradingDraftZones((prev) => prev.map((item) => (item.key === zoneKey ? { ...item, ...updates } : item)));
  };

  const removeZone = (zoneKey: string) => {
    setGradingDraftZones((prev) => prev.filter((item) => item.key !== zoneKey));
  };

  const toggleFrontSize = (zoneKey: string, size: string) => {
    setGradingDraftZones((prev) => prev.map((item) => {
      if (item.key !== zoneKey) return item;
      const nextSizes = (item.frontSizes || []).includes(size)
        ? (item.frontSizes || []).filter((s) => s !== size)
        : [...(item.frontSizes || []), size];
      return { ...item, frontSizes: nextSizes };
    }));
  };

  const toggleBackSize = (zoneKey: string, size: string) => {
    setGradingDraftZones((prev) => prev.map((item) => {
      if (item.key !== zoneKey) return item;
      const nextSizes = (item.backSizes || []).includes(size)
        ? (item.backSizes || []).filter((s) => s !== size)
        : [...(item.backSizes || []), size];
      return { ...item, backSizes: nextSizes };
    }));
  };

  const handleBaseSizeChange = (value: string | undefined) => {
    const newBaseSize = String(value || '');
    setGradingDraftBaseSize(newBaseSize);
    const newBaseIndex = newBaseSize ? sizeColumns.indexOf(newBaseSize) : -1;
    const newFrontSizes = newBaseIndex > 0 ? sizeColumns.slice(0, newBaseIndex) : [];
    const newBackSizes = newBaseIndex >= 0 ? sizeColumns.slice(newBaseIndex + 1) : [...sizeColumns];
    setGradingDraftZones((prev) => prev.map((zone) => ({
      ...zone,
      frontSizes: newFrontSizes,
      backSizes: newBackSizes,
    })));
  };

  const handleAddZone = () => {
    const newBaseIndex = gradingDraftBaseSize ? sizeColumns.indexOf(gradingDraftBaseSize) : -1;
    const frontSizes = newBaseIndex > 0 ? sizeColumns.slice(0, newBaseIndex) : [];
    const backSizes = newBaseIndex >= 0 ? sizeColumns.slice(newBaseIndex + 1) : [...sizeColumns];
    setGradingDraftZones((prev) => [...prev, {
      key: `grading-zone-${Date.now()}`,
      label: `${prev.length + 1}`,
      sizes: [],
      step: 0,
      frontSizes,
      frontStep: 0,
      backSizes,
      backStep: 0,
      partKeys: [],
      sizeStepColumns: [],
    }]);
  };

  const handleApplyPreset = (presetKey: string) => {
    // 获取当前涉及的部位名
    const targetRows = gradingTargetRowKey === 'batch'
      ? rows.filter((r) => gradingDraftZones.some((z) => (z.partKeys || []).includes(r.key)))
      : rows.filter((r) => r.key === gradingTargetRowKey);
    const partNames = targetRows.map((r) => r.partName);
    const matchedSteps = matchPresetSteps(partNames, presetKey);
    const matchedCount = Object.keys(matchedSteps).length;
    if (matchedCount === 0) return;

    // 将匹配的跳码量应用到对应的跳码区
    setGradingDraftZones((prev) => prev.map((zone) => {
      const zonePartKeys = zone.partKeys || [];
      let updatedFrontStep = zone.frontStep || 0;
      let updatedBackStep = zone.backStep || 0;

      // 取所有匹配部位的跳码量平均值
      const steps: number[] = [];
      for (const pk of zonePartKeys) {
        const row = rows.find((r) => r.key === pk);
        if (row && matchedSteps[row.partName] !== undefined) {
          steps.push(matchedSteps[row.partName]);
        }
      }
      if (steps.length > 0) {
        const avgStep = Number((steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(2));
        updatedFrontStep = avgStep;
        updatedBackStep = avgStep;
      }

      return { ...zone, frontStep: updatedFrontStep, backStep: updatedBackStep };
    }));
  };

  return {
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
  };
};
