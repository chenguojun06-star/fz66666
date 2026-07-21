import type { StyleBom } from '@/types/style';

// 复用 styleBom 已有的纯函数，避免重复实现
export {
  isZipperMaterial,
  isCountLikeUnit,
  isMeterPatternMaterial,
  resolvePatternUnit,
  parseNumberMap,
} from '../styleBom/helpers';

/** 各码用量表格行 */
export type PatternMaterialRow = {
  id: string;
  bomId: string | number;
  bom: StyleBom;
};

/** 款式码色配置（来自基本信息） */
export interface SizeColorConfigInput {
  sizes: string[];
  colors: string[];
  quantities: number[];
  commonSizes?: string[];
  commonColors?: string[];
}
