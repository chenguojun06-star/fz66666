/**
 * 样式信息 BOM Tab 相关类型定义。
 *
 * 单独成文件的原因：`useBomCompletionHandlers` 需要引用 `BomRecognizedItem`，
 * 若该类型仍定义在 `useStyleBomTabData` 中，会形成 hooks 之间的循环依赖。
 */

/** AI 识别出的 BOM 物料项 */
export interface BomRecognizedItem {
  id: string;
  materialName: string;
  materialCode?: string;
  specification?: string;
  usageAmount?: number;
  partName?: string;
  subPartName?: string;
}
