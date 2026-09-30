import { buildBaseColumns } from './columnsBase';
import { buildQualityColumns } from './columnsQuality';
import { buildActionColumns } from './columnsAction';
import type { BuildColumnsParams } from './warehousingColumnsTypes';

/** 兼容旧引用路径：类型已移至 ./warehousingColumnsTypes（避免子文件反向依赖本文件） */
export type { BuildColumnsParams } from './warehousingColumnsTypes';

export function buildColumns(params: BuildColumnsParams) {
  return [
    ...buildBaseColumns(params),
    ...buildQualityColumns(params),
    ...buildActionColumns(params),
  ];
}
