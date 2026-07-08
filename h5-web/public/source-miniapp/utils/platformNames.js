/**
 * 平台编码 → 中文名映射（小程序共享模块）
 *
 * 与 PC 端 frontend/src/utils/platform.ts 保持一致，统一短码体系：
 * TB/TM/JD/PDD/DY/XHS/WC/SFY/SY/JST
 *
 * 之前在 dashboard/order-detail、sales/overview、sales/order-list 三处重复定义，
 * 现统一抽到本模块，避免新增平台时遗漏同步。
 */

var PLATFORM_NAMES = {
  TB: '淘宝',
  TM: '天猫',
  JD: '京东',
  PDD: '拼多多',
  DY: '抖音',
  XHS: '小红书',
  WC: '微信小店',
  SFY: 'Shopify',
  SY: '希音',
  JST: '聚水潭',
};

/**
 * 根据平台短码获取中文名，未知平台返回中文"未知"（不返回原英文 code，避免给用户展示英文）
 * @param {string} code 平台短码（TB/JD/...）
 * @returns {string}
 */
function getPlatformName(code) {
  var c = String(code || '').trim();
  if (!c) return '';
  return PLATFORM_NAMES[c] || '未知';
}

module.exports = {
  PLATFORM_NAMES: PLATFORM_NAMES,
  getPlatformName: getPlatformName,
};
