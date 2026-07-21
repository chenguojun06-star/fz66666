// ProcessKanbanDrawer 工具函数
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

import { PROCESS_DEFECT_PROBLEMS, STAGE_DEFECT_PROBLEMS } from './ProcessKanbanDrawer.constants';

/**
 * 根据工序名/阶段名获取可选的次品问题列表
 * 优先级：工序名 > 阶段名 > 全部问题（兜底）
 */
export function getDefectProblemsForProcess(processName?: string, progressStage?: string) {
  if (processName && PROCESS_DEFECT_PROBLEMS[processName]) {
    return PROCESS_DEFECT_PROBLEMS[processName];
  }
  if (progressStage && STAGE_DEFECT_PROBLEMS[progressStage]) {
    return STAGE_DEFECT_PROBLEMS[progressStage];
  }
  return Object.values(STAGE_DEFECT_PROBLEMS).flat();
}
