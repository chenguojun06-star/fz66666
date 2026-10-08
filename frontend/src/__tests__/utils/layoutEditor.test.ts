import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D-770：详情页模块布局管理端。
 *
 * 重点守护两件容易做错的事：
 * 1. **必留模块不可隐藏** —— 图片轮播/价格被关掉，详情页对顾客毫无意义；
 * 2. **顺序即上到下** —— 数组顺序必须直接决定渲染顺序，不能让后端再排一次。
 */
describe('详情页布局编辑器（D-770）', () => {
  const read = () => readFileSync(
    resolve(process.cwd(), 'src/modules/ecommerce/pages/ShopListing/components/LayoutEditorSection.tsx'),
    'utf-8',
  );

  it('必留模块与后端裁决保持一致', () => {
    expect(read()).toContain("const LOCKED_MODULES = ['gallery', 'price']");
  });

  it('试图隐藏必留模块时必须阻止并说明原因，而不是静默忽略', () => {
    const s = read();
    const guard = s.indexOf('LOCKED_MODULES.includes(key)');
    const toggle = s.indexOf('const toggle =');
    expect(guard).toBeGreaterThan(toggle);
    // 必须给出可读提示，否则用户以为开关坏了
    expect(s).toContain('不能隐藏');
  });

  it('上移/下移必须交换相邻项并重排序号', () => {
    const s = read();
    expect(s).toContain('[next[idx], next[target]] = [next[target], next[idx]]');
    // 排序号必须随顺序重算，否则后端按旧 sortOrder 存会错位
    expect(s).toContain('next.map((m, i) => ({ ...m, sortOrder: i }))');
  });

  it('首尾项的上移/下移按钮必须禁用', () => {
    const s = read();
    expect(s).toContain('disabled={idx === 0}');
    expect(s).toContain('disabled={idx === modules.length - 1}');
  });

  it('保存时按当前数组顺序提交 sortOrder（数组顺序=上到下顺序）', () => {
    const s = read();
    expect(s).toContain('modules.map((m, i) => ({');
    expect(s).toContain('sortOrder: i,');
  });

  it('无改动时保存按钮禁用，避免无意义的写请求', () => {
    const s = read();
    expect(s).toContain('disabled={!dirty}');
    expect(s).toContain('setDirty(false)');
  });

  it('必须提供恢复默认，避免用户把布局改乱后无法回到标准版式', () => {
    const s = read();
    expect(s).toContain('恢复默认');
    expect(s).toContain('const reset =');
  });

  it('隐藏的模块要明确标出，避免误以为没生效', () => {
    expect(read()).toContain('已隐藏');
  });
});

describe('布局接口契约（D-770）', () => {
  const readApi = () => readFileSync(
    resolve(process.cwd(), 'src/services/shop/shopApi.ts'),
    'utf-8',
  );

  it('三个接口都必须存在（模块定义 / 读布局 / 存布局）', () => {
    const s = readApi();
    expect(s).toContain("layoutModules: () => api.get<LayoutModuleDef[]>('/shop/admin/layout-modules')");
    expect(s).toContain("getStyleLayout: (styleId: number | string)");
    expect(s).toContain("saveStyleLayout: (");
    expect(s).toContain("`/shop/admin/layout/${styleId}`");
  });
});