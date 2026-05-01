/**
 * 文件URL工具函数（小程序版）
 *
 * 问题背景：
 *   /api/file/tenant-download/** 需要认证（SecurityConfig.java: .authenticated()）
 *   <image> 标签无法发送 Authorization header，
 *   解决方案：在 URL 上追加 ?token=xxx，TokenAuthFilter 会从 query param 读取并验证。
 *
 * 对应PC端实现：frontend/src/utils/fileUrl.ts → getAuthedFileUrl()
 */

const { getBaseUrl } = require('../config');
const { getToken } = require('./storage');

/**
 * 给文件URL附加认证token，并拼接完整后端地址。
 * 用于 <image src="{{url}}"> 加载受保护文件（tenant-download）。
 *
 * @param {string} fileUrl - 后端返回的文件URL
 *   - 相对路径：/api/file/tenant-download/1/xxx.png
 *   - 完整路径：http://192.168.x.x:8088/api/file/...
 * @returns {string} 可在 <image> 标签直接使用的完整URL
 */
function getAuthedImageUrl(fileUrl) {
  if (!fileUrl) return '';
  const url = String(fileUrl).trim();
  if (!url) return '';

  // 已是完整外部 URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // 拼接后端地址
  const fullUrl = getBaseUrl() + url;

  // tenant-download 端点需要认证，追加 token 查询参数
  if (url.includes('/api/file/tenant-download/')) {
    const token = getToken();
    if (token) {
      const sep = fullUrl.includes('?') ? '&' : '?';
      return fullUrl + sep + 'token=' + encodeURIComponent(token);
    }
  }

  return fullUrl;
}

module.exports = { getAuthedImageUrl };
