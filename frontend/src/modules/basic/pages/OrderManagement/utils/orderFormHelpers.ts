import { normalizeMatchKey } from './orderBomMetrics';

export function splitOptions(value?: string): string[] {
    if (!value) return [] as string[];
    return value
        .split(/[,/，、\s]+/)
        .map(v => v.trim())
        .filter(Boolean);
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
