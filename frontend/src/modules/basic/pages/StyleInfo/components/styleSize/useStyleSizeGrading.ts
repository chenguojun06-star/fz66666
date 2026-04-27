import { useState } from 'react';
import { toNumberSafe } from '@/utils/api';
import {
  GradingZone,
  MatrixRow,
  createGradingZone,
  normalizeGradingZones,
} from './shared';

interface Params {
  rows: MatrixRow[];
  sizeColumns: string[];
  selectedRowKeys: React.Key[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  setSelectedRowKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  message: { error: (msg: string) => void; warning: (msg: string) => void };
}

export function useStyleSizeGrading({
  rows,
  sizeColumns,
  selectedRowKeys,
  setRows,
  setSelectedRowKeys,
  message,
}: Params) {
  const [gradingConfigOpen, setGradingConfigOpen] = useState(false);
  const [gradingTargetRowKey, setGradingTargetRowKey] = useState('');
  const [gradingDraftBaseSize, setGradingDraftBaseSize] = useState('');
  const [gradingDraftZones, setGradingDraftZones] = useState<GradingZone[]>([]);

  const applyGradingToRow = (row: MatrixRow): MatrixRow => {
    if (!sizeColumns.length) return row;
    const baseSize = sizeColumns.includes(String(row.baseSize || '').trim())
      ? String(row.baseSize).trim()
      : '';
    const baseIndex = sizeColumns.indexOf(baseSize);
    if (baseIndex < 0) return { ...row, baseSize };
    const zones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
    if (!zones.length) {
      return { ...row, baseSize, gradingZones: [] };
    }
    const baseValue = toNumberSafe(row.cells[baseSize]?.value);
    const getStepForSize = (sizeName: string): number => {
      for (const zone of zones) {
        if ((zone.frontSizes || []).includes(sizeName)) return toNumberSafe(zone.frontStep);
        if ((zone.backSizes || []).includes(sizeName)) return toNumberSafe(zone.backStep);
        for (const col of zone.sizeStepColumns || []) {
          if ((col.sizes || []).includes(sizeName)) return toNumberSafe(col.step);
        }
      }
      return 0;
    };
    const nextCells = { ...row.cells };
    nextCells[baseSize] = { ...(nextCells[baseSize] || { value: 0 }), value: baseValue };
    for (let index = 0; index < sizeColumns.length; index += 1) {
      if (index === baseIndex) continue;
      const currentSize = sizeColumns[index];
      const step = getStepForSize(currentSize);
      const distance = Math.abs(index - baseIndex);
      const value = index < baseIndex ? baseValue - step * distance : baseValue + step * distance;
      nextCells[currentSize] = {
        ...(nextCells[currentSize] || { value: 0 }),
        value: Number(value.toFixed(2)),
      };
    }
    return { ...row, baseSize, gradingZones: zones, cells: nextCells };
  };

  const updateBaseSize = (rowKey: string, baseSize: string) => {
    setRows((prev) => prev.map((row) => (
      row.key === rowKey ? applyGradingToRow({ ...row, baseSize: String(baseSize || '').trim() }) : row
    )));
  };

  const openGradingConfig = (row: MatrixRow) => {
    setGradingTargetRowKey(row.key);
    const baseSize = row.baseSize || '';
    setGradingDraftBaseSize(baseSize);
    const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
    const defaultFrontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
    const defaultBackSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
    const existingZones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
    if (existingZones.length > 0) {
      setGradingDraftZones(existingZones.map((z) => ({
        ...z,
        frontSizes: (z.frontSizes || []).length > 0 ? z.frontSizes : defaultFrontSizes,
        backSizes: (z.backSizes || []).length > 0 ? z.backSizes : defaultBackSizes,
        partKeys: [row.key],
      })));
    } else {
      setGradingDraftZones([
        createGradingZone([], '1', [row.key], defaultFrontSizes, defaultBackSizes),
      ]);
    }
    setGradingConfigOpen(true);
  };

  const openBatchGradingConfig = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要配置的部位');
      return;
    }
    setGradingTargetRowKey('batch');
    const firstSelectedRow = rows.find((r) => selectedRowKeys.includes(r.key));
    const baseSize = firstSelectedRow?.baseSize || '';
    setGradingDraftBaseSize(baseSize);
    const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
    const frontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
    const backSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
    setGradingDraftZones([
      createGradingZone([], '1', selectedRowKeys.map(String), frontSizes, backSizes),
    ]);
    setGradingConfigOpen(true);
  };

  const applyGradingDraft = () => {
    const targetKey = gradingTargetRowKey;
    if (!targetKey) return;
    if (!gradingDraftBaseSize || !sizeColumns.includes(gradingDraftBaseSize)) {
      message.error('请先选择样版码');
      return;
    }
    if (targetKey === 'batch') {
      setRows((prev) => prev.map((row) => {
        const matchingZones = gradingDraftZones.filter((zone) => (zone.partKeys || []).includes(row.key));
        if (matchingZones.length === 0) return row;
        return applyGradingToRow({
          ...row,
          baseSize: gradingDraftBaseSize,
          gradingZones: matchingZones.map((z) => ({
            key: z.key,
            label: z.label,
            sizes: z.sizes || [],
            step: z.step || 0,
            frontSizes: z.frontSizes || [],
            frontStep: z.frontStep || 0,
            backSizes: z.backSizes || [],
            backStep: z.backStep || 0,
            sizeStepColumns: z.sizeStepColumns || [],
          })),
        });
      }));
      setSelectedRowKeys([]);
    } else {
      setRows((prev) => prev.map((row) => (
        row.key === targetKey
          ? applyGradingToRow({
              ...row,
              baseSize: gradingDraftBaseSize,
              gradingZones: normalizeGradingZones(gradingDraftZones, sizeColumns),
            })
          : row
      )));
    }
    setGradingConfigOpen(false);
    setGradingTargetRowKey('');
  };

  const closeGradingConfig = () => {
    setGradingConfigOpen(false);
    setGradingTargetRowKey('');
  };

  return {
    gradingConfigOpen,
    gradingTargetRowKey,
    gradingDraftBaseSize,
    gradingDraftZones,
    setGradingDraftBaseSize,
    setGradingDraftZones,
    updateBaseSize,
    openGradingConfig,
    openBatchGradingConfig,
    applyGradingDraft,
    closeGradingConfig,
  };
}
