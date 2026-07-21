// 应用入口全局初始化辅助函数
// 从 main.tsx 拆分：噪音屏蔽 / chunk 错误恢复 / 主题工具 / 外部错误判定

// 屏蔽腾讯云 CloudBase 宿主环境注入的 SDK 噪音日志
// 这些日志与业务无关（CloudBase 客户端DB SDK尝试初始化但找不到配置，正常现象）
export function suppressCloudBaseNoise() {
  const NOISE = ['[lite]', '@@ multi_tenant', '[ASSERT]', 'single-spa minified', 'res_test'];
  const wrap = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (NOISE.some(k => msg.includes(k))) return;
    fn.apply(console, args);
  };
  console.log  = wrap(console.log.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.info = wrap(console.info.bind(console));
}

// ── 动态分包 404 自动恢复 ──────────────────────────────────────────────
// 场景：新部署后浏览器缓存了旧主 bundle，旧 bundle 里的 dynamic import 路径
//       指向旧 hash chunk（已被新部署替换），导致 ERR_ABORTED 404。
// 修复：检测到 chunk load 失败时，在同一 URL 追加 ?reload=1 强刷一次。
//       通过 sessionStorage 防止无限循环（同一会话只自动刷新一次）。
export function handleChunkLoadError() {
  const RELOAD_KEY = '__chunk_reload__';
  const LAST_RELOAD_KEY = '__chunk_reload_ts__';
  const RELOAD_COOLDOWN_MS = 30_000;
  const CHUNK_ERR_PATTERNS = [
    'dynamically imported module',
    'Failed to fetch',
    'Importing a module script failed',
    'error loading dynamically imported module',
  ];
  const isChunkError = (msg: string) => CHUNK_ERR_PATTERNS.some(p => msg.includes(p));

  const tryReload = () => {
    if (sessionStorage.getItem(RELOAD_KEY)) return;
    const lastTs = Number(sessionStorage.getItem(LAST_RELOAD_KEY) || '0');
    if (Date.now() - lastTs < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
    sessionStorage.setItem(RELOAD_KEY, '1');
    window.location.reload();
  };

  window.addEventListener('error', (event) => {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName ?? '';
    const src = tagName === 'SCRIPT' ? (target as HTMLScriptElement).src
      : tagName === 'LINK' ? (target as HTMLLinkElement).href : '';
    const msg = event.message ?? '';
    if ((src.includes('/assets/') && (tagName === 'SCRIPT' || tagName === 'LINK'))
        || isChunkError(msg)) {
      tryReload();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event.reason?.message ?? event.reason ?? '');
    if (isChunkError(msg)) {
      tryReload();
    }
  });

  const origFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    return origFetch.apply(this, [input, init]).catch(err => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
      if (url.includes('/assets/')) {
        tryReload();
      }
      throw err;
    });
  };
}

// ── 主题相关常量与工具 ──────────────────────────────────────────────
export const themeStorageKey = 'app.theme';
export const fallbackTheme = 'white';

export const applyTheme = (themeValue: string | null) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const raw = String(themeValue || '').trim();
  const resolvedTheme = !raw || raw === 'default' ? fallbackTheme : raw;
  root.setAttribute('data-theme', resolvedTheme);
};

// ── 外部错误屏蔽（浏览器扩展等） ──────────────────────────────────
export const shouldSuppressExternalError = (message: string, filename?: string, stack?: string) => {
  const msg = String(message || '').trim();
  const file = String(filename || '').trim();
  const st = String(stack || '').trim();
  if (!msg) return false;

  if (msg.includes('No checkout popup config found')) return true;

  const isExtension =
    file.startsWith('chrome-extension://') ||
    file.startsWith('moz-extension://') ||
    st.includes('chrome-extension://') ||
    st.includes('moz-extension://');

  if (isExtension && msg.includes('A listener indicated an asynchronous response')) return true;
  return false;
};
