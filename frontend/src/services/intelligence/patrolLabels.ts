/**
 * AI 巡检工单类型/目标 中文标签（共享唯一权威）。
 *
 * 背景：useAiPatrol 与 PatrolActionCenter 各维护了一份映射且已漂移——
 * 面板显示 "DELAY: …"、"STAGNANT: …" 原始英文码（用户看不懂），
 * 工单中心 D-513 补过一批但两边不同步。现统一到本文件，两处都从这里引用。
 *
 * 补充来源：
 *  - D-513 按 t_ai_patrol_action 实际取值补齐的一批
 *  - 巡检 Job / MindPushOrchestrator / LogisticsTrackingOrchestrator 代码里实际产出的类型
 */
export const PATROL_ISSUE_TYPE_LABELS: Record<string, string> = {
  DEADLINE_RISK: '交期风险',
  DELIVERY_RISK: '交期风险预警',
  FACTORY_SILENCE: '工厂沉默',
  QUALITY_SPIKE: '质量异常',
  QUALITY: '质量异常',
  QUALITY_RETURN: '质量退货',
  STAGNANT: '进度停滞',
  STAGNANT_ORDER: '订单停滞',
  NODE_STAGNANT: '工序停滞',
  CORRELATED_RISK: '多重风险',
  MATERIAL_GAP: '物料缺口',
  MATERIAL: '物料异常',
  MATERIAL_SHORT: '物料短缺',
  MATERIAL_DIFF: '物料差异',
  MATERIAL_LOW: '面料到货率低',
  WAREHOUSE_DIFF: '入库差异',
  SOURCING_SPECIALIST_JOB: '采购专家',
  PURCHASE_OVERDUE: '采购逾期',
  PAYROLL: '工资异常',
  PAYROLL_ANOMALY: '工资异常',
  PAYROLL_READY: '工资可结算',
  OUTSOURCE_TIMEOUT: '外发超时',
  COMBO_RISK: '套装风险',
  // D-656：原「裁剪积压」与描述"裁剪完成已超48h但车缝未开始"自相矛盾——积压发生在裁剪之后（裁片待车缝）
  CUTTING_BACKLOG: '裁剪后积压',
  LOW_ADOPTION_RATE: '建议采纳率偏低',
  FACTORY_BOTTLENECK: '工厂瓶颈',
  DELAY: '交期延误',
  INVENTORY_BACKLOG: '库存积压',
  STOCK_AGING: '呆滞库存',
  MORNING_BRIEF: '晨间简报',
  COST_OVERRUN: '成本超支',
  DELIVERY_EXCEPTION: '交付出库异常',
  DELIVERY_UNLIKELY: '交期不乐观',
  EXCHANGE_RATE: '汇率波动',
  FABRIC_PRICE: '面料价格波动',
  PRODUCTION_DELAY: '生产延误',
  COLLAB_TASK_OVERDUE: '协作任务逾期',
  OVERDUE: '逾期',
  MISSING: '数据缺失',
  DELIVERY: '交付异常',
  // 样衣开发巡检（AiPatrolJob）
  SAMPLE_OVERDUE: '样衣逾期',
  SAMPLE_STAGNANT: '样衣停滞',
  SAMPLE_PENDING_TOO_LONG: '样衣待审过久',
  SAMPLE_REVIEW_DELAYED: '样衣审核拖延',
};

/** 目标类型中文名（targetType 原值为 order / factory 等英文） */
export const PATROL_TARGET_TYPE_LABELS: Record<string, string> = {
  order: '订单',
  factory: '工厂',
  tenant: '租户',
  scene: '场景',
  style: '款号',
  pattern: '样衣',
  patternTask: '样衣',
  material: '物料',
  worker: '工人',
  customer: '客户',
  supplier: '供应商',
  warehouse: '仓库',
};
