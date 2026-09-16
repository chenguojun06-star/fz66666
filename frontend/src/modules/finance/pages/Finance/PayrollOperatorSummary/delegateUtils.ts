/**
 * delegateUtils.ts — 「结算类型」字段（delegateTargetType）的统一判定
 *
 * 背景（D-431 核实）：
 *   后端 `delegate_target_type` 的**权威写入值是大写 `'FACTORY'`**：
 *     - ProductionScanExecutor:613      sr.setDelegateTargetType("FACTORY")
 *     - ScanRecordFactoryBackfillRunner sr.delegate_target_type = 'FACTORY'
 *   而前端历史上按 `'external'` 判断，导致：
 *     · 审核资格判定把 FACTORY 当成"非外发" → 漏拦（未关单也放行）
 *     · 「结算类型」列落到兜底分支 → 显示 "-"
 *   故统一走本 helper，同时接受 external / factory 两种写法。
 *
 * 语义对照（与后端 ProductionScanExecutor 的写入条件一致）：
 *   none / 空   → 自己完成（订单无承做工厂）
 *   internal    → 内部指派（保留兼容；当前后端未写入此值）
 *   external / factory → 外发工厂（订单有承做工厂，须关单后方可审核）
 */

/** 是否为外发工厂（兼容 external / FACTORY 两种写法） */
export const isExternalDelegate = (v: unknown): boolean => {
  const t = String(v ?? '').trim().toLowerCase();
  return t === 'external' || t === 'factory';
};

/** 是否为内部指派（保留兼容） */
export const isInternalDelegate = (v: unknown): boolean => {
  return String(v ?? '').trim().toLowerCase() === 'internal';
};

/** 归一化取值，供 UI 分支使用：'self' | 'internal' | 'external' */
export const normalizeDelegateType = (v: unknown): 'self' | 'internal' | 'external' => {
  if (isExternalDelegate(v)) return 'external';
  if (isInternalDelegate(v)) return 'internal';
  return 'self';
};
