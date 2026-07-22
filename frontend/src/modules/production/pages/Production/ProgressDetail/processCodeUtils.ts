import { ProgressNode } from './types';
import { canonicalStageKey } from './stageResolver';

export const STAGE_SORT_ORDER = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

export const isProcessCode = (code: string): boolean => {
  if (!code) return false;
  if (/^[0-9a-f]{8}-/i.test(code)) return false;
  if (['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(code)) return false;
  return /^[\d]+(-[\d]+)*$/.test(code);
};

export const parseProcessCodeSegments = (code: string): (number | string)[] => {
  if (!code) return [];
  return code.split('-').map(segment => {
    const num = parseInt(segment, 10);
    return !isNaN(num) && /^\d+$/.test(segment) ? num : segment;
  });
};

export const compareProcessCodes = (codeA: string, codeB: string): number => {
  const isA = isProcessCode(codeA);
  const isB = isProcessCode(codeB);
  if (isA && !isB) return -1;
  if (!isA && isB) return 1;
  if (!isA && !isB) return 0;
  const segsA = parseProcessCodeSegments(codeA);
  const segsB = parseProcessCodeSegments(codeB);
  const maxLen = Math.max(segsA.length, segsB.length);
  for (let i = 0; i < maxLen; i++) {
    const a = segsA[i];
    const b = segsB[i];
    if (a === undefined && b !== undefined) return -1;
    if (a !== undefined && b === undefined) return 1;
    if (typeof a === 'number' && typeof b === 'number') {
      if (a !== b) return a - b;
    } else if (typeof a === 'number') {
      return -1;
    } else if (typeof b === 'number') {
      return 1;
    } else {
      const cmp = String(a).localeCompare(String(b));
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
};

export const sortNodesByProcessCode = (nodes: ProgressNode[]): ProgressNode[] => {
  return [...nodes].sort((a, b) => {
    const codeA = String(a.id || '').trim();
    const codeB = String(b.id || '').trim();
    const codeCmp = compareProcessCodes(codeA, codeB);
    if (codeCmp !== 0) return codeCmp;
    const stageA = a.progressStage || canonicalStageKey(a.name) || '';
    const stageB = b.progressStage || canonicalStageKey(b.name) || '';
    const idxA = STAGE_SORT_ORDER.indexOf(stageA);
    const idxB = STAGE_SORT_ORDER.indexOf(stageB);
    const sortA = idxA >= 0 ? idxA : STAGE_SORT_ORDER.length;
    const sortB = idxB >= 0 ? idxB : STAGE_SORT_ORDER.length;
    if (sortA !== sortB) return sortA - sortB;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
};
