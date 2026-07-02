/**
 * 小程序全局配置
 * 注：统一使用 config.js 中的 DEBUG_MODE 作为唯一调试开关
 * 本文件保留是因为 5 个 utils 模块仍通过 require('../config/debug') 引用
 */

// 从主配置文件获取调试模式（ES module → CommonJS 适配）
let DEBUG_MODE_VALUE = false;
try {
  // config.js 使用 ES export，在 require 环境中可能需要 fallback
  const mainConfig = require('../config.js');
  DEBUG_MODE_VALUE = mainConfig.DEBUG_MODE !== undefined ? mainConfig.DEBUG_MODE : false;
} catch (e) {
  // fallback: 生产环境默认关闭调试
  DEBUG_MODE_VALUE = false;
}

module.exports = {
  /**
   * 是否开启调试模式（统一来源：config.js → DEBUG_MODE）
   * 生产环境请在 config.js 中设置 DEBUG_MODE = false
   */
  DEBUG: DEBUG_MODE_VALUE,

  /**
   * 请求超时时间（毫秒）
   */
  REQUEST_TIMEOUT: 10000,

  UPLOAD_TIMEOUT: 30000,

  REQUEST_RETRY_COUNT: 2,
};
