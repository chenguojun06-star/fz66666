/**
 * URL 参数解码工具
 *
 * 为什么需要它（2026-09-22 真实事故）：
 *   小程序页面跳转 `wx.navigateTo({ url: '/pages/x/index?a=' + encodeURIComponent(v) })` 时，
 *   接收页 `onLoad(options)` 拿到的 `options.a` **是编码后的原样字符串** ——
 *   小程序 **不会**自动解码（项目里 finished-inventory/detail 也是自己 decode 的）。
 *
 *   漏解码的后果非常隐蔽：值里含中文/空格/& 时，界面上会显示
 *   `M%E6%A3%89%E5%B8%83-140CM-%E7%B2%89%E8%89%B2` 这种乱码，
 *   再拿它去查询就是"记录不存在"，且**不报错**，极难定位。
 *
 * 用法：
 *   const { decodeParam } = require('../../utils/urlParams');
 *   onLoad(options) { this.setData({ code: decodeParam(options.code) }); }
 *
 * ⚠️ 用 try/catch 包住：万一遇到残缺的 `%` 转义（如值里本身有裸 `%`），
 *    decodeURIComponent 会抛 URIError，宁可原样返回也不要把整页搞崩。
 */

/**
 * 安全解码 URL 参数
 * @param {*} v 原始值（可为 undefined / null / 非字符串）
 * @returns {string} 解码后的字符串；解不开时原样返回
 */
function decodeParam(v) {
  if (v == null) return '';
  var s = String(v);
  if (!s) return '';
  // 没有转义序列就不必解码，也避免对裸 % 误抛
  if (s.indexOf('%') === -1) return s;
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

module.exports = {
  decodeParam: decodeParam,
};
