/**
 * 主题相关常量与纯函数（helpers）
 */

export const FALLBACK_THEME = 'white';

export const THEME_OPTIONS = [
    { value: 'white', label: '默认主题（纯白）' },
    { value: 'blue', label: '经典蓝主题（深蓝侧栏）' },
    { value: 'lightblue', label: '浅蓝主题（浅色）' },
    { value: 'dark', label: '深色主题（雾黑）' },
];

export const getUserThemeKey = (userId?: string | number): string => {
    const id = String(userId || '').trim();
    return id ? `app.theme.user.${id}` : 'app.theme';
};

export const applyThemeToDocument = (nextTheme: string): void => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const t = String(nextTheme || '').trim();
    const resolvedTheme = !t || t === 'default' ? FALLBACK_THEME : t;
    root.setAttribute('data-theme', resolvedTheme);
};

export const resolveInitialTheme = (userId?: string | number): string => {
    try {
        const savedTheme = String(localStorage.getItem(getUserThemeKey(userId)) || '').trim();
        return !savedTheme || savedTheme === 'default' ? FALLBACK_THEME : savedTheme;
    } catch {
        return FALLBACK_THEME;
    }
};
