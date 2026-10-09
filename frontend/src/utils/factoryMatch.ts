/**
 * 工厂名匹配工具：精确优先 → 子串模糊匹配取最长命中。
 *
 * 背景（2026-10-09 修复）：原实现用 `find(c => deptName.includes(c.factoryName) || c.factoryName.includes(deptName))`
 * 双向子串 + 第一个命中，导致选中「生产部1」时先命中「生产部」，
 * 产能卡/交期预测/在产订单明细全部张冠李戴（DB 中两厂同时存在且 matchScore 同为 63 分）。
 * 现改为：先精确匹配，未命中再在所有子串命中项中取 factoryName 最长者（「生产部1」优先于「生产部」）。
 */
export function matchFactoryByName<T extends { factoryName: string }>(
  list: T[] | undefined | null,
  name: string | undefined | null,
): T | null {
  if (!list?.length || !name) return null;
  const target = name.trim();
  if (!target) return null;

  const exact = list.find(c => (c.factoryName || '').trim() === target);
  if (exact) return exact;

  const candidates = list.filter(c => {
    const fn = (c.factoryName || '').trim();
    return !!fn && (target.includes(fn) || fn.includes(target));
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, c) =>
    (c.factoryName || '').trim().length > (best.factoryName || '').trim().length ? c : best,
  );
}
