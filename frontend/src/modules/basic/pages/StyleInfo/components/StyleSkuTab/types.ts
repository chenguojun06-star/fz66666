import type { ProductSku } from '@/types/style';

export type SkuMode = 'AUTO' | 'MANUAL';

export type EditingData = Record<number | string, Partial<ProductSku>>;

export interface StyleSkuTabProps {
  styleId: string;
  styleNo: string;
  skc?: string;
  skuMode?: SkuMode;
  useSkuPrefix?: boolean | number;
  onModeChange?: (mode: SkuMode) => void;
  onRefresh?: () => void;
  refreshTrigger?: number;
}
