import { normalizeMatchKey } from './orderBomMetrics';

export function splitOptions(value?: string): string[] {
    if (!value) return [] as string[];
    const text = String(value);
    // 优先按标准分隔符（逗号/中文逗号/顿号/空白）切分。
    // 标准分隔符绝不会出现在码数内部，可以无脑切。
    if (/[,，、\s]/.test(text)) {
        return text.split(/[,，、\s]+/).map(v => v.trim()).filter(Boolean);
    }
    // 退化路径：旧数据用 "/" 拼接（见 buildSizeString 旧实现）。
    // 必须按括号外的 "/" 切，否则码数 "L(170/84)" 会被切成 "L(170" + "84)" 两个碎片，
    // 下单页码数列表会从 6 个变成 11+ 碎片（用户看到的"开发码 16"根因）。
    const result: string[] = [];
    let current = '';
    let depth = 0;
    for (const ch of text) {
        if (ch === '(') { depth++; current += ch; }
        else if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; }
        else if (ch === '/' && depth === 0) {
            if (current.trim()) result.push(current.trim());
            current = '';
        } else { current += ch; }
    }
    if (current.trim()) result.push(current.trim());
    return result;
}

export const mergeDistinctOptions = (...groups: Array<string[] | undefined>): string[] => {
    const result: string[] = [];
    const seen = new Set<string>();
    groups.forEach((group) => {
        (group || []).forEach((item) => {
            const text = String(item || '').trim();
            if (!text) return;
            const key = normalizeMatchKey(text);
            if (seen.has(key)) return;
            seen.add(key);
            result.push(text);
        });
    });
    return result;
};

export const parseSizeColorConfig = (raw: unknown): { sizes: string[]; colors: string[] } => {
    const text = String(raw || '').trim();
    if (!text) return { sizes: [], colors: [] };
    try {
        const config = JSON.parse(text);
        const sizes = Array.isArray(config?.sizes)
            ? config.sizes.map((s: unknown) => String(s || '').trim()).filter(Boolean)
            : [];
        const colors = Array.isArray(config?.colors)
            ? config.colors.map((c: unknown) => String(c || '').trim()).filter(Boolean)
            : [];
        return { sizes, colors };
    } catch {
        return { sizes: [], colors: [] };
    }
};
