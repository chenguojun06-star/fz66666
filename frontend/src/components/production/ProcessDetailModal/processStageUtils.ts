import { stageAliasMap, carSewingKeywords, tailProcessKeywords } from '@/utils/productionStage';

/**
 * 模块级工序阶段定义（关键词统一从 productionStage.ts 导入，禁止在此处内联数组）
 * 修改关键词请直接修改 frontend/src/utils/productionStage.ts
 */
export const PROCESS_STAGE_DEFS: { key: string; name: string; keywords: string[] }[] = [
  { key: 'procurement',      name: '采购',     keywords: stageAliasMap.procurement || [] },
  { key: 'cutting',          name: '裁剪',     keywords: stageAliasMap.cutting },
  { key: 'secondaryProcess', name: '二次工艺', keywords: stageAliasMap.secondaryProcess },
  { key: 'carSewing',        name: '车缝',     keywords: carSewingKeywords },
  { key: 'tailProcess',      name: '尾部',     keywords: tailProcessKeywords },
  { key: 'warehousing',      name: '入库',     keywords: stageAliasMap.warehousing },
];

/** 将模板节点分类到对应阶段（全局唯一实现，供 workflowNodesByStage 和 renderNormalProcessDetail 共用）*/
export const classifyNodeStage = (progressStage: string, nodeName: string): string => {
  const text = `${progressStage || ''} ${nodeName || ''}`;
  for (const s of PROCESS_STAGE_DEFS) {
    if (s.keywords.some(kw => text.includes(kw))) return s.key;
  }
  return 'tailProcess';
};
