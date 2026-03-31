/**
 * 全局阶段节点统一配色常量
 *
 * 所有父子节点（采购/裁剪/车缝/二次工艺/尾部/入库）共享同一套中性专业配色，
 * 不再按阶段分配不同颜色。修改此文件即可全局生效。
 */

/** 主色：charcoal-slate，用于节点标识、文字、边框强调 */
export const STAGE_ACCENT = '#4b5563';

/** 浅底色：极淡灰，用于 header/card 背景 */
export const STAGE_ACCENT_LIGHT = '#f7f8f9';

/** 边框色：浅灰，用于分隔线、边框 */
export const STAGE_BORDER = '#e5e7eb';

/** 启用/激活状态蓝（Ant Design 标准蓝） */
export const STAGE_ACTIVE = '#1677ff';

/** 辉光色：用于卡片悬停/选中发光效果 */
export const STAGE_GLOW = 'rgba(75, 85, 99, 0.15)';
