import { useState, useCallback } from 'react';
import type { CuttingCreateTaskState } from '../hooks';

export interface MatrixInputApi {
  matrixColors: string[];
  matrixSizes: string[];
  colorInput: string;
  sizeInput: string;
  setColorInput: (v: string) => void;
  setSizeInput: (v: string) => void;
  addMatrixColor: () => void;
  addMatrixSize: () => void;
  removeMatrixColor: (c: string) => void;
  removeMatrixSize: (s: string) => void;
  handleMatrixImport: () => void;
}

export function useMatrixInput(createTask: CuttingCreateTaskState): MatrixInputApi {
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');

  const addMatrixColor = useCallback(() => {
    const v = colorInput.trim();
    if (!v || matrixColors.includes(v)) { setColorInput(''); return; }
    setMatrixColors((prev) => [...prev, v]);
    setColorInput('');
  }, [colorInput, matrixColors]);

  const addMatrixSize = useCallback(() => {
    const v = sizeInput.trim();
    if (!v || matrixSizes.includes(v)) { setSizeInput(''); return; }
    setMatrixSizes((prev) => [...prev, v]);
    setSizeInput('');
  }, [sizeInput, matrixSizes]);

  const removeMatrixColor = useCallback((c: string) => {
    setMatrixColors((prev) => prev.filter((x) => x !== c));
  }, []);

  const removeMatrixSize = useCallback((s: string) => {
    setMatrixSizes((prev) => prev.filter((x) => x !== s));
  }, []);

  const handleMatrixImport = useCallback(() => {
    if (matrixColors.length === 0 || matrixSizes.length === 0) return;
    // 生成 颜色×码数 组合行，数量留空由用户填写
    const newLines: { color: string; size: string; quantity: number | null }[] = [];
    for (const c of matrixColors) {
      for (const s of matrixSizes) {
        newLines.push({ color: c, size: s, quantity: null });
      }
    }
    createTask.setCreateOrderLines((prev) => {
      const filled = prev.filter((l) => l.color || l.size || l.quantity);
      return [...(filled.length ? filled : []), ...newLines];
    });
    setMatrixColors([]);
    setMatrixSizes([]);
  }, [matrixColors, matrixSizes, createTask]);

  return {
    matrixColors,
    matrixSizes,
    colorInput,
    sizeInput,
    setColorInput,
    setSizeInput,
    addMatrixColor,
    addMatrixSize,
    removeMatrixColor,
    removeMatrixSize,
    handleMatrixImport,
  };
}
