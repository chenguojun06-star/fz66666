import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D-785：详情页模块编辑器（开关 + 排序 + 内容合一）。
 *
 * 用户原话：「不要开关在这里，内容在那边」——开关在布局区、内容在另外两个区，
 * 商家对不上哪个开关管哪段文字。这组测试守住两条：
 * 1. 每个模块的**开关、顺序、内容**必须在同一个组件里；
 * 2. 没有内容可填的模块必须**说清来源**，而不是给个空输入框让人以为填了会生效。
 */
const readEditor = () => readFileSync(
  resolve(process.cwd(), 'src/modules/ecommerce/pages/ShopListing/components/DetailModuleEditor.tsx'),
  'utf-8',
);
const readContent = () => readFileSync(
  resolve(process.cwd(), 'src/modules/ecommerce/pages/ShopListing/components/DetailModuleContent.tsx'),
  'utf-8',
);
const readDrawer = () => readFileSync(
  resolve(process.cwd(), 'src/modules/ecommerce/pages/ShopListing/components/ListingEditDrawer.tsx'),
  'utf-8',
);

describe('模块与内容合一（D-785）', () => {
  it('编辑器必须把内容渲染在自己的模块卡片里，而不是跳到别的分区', () => {
    const s = readEditor();
    // 模块内容组件在同一个 Collapse items 里渲染
    expect(s).toContain('const Editor = MODULE_CONTENT[m.moduleKey]');
    expect(s).toContain('<Editor ctx={ctx} />');
  });

  it('有内容的模块默认展开，商家一眼看到开关管的是哪段内容', () => {
    const s = readEditor();
    expect(s).toContain('setOpenKeys(merged.filter((m) => !!MODULE_CONTENT[m.moduleKey])');
  });

  it('没有输入框的模块必须说明内容来自哪里，不能留空白让人以为系统坏了', () => {
    const s = readEditor();
    expect(s).toContain("meta?.source ?? '这个模块不需要填写内容'");
    expect(s).toContain('所以这里没有输入框');
  });

  it('每个模块都要有一句「顾客端看到什么」的说明', () => {
    const s = readEditor();
    // MODULE_META 必须覆盖全部 16 个模块
    const keys = ['gallery', 'price', 'title', 'promise', 'points', 'color', 'size',
      'quantity', 'params', 'priceNote', 'detail', 'faq', 'reviews', 'wash',
      'recommend', 'purchase'];
    const body = s.slice(s.indexOf('const MODULE_META'), s.indexOf('};', s.indexOf('const MODULE_META')));
    keys.forEach((k) => {
      expect(body, `MODULE_META 缺少模块 ${k}`).toContain(`${k}:`);
    });
  });

  it('旧的两个「开关区 / 内容区」组件必须从抽屉里彻底消失', () => {
    const s = readDrawer();
    expect(s).not.toContain('LayoutEditorSection');
    expect(s).not.toContain('ListingInfoSection');
    expect(s).not.toContain('ListingContentSection');
    expect(s).not.toContain('详情页布局');
  });

  it('颜色图与商品分类必须归到各自模块，不能在两个地方各填一次', () => {
    const drawer = readDrawer();
    // 主图区只留主图（onlyCover），颜色图交给「颜色选择」模块
    expect(drawer).toContain('onlyCover');
    const content = readContent();
    expect(content).toContain('ColorContent');
    expect(content).toContain('ParamsContent');
  });
});

describe('模块开关与顺序（D-785 即时保存）', () => {
  it('不可隐藏的模块由后端 canHide 裁决，前端不再硬编码一份会过期的名单', () => {
    const s = readEditor();
    expect(s).toContain('!m.canHide');
    expect(s).not.toContain('LOCKED_MODULES');
  });

  it('试图隐藏必需模块时必须阻止并说明原因', () => {
    const s = readEditor();
    expect(s).toContain('是必需信息，隐藏后顾客看不到商品');
  });

  it('上移/下移交换相邻项并按新顺序落库', () => {
    const s = readEditor();
    expect(s).toContain('[next[idx], next[target]] = [next[target], next[idx]]');
    expect(s).toContain('sortOrder: i,');
  });

  it('首尾项的上移/下移按钮必须禁用', () => {
    const s = readEditor();
    expect(s).toContain('disabled={idx === 0}');
    expect(s).toContain('disabled={idx === modules.length - 1}');
  });

  it('开关与顺序即时保存，失败必须回滚而不是留下假状态', () => {
    const s = readEditor();
    expect(s).toContain('void persist(modules.map');
    expect(s).toContain('setModules(prev)');
    expect(s).toContain('已恢复原设置');
  });

  it('必须能恢复默认顺序', () => {
    const s = readEditor();
    expect(s).toContain('恢复默认顺序');
    expect(s).toContain('setDefaultOrder');
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
