/**
 * 文件URL工具函数（租户隔离版本）
 *
 * 新上传的文件URL格式：/api/file/tenant-download/{tenantId}/{uuid}.{ext}
 * 旧文件URL格式：/api/common/download/{uuid}.{ext} 或 /upload/{uuid}.{ext}
 *
 * 因为浏览器 <a href> / <img src> 不会自动带 Authorization header，
 * 需要在 URL 上附加 ?token=xxx 让后端 TokenAuthFilter 识别身份。
 */

/**
 * 给文件URL附加认证 token（用于浏览器直接打开/下载/图片显示）
 *
 * @param fileUrl 后端返回的文件URL（如 /api/file/tenant-download/1/xxx.png）
 * @returns 带 token 参数的完整URL
 */
export function getAuthedFileUrl(fileUrl: string | undefined | null): string {
  if (!fileUrl) return '';
  const url = fileUrl.trim();
  if (!url) return '';

  // 如果已经是完整的外部URL或本地 blob URL，直接返回（不追加 token）
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url;
  }

  const token = localStorage.getItem('authToken');
  if (!token) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * 获取文件的完整后端URL（带认证token，用于内网/跨端口访问）
 * 当前端通过内网 IP 或非 Vite 代理端口访问时，需要拼接后端地址
 *
 * @param fileUrl 后端返回的文件URL
 * @returns 完整URL（含后端地址 + token）
 */
export function getFullAuthedFileUrl(fileUrl: string | undefined | null): string {
  if (!fileUrl) return '';
  const url = fileUrl.trim();
  if (!url) return '';

  // 已经是完整 URL 或本地 blob URL（本地预览），直接返回，不拼接后端地址
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url;
  }

  // 以 /api/ 开头的走 Vite proxy（开发模式 localhost:5173）
  // 内网访问需要直连后端
  const authedUrl = getAuthedFileUrl(url);

  // 只有内网 IP（192.168.x.x / 10.x.x.x / 172.16-31.x.x）才需要直连后端 8088
  // 云托管公网域名和 localhost 均通过 nginx/Vite proxy 转发，使用相对路径即可
  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);
  if (isPrivateIp) {
    return `${window.location.protocol}//${window.location.hostname}:8088${authedUrl}`;
  }

  return authedUrl;
}

/**
 * 触发文件下载（通过创建临时 <a> 标签）
 *
 * @param fileUrl 文件URL
 * @param fileName 可选的下载文件名
 */
export function downloadFile(fileUrl: string, fileName?: string): void {
  const url = getFullAuthedFileUrl(fileUrl);
  if (!url) return;

  // 添加 download=1 参数强制下载
  const downloadUrl = url + (url.includes('?') ? '&' : '?') + 'download=1';

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.target = '_blank';
  if (fileName) {
    link.download = fileName;
  }
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
