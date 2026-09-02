/**
 * 文件URL工具函数（租户隔离版本）
 *
 * 新上传的文件URL格式：/api/file/tenant-download/{tenantId}/{uuid}.{ext}
 * 旧文件URL格式：/api/common/download/{uuid}.{ext} 或 /upload/{uuid}.{ext}
 *
 * 因为浏览器 <a href> / <img loading="lazy" src> 不会自动带 Authorization header，
 * 需要在 URL 上附加 ?token=xxx 让后端 TokenAuthFilter 识别身份。
 */

const isViteDevServerRequest = (): boolean => {
  try {
    return window.location.port === '5173';
  } catch {
    return false;
  }
};

let _cachedToken: string | null = null;
let _tokenCacheTs = 0;
const TOKEN_CACHE_TTL_MS = 5_000;

function getCachedToken(): string | null {
  const now = Date.now();
  if (_cachedToken !== null && now - _tokenCacheTs < TOKEN_CACHE_TTL_MS) {
    return _cachedToken;
  }
  try {
    const fresh = localStorage.getItem('authToken');
    if (fresh) {
      _cachedToken = fresh;
      _tokenCacheTs = now;
      return fresh;
    }
  } catch {
    _cachedToken = null;
  }
  _tokenCacheTs = now;
  return _cachedToken;
}

export function invalidateFileUrlTokenCache(): void {
  _cachedToken = null;
  _tokenCacheTs = 0;
}

/**
 * 给文件URL附加认证 token（用于浏览器直接打开/下载/图片显示）
 *
 * @param fileUrl 后端返回的文件URL（如 /api/file/tenant-download/1/xxx.png）
 * @returns 带 token 参数的完整URL
 */
export function getAuthedFileUrl(fileUrl: string | undefined | null): string {
  if (!fileUrl) return '';
  let url = fileUrl.trim();
  if (!url) return '';

  // D-FIX：纯文件名（如 430348a1-dbcd-4aaf-...-af99bfb4ae81.png）自动补全为合法下载路径
  // 避免数据库只存了 uuid 没存 /api/common/download/ 前缀时，
  // <img src="uuid.png"> 被当作相对路径 → 浏览器请求 /uuid.png → 后端 401/404
  const isPureFilename = !url.includes('/')
    && !url.startsWith('http://') && !url.startsWith('https://')
    && !url.startsWith('blob:') && !url.startsWith('data:');
  if (isPureFilename) {
    url = `/api/common/download/${url}`;
  }

  const token = getCachedToken();
  if (!token) return url;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url, window.location.origin);
      const isFileApi = parsed.pathname.startsWith('/api/file/tenant-download/') || parsed.pathname.startsWith('/api/common/download/');
      if (!isFileApi) {
        return url;
      }
      if (!parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', token);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

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

  // 完整 URL 仍需补 token；blob 直接返回
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return getAuthedFileUrl(url);
  }

  // 以 /api/ 开头的优先走当前站点代理
  const authedUrl = getAuthedFileUrl(url);
  if (isViteDevServerRequest()) {
    return authedUrl;
  }

  // 只有内网 IP（192.168.x.x / 10.x.x.x / 172.16-31.x.x）才需要直连后端 8088
  // 云托管公网域名和 localhost 均通过 nginx/Vite proxy 转发，使用相对路径即可
  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);
  if (isPrivateIp) {
    return `${window.location.protocol}//${window.location.hostname}:8088${authedUrl}`;
  }

  return authedUrl;
}

/**
 * 判断两个文件URL是否指向同一文件：剥离 token 等查询参数与站点前缀后比较。
 *
 * 背景：设置主图徽标此前按"列表第一张"判定，设为主图成功后界面毫无变化；
 * 修为按 coverUrl 比对后，一边是 DB 裸路径、一边是带 token 的展示 URL，
 * 直接 === 永不相等，因此必须剥查询参数再比。
 */
export function isSameFileUrl(a: string | undefined | null, b: string | undefined | null): boolean {
  const strip = (raw: string | undefined | null): string => {
    let url = String(raw || '').trim();
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    try {
      const parsed = new URL(url, window.location.origin);
      url = parsed.pathname;
    } catch {
      // 相对路径不带协议时 URL 解析也可能失败，退化为手工剥离查询串
      url = url.split('?')[0];
    }
    // 统一剥掉站点/后端前缀，只留可标识文件的尾段
    const marker = url.lastIndexOf('/api/');
    if (marker >= 0) url = url.slice(marker);
    return url.replace(/\/+$/, '');
  };
  const pa = strip(a);
  const pb = strip(b);
  return !!pa && !!pb && pa === pb;
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

/**
 * 触发 Blob 下载（通过创建临时 <a> 标签，自动释放 URL）
 *
 * @param blob Blob 对象
 * @param fileName 下载文件名
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
