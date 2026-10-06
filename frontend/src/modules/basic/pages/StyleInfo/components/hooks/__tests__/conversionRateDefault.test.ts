import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * D-702：换算率「填了不出现」的根因回归守护
 *
 * <p><b>用户反馈</b>：「物料清单的换算逻辑是不是有问题，为什么填写了不出现」。
 *
 * <p><b>排查结论（先澄清一个误判）</b>：换算列显示 `-` 本身是**正确行为** ——
 * {@code bomUsageColumns.tsx} 只在「物料单位=公斤/kg/千克」且「纸样单位=米/m」时才显示换算值，
 * 而辅料单位是 个/条/码，本就不参与换算。数据库也证实 154 行里 72 行
 * {@code conversion_rate > 0} 且单位均非公斤。
 *
 * <p><b>但排查中确实找到两个真实缺陷</b>：
 * <ol>
 *   <li><b>72 行的 {@code conversion_rate=1} 全是默认值，不是用户填的</b> ——
 *       新增行时写死 {@code conversionRate: 1}；</li>
 *   <li><b>{@code Number(x ?? 1) || 1} 会把 0 强转成 1</b> ——
 *       即使用户真的填了 0（或想表达"不换算"），读回时也被改写成 1。
 *       配合显示条件（需单位=公斤），就形成「填了却看不见」的观感。</li>
 * </ol>
 *
 * <p>第 2 点是关键：{@code ||} 会吞掉 0。这在数值字段上是典型陷阱，
 * 一旦散落多处，只改一处仍会被别处改回去。
 */
const HOOKS_DIR = resolve(__dirname, '../');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('D-702 换算率默认值与 0 值吞噬（填了不出现的根因）', () => {
  const sources = listTsFiles(HOOKS_DIR)
    .filter((f) => /useStyleBomEditing|useStyleBomMutations|useBomMaterialFill|useStylePatternTabData|bomCellEditors|bomUsageColumns/.test(f))
    .map((f) => ({ file: f.split('/').pop()!, src: readFileSync(f, 'utf8') }));

  it('应能找到相关源文件（避免因路径变更而静默跳过断言）', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('禁止出现 `?? 1) || 1` 这种会把 0 强转成 1 的写法', () => {
    const offenders = sources
      .filter(({ src }) => /conversionRate[^;\n]*\|\|\s*1\b/.test(src))
      .map(({ file }) => file);
    expect(offenders)
      .toEqual(expect.arrayContaining([]));
    expect(offenders).toEqual([]);
  });

  it('换算率默认值必须是 0 而不是 1', () => {
    const editing = sources.find(({ file }) => file === 'useStyleBomEditing.ts');
    expect(editing).toBeDefined();
    // 新增行的默认值：与 usageAmount / lossRate 语义一致（未填=0）
    expect(editing!.src).toMatch(/conversionRate:\s*0,/);
    expect(editing!.src).not.toMatch(/conversionRate:\s*1,/);
  });

  it('tooltip 必须说明「非公斤单位恒为 - 属正常」，避免被当成故障', () => {
    const cols = sources.find(({ file }) => file === 'bomUsageColumns.tsx');
    expect(cols).toBeDefined();
    expect(cols!.src).toContain('属正常');
  });
});