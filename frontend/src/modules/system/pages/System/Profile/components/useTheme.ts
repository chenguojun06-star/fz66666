import { useState, useRef, useEffect } from 'react';
import { App } from 'antd';
import { FALLBACK_THEME, applyThemeToDocument, getUserThemeKey, resolveInitialTheme } from './theme';

const useTheme = (userId?: string | number) => {
    const { message } = App.useApp();
    const [theme, setTheme] = useState<string>(() => resolveInitialTheme(userId));

    const userIdRef = useRef(userId);
    userIdRef.current = userId;

    useEffect(() => {
        applyThemeToDocument(theme);
    }, [theme]);

    const onThemeChange = (next: string) => {
        const v = String(next || '').trim() || FALLBACK_THEME;
        setTheme(v);
        applyThemeToDocument(v);
        try {
            const themeKey = getUserThemeKey(userIdRef.current);
            localStorage.setItem(themeKey, v);
            localStorage.setItem('app.theme', v);
            window.dispatchEvent(new Event('theme-change'));
        } catch {
            // ignore
        }
        message.success('主题已切换');
    };

    return {
        theme,
        onThemeChange,
    };
};

export default useTheme;
