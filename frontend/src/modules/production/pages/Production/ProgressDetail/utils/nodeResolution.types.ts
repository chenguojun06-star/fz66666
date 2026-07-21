// 节点解析相关类型定义
// 从 nodeResolution.ts 拆分而来，仅包含内部类型

export type SubProcessRemapItem = {
  id?: string;
  name?: string;
  originalName?: string;
  [k: string]: unknown;
};

export type SubProcessRemapStage = {
  enabled?: boolean;
  subProcesses?: SubProcessRemapItem[];
  [k: string]: unknown;
};

export type SubProcessRemap = Record<string, SubProcessRemapStage>;
