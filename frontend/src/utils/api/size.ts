/**
 * 尺码相关工具函数
 */

export const compareSizeAsc = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();
  const parse = (v: unknown) => {
    const raw = norm(v);
    if (!raw || raw === '-') return { rank: 9999, num: 0, raw };
    if (raw === '均码' || raw === 'ONE SIZE' || raw === 'ONESIZE') return { rank: 55, num: 0, raw };
    if (/^\d+(\.\d+)?$/.test(raw)) return { rank: 0, num: Number(raw), raw };
    const mNumXL = raw.match(/^(\d+)XL$/);
    if (mNumXL) return { rank: 70 + (Number(mNumXL[1]) - 1) * 10, num: 0, raw };
    const mXS = raw.match(/^(X{0,4})S$/);
    if (mXS) return { rank: 40 - (mXS[1]?.length || 0) * 10, num: 0, raw };
    if (raw === 'S') return { rank: 40, num: 0, raw };
    if (raw === 'M') return { rank: 50, num: 0, raw };
    const mXL = raw.match(/^(X{1,4})L$/);
    if (mXL) return { rank: 60 + (mXL[1]?.length || 0) * 10, num: 0, raw };
    if (raw === 'L') return { rank: 60, num: 0, raw };
    if (raw === 'XL') return { rank: 70, num: 0, raw };
    if (raw === 'XXL') return { rank: 80, num: 0, raw };
    if (raw === 'XXXL') return { rank: 90, num: 0, raw };
    return { rank: 5000, num: 0, raw };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.rank !== pb.rank) return pa.rank - pb.rank;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return String(pa.raw).localeCompare(String(pb.raw), 'zh-Hans-CN', { numeric: true });
};

export const sortSizeNames = (sizes: string[]) => {
  const getKey = (name: string): { group: number; a: number; b: string | number; unit: string } => {
    const t = String(name || '').trim();
    const order = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
    const upper = t.toUpperCase();

    // 标准尺码
    const idx = order.indexOf(upper);
    if (idx >= 0) {
      return { group: 1, a: idx, b: 0, unit: '' };
    }

    // 数字尺码（如 36, 37, 38）
    if (/^\d+(\.\d+)?$/.test(t)) {
      return { group: 2, a: Number(t), b: 0, unit: '' };
    }

    // 数字+单位（如 160/84A, 165/88A）
    const slashMatch = t.match(/^(\d+)\/(\d+)([A-Z])?$/i);
    if (slashMatch) {
      return {
        group: 3,
        a: Number(slashMatch[1]),
        b: Number(slashMatch[2]),
        unit: (slashMatch[3] || '').toUpperCase()
      };
    }

    // 数字+单位（如 160CM, 65KG）
    const unitMatch = t.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
    if (unitMatch) {
      return {
        group: 4,
        a: Number(unitMatch[1]),
        b: 0,
        unit: unitMatch[2].toUpperCase()
      };
    }

    // 其他
    return { group: 5, a: 0, b: t, unit: '' };
  };

  return [...sizes].sort((a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);

    if (ka.group !== kb.group) return ka.group - kb.group;
    if (ka.group === 5) return String(ka.b).localeCompare(String(kb.b), 'zh-Hans-CN');
    if (ka.a !== kb.a) return ka.a - kb.a;
    if (ka.b !== kb.b) {
      if (typeof ka.b === 'number' && typeof kb.b === 'number') {
        return ka.b - kb.b;
      }
      return String(ka.b).localeCompare(String(kb.b));
    }
    return ka.unit.localeCompare(kb.unit);
  });
};
