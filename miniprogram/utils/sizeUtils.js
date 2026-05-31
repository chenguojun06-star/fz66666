const SIZE_LETTER_RANK = {
  XXXS: 10, XXS: 20, XS: 30, S: 40, M: 50, L: 60, XL: 70, XXL: 80, XXXL: 90, XXXXL: 100, XXXXXL: 110,
};

function resolveLetterRank(upper) {
  if (SIZE_LETTER_RANK[upper] != null) return SIZE_LETTER_RANK[upper];
  const mXS = upper.match(/^(X{0,4})S$/);
  if (mXS) return 40 - (mXS[1] ? mXS[1].length : 0) * 10;
  const mXL = upper.match(/^(X{1,4})L$/);
  if (mXL) return 60 + (mXL[1] ? mXL[1].length : 0) * 10;
  if (upper === 'S') return 40;
  if (upper === 'M') return 50;
  if (upper === 'L') return 60;
  if (upper === 'XL') return 70;
  if (upper === 'XXL') return 80;
  if (upper === 'XXXL') return 90;
  return null;
}

function getSizeKey(name) {
  const t = String(name || '').trim();
  const upper = t.toUpperCase();

  const stdOrder = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
  const stdIdx = stdOrder.indexOf(upper);
  if (stdIdx >= 0) return { group: 1, a: stdIdx, b: 0, unit: '' };

  if (/^\d+(\.\d+)?$/.test(t)) return { group: 2, a: Number(t), b: 0, unit: '' };

  const letterSlashMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)(\d+)\/(\d+)([A-Z])?$/);
  if (letterSlashMatch) {
    const letterRank = resolveLetterRank(letterSlashMatch[1]);
    return {
      group: 3,
      a: letterRank != null ? letterRank : 5000,
      b: Number(letterSlashMatch[2]),
      unit: (letterSlashMatch[3] || '') + (letterSlashMatch[4] || ''),
    };
  }

  const letterParenMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)\((\d+)\/(\d+)([A-Z])?\)$/);
  if (letterParenMatch) {
    const lr2 = resolveLetterRank(letterParenMatch[1]);
    return {
      group: 3,
      a: lr2 != null ? lr2 : 5000,
      b: Number(letterParenMatch[2]),
      unit: (letterParenMatch[3] || '') + (letterParenMatch[4] || ''),
    };
  }

  const letterParenSimpleMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)\((.+)\)$/);
  if (letterParenSimpleMatch) {
    const lr3 = resolveLetterRank(letterParenSimpleMatch[1]);
    return {
      group: 3,
      a: lr3 != null ? lr3 : 5000,
      b: letterParenSimpleMatch[2],
      unit: '',
    };
  }

  const slashMatch = t.match(/^(\d+)\/(\d+)([A-Z])?$/i);
  if (slashMatch) {
    return { group: 4, a: Number(slashMatch[1]), b: Number(slashMatch[2]), unit: (slashMatch[3] || '').toUpperCase() };
  }

  const unitMatch = t.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
  if (unitMatch) {
    return { group: 5, a: Number(unitMatch[1]), b: 0, unit: unitMatch[2].toUpperCase() };
  }

  const letterNumMatch = upper.match(/^(XS|S|M|L|XL|XXL|XXXL|XXXXL|X+S|X+L)(\d+(?:\.\d+)?)$/);
  if (letterNumMatch) {
    const lr = resolveLetterRank(letterNumMatch[1]);
    return { group: 6, a: lr != null ? lr : 5000, b: Number(letterNumMatch[2]), unit: '' };
  }

  return { group: 7, a: 0, b: t, unit: '' };
}

function sortSizeNames(sizes) {
  return sizes.slice().sort(function (a, b) {
    const ka = getSizeKey(a);
    const kb = getSizeKey(b);
    if (ka.group !== kb.group) return ka.group - kb.group;
    if (ka.group === 7) return String(ka.b).localeCompare(String(kb.b), 'zh-Hans-CN', { numeric: true });
    if (ka.a !== kb.a) return ka.a - kb.a;
    if (ka.b !== kb.b) {
      if (typeof ka.b === 'number' && typeof kb.b === 'number') return ka.b - kb.b;
      return String(ka.b).localeCompare(String(kb.b));
    }
    return ka.unit.localeCompare(kb.unit);
  });
}

module.exports = { sortSizeNames };
