/**
 * 客户等级展示（D-736）
 *
 * 等级改为数字分级：1~5 级（1级最高），存储值为 '1'~'5'。
 * 兼容迁移前的存量值：VIP → 1级，NORMAL → 3级。
 */
const LEGACY_LEVEL_MAP = { VIP: '1', NORMAL: '3' };
const VALID_LEVELS = ['1', '2', '3', '4', '5'];

/**
 * 等级 → 展示文案（如「1级客户」）；未分级显示「未分级」。
 * @param {string|null} v customerLevel 原始值
 * @returns {string}
 */
export function customerLevelText(v) {
  if (!v) return '未分级';
  const lv = LEGACY_LEVEL_MAP[v] || v;
  return VALID_LEVELS.includes(String(lv)) ? `${lv}级客户` : '未分级';
}

/** 是否最高等级（1级）——门户首页可据此显示「⭐」标记 */
export function isTopLevel(v) {
  if (!v) return false;
  const lv = LEGACY_LEVEL_MAP[v] || v;
  return String(lv) === '1';
}
