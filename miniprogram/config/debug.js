/**
 * 小程序全局配置
 * 注：统一使用 config.js 中的 DEBUG_MODE 作为唯一调试开关
 * 本文件保留是因为 5 个 utils 模块仍通过 require('../config/debug') 引用
 */

// 从主配置文件获取调试模式（ES module → CommonJS 适配）
let DEBUG_MODE_VALUE = true;
try {
  // config.js 使用 ES export，在 require 环境中可能需要 fallback
  const mainConfig = require('../config.js');
  DEBUG_MODE_VALUE = mainConfig.DEBUG_MODE !== undefined ? mainConfig.DEBUG_MODE : true;
} catch (e) {
  // fallback: 开发环境默认开启调试
  DEBUG_MODE_VALUE = true;
}

module.exports = {
  /**
   * 是否开启调试模式（统一来源：config.js → DEBUG_MODE）
   * 生产环境请在 config.js 中设置 DEBUG_MODE = false
   */
  DEBUG: DEBUG_MODE_VALUE,

  /**
   * API 基础地址（仅作参考，实际地址以 config.js → getBaseUrl() 为准）
   * 默认使用局域网IP支持内网访问，如连接失败请在登录页手动输入 localhost:8088
   */
  API_BASE_URL: 'http://192.168.1.17:8088',

  /**
   * 请求超时时间（毫秒）
   */
  REQUEST_TIMEOUT: 10000,

  /**
   * 请求重试次数
   */
  REQUEST_RETRY_COUNT: 2,
};
