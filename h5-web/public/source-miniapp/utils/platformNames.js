const i18n = require('./i18n/index');

/**
 * 平台编码 → 显示名映射（小程序共享模块，已接入 i18n）
 *
 * 与 PC 端 frontend/src/utils/platform.ts 保持一致，统一短码体系：
 * TB/TM/JD/PDD/DY/XHS/WC/SFY/SY/JST
 *
 * 之前在 dashboard/order-detail、sales/overview、sales/order-list 三处重复定义，
 * 现统一抽到本模块，避免新增平台时遗漏同步。
 */

// ⚠️ 本表仅作**中文对照 / 兜底**（与 PC 端 platform.ts 对齐，便于两端核对）。
//    界面显示请一律走 getPlatformName(code, lang)，它按当前语言取词条。
var PLATFORM_NAME_KEYS = {
  TB: 'tb', TM: 'tm', JD: 'jd', PDD: 'pdd', DY: 'dy',
  XHS: 'xhs', WC: 'wc', SFY: 'sfy', SY: 'sy', JST: 'jst',
};

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
 * 按当前语言取平台名（词条见语言包 common.platform.*）
 * @param {string} code 平台短码（TB/JD/...）
 * @param {string} [lang] 语言；不传则读当前语言
 * @returns {string}
 */
function getPlatformName(code, lang) {
  var c = String(code || '').trim().toUpperCase();
  var key = PLATFORM_NAME_KEYS[c];
  return i18n.t('common.platform.' + (key || 'unknown'), lang);
}

module.exports = {
  PLATFORM_NAMES: PLATFORM_NAMES,
  getPlatformName: getPlatformName,
};
