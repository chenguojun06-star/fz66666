/**
 * 尺码相关工具函数
 */

/**
 * 标准尺码顺序表（X设尺码权威来源，禁止在其他文件内联）
 * 修改尺码顺序请直接修改此文件
 */
export const STANDARD_SIZE_ORDER: string[] = [
  'XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL', 'XXXXXXL',
];

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

const SIZE_LETTER_RANK: Record<string, number> = {
  XXXS: 10, XXS: 20, XS: 30, S: 40, M: 50, L: 60, XL: 70, XXL: 80, XXXL: 90, XXXXL: 100, XXXXXL: 110,
};

const resolveLetterRank = (upper: string): number | null => {
  if (SIZE_LETTER_RANK[upper] != null) return SIZE_LETTER_RANK[upper];
  const mXS = upper.match(/^(X{0,4})S$/);
  if (mXS) return 40 - (mXS[1]?.length || 0) * 10;
  const mXL = upper.match(/^(X{1,4})L$/);
  if (mXL) return 60 + (mXL[1]?.length || 0) * 10;
  if (upper === 'S') return 40;
  if (upper === 'M') return 50;
  if (upper === 'L') return 60;
  if (upper === 'XL') return 70;
  if (upper === 'XXL') return 80;
  if (upper === 'XXXL') return 90;
  return null;
};

export const sortSizeNames = (sizes: string[]) => {
  const getKey = (name: string): { group: number; a: number; b: string | number; unit: string } => {
    const t = String(name || '').trim();
    const upper = t.toUpperCase();

    const stdIdx = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'].indexOf(upper);
    if (stdIdx >= 0) {
      return { group: 1, a: stdIdx, b: 0, unit: '' };
    }

    if (/^\d+(\.\d+)?$/.test(t)) {
      return { group: 2, a: Number(t), b: 0, unit: '' };
    }

    const letterSlashMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)(\d+)\/(\d+)([A-Z])?$/);
    if (letterSlashMatch) {
      const letterRank = resolveLetterRank(letterSlashMatch[1]);
      return {
        group: 3,
        a: letterRank ?? 5000,
        b: Number(letterSlashMatch[2]),
        unit: `${letterSlashMatch[3] || ''}${letterSlashMatch[4] || ''}`,
      };
    }

    const letterParenMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)\((\d+)\/(\d+)([A-Z])?\)$/);
    if (letterParenMatch) {
      const letterRank = resolveLetterRank(letterParenMatch[1]);
      return {
        group: 3,
        a: letterRank ?? 5000,
        b: Number(letterParenMatch[2]),
        unit: `${letterParenMatch[3] || ''}${letterParenMatch[4] || ''}`,
      };
    }

    const letterParenSimpleMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)\((.+)\)$/);
    if (letterParenSimpleMatch) {
      const letterRank = resolveLetterRank(letterParenSimpleMatch[1]);
      return {
        group: 3,
        a: letterRank ?? 5000,
        b: letterParenSimpleMatch[2],
        unit: '',
      };
    }

    const slashMatch = t.match(/^(\d+)\/(\d+)([A-Z])?$/i);
    if (slashMatch) {
      return {
        group: 4,
        a: Number(slashMatch[1]),
        b: Number(slashMatch[2]),
        unit: (slashMatch[3] || '').toUpperCase()
      };
    }

    const unitMatch = t.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
    if (unitMatch) {
      return {
        group: 5,
        a: Number(unitMatch[1]),
        b: 0,
        unit: unitMatch[2].toUpperCase()
      };
    }

    const letterNumMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)(\d+(?:\.\d+)?)$/);
    if (letterNumMatch) {
      const letterRank = resolveLetterRank(letterNumMatch[1]);
      return {
        group: 6,
        a: letterRank ?? 5000,
        b: Number(letterNumMatch[2]),
        unit: '',
      };
    }

    return { group: 7, a: 0, b: t, unit: '' };
  };

  return [...sizes].sort((a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);

    if (ka.group !== kb.group) return ka.group - kb.group;
    if (ka.group === 7) return String(ka.b).localeCompare(String(kb.b), 'zh-Hans-CN', { numeric: true });
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
