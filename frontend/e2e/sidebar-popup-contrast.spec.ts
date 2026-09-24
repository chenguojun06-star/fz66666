/**
 * 侧边栏折叠浮层「文字可见性」回归测试（D-533）
 *
 * 背景：用户反馈收起侧边栏后鼠标悬停弹层「文字全部看不到」，反复修（D-333/333b/333c）未根治。
 * 根因：浮层文字色取自 --sidebar-text，而白主题把 --sidebar-text 指向 --color-text-primary，
 *       该令牌会被 OS 深色媒体查询 / html.dark-mode 劫持成近白 → 浅底白字。
 *
 * 本测试不依赖登录：把项目真实 CSS 按入口顺序内联，构造 antd SubMenu popup 的真实 DOM，
 * 逐一测量各主题 × OS 外观组合下的文字/背景色并断言对比度 ≥ 4.5。
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const CSS_FILES = [
  '../node_modules/antd/dist/reset.css',
  'src/styles/global.css',
  'src/styles/design-system.css',
  'src/styles/dark-theme-global.css',
  'src/styles/button-override.css',
  'src/styles/animations.css',
  'src/styles/lightSense.css',
  'src/styles/utilities.css',
  'src/components/Layout/styles.css',
];

const CSS = CSS_FILES.map((rel) => {
  const p = path.resolve(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}).join('\n');

/** 构造 popup DOM：带/不带 popupClassName 两种（antd 版本差异下的兜底都要成立） */
function buildHtml(theme: string | null, withPopupClass: boolean, darkModeClass: boolean) {
  const attr = theme ? ` data-theme="${theme}"` : '';
  const cls = darkModeClass ? ' class="dark-mode"' : '';
  const popupCls = withPopupClass
    ? 'ant-menu-submenu-popup layout-sidebar-submenu-popup'
    : 'ant-menu-submenu-popup';
  return `<!doctype html>
<html${attr}${cls}>
<head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
  <div class="${popupCls}">
    <ul class="ant-menu ant-menu-vertical" role="menu">
      <li class="ant-menu-item" role="menuitem"><span class="ant-menu-title-content">订单管理</span></li>
      <li class="ant-menu-item" role="menuitem"><span class="ant-menu-title-content">生产进度</span></li>
    </ul>
  </div>
</body></html>`;
}

const MEASURE = () => {
  const popup = document.querySelector('.ant-menu-submenu-popup') as HTMLElement;
  const item = popup.querySelector('.ant-menu-item') as HTMLElement;
  const title = popup.querySelector('.ant-menu-title-content') as HTMLElement;

  // 解析 rgb/rgba（alpha 缺失视为 1）
  const parse = (s: string) => {
    const m = (s.match(/[\d.]+/g) || []).map(Number);
    return { r: m[0] || 0, g: m[1] || 0, b: m[2] || 0, a: m.length > 3 ? m[3] : 1 };
  };
  const lum = (c: number[]) => {
    const f = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const contrast = (a: number[], b: number[]) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  const textColor = getComputedStyle(title).color;
  const bg = getComputedStyle(popup).backgroundColor;
  const bgMenu = getComputedStyle(popup.querySelector('.ant-menu') as HTMLElement).backgroundColor;
  const bgBody = getComputedStyle(document.body).backgroundColor;

  // 逐层向上找第一个不透明底色（popup → 内层 menu → body → 白）
  const layers = [bg, bgMenu, bgBody];
  let eff = parse('#ffffff');
  for (const l of layers) {
    const p = parse(l);
    if (p.a > 0.01) { eff = p; break; }
  }

  return {
    textColor,
    bg,
    bgMenu,
    accent: getComputedStyle(item).color,
    effectiveBg: `rgba(${eff.r}, ${eff.g}, ${eff.b}, ${eff.a})`,
    contrast: Number(contrast(parse(textColor) ? [parse(textColor).r, parse(textColor).g, parse(textColor).b] : [0, 0, 0], [eff.r, eff.g, eff.b]).toFixed(2)),
  };
};

const CASES: Array<{ theme: string | null; scheme: 'light' | 'dark'; darkClass?: boolean; label: string }> = [
  { theme: 'white', scheme: 'light', label: 'white / OS浅色' },
  { theme: 'white', scheme: 'dark', label: 'white / OS深色（用户报障场景）' },
  { theme: null, scheme: 'dark', label: '无 data-theme / OS深色' },
  { theme: 'dark', scheme: 'dark', label: 'dark / OS深色' },
  { theme: 'lightblue', scheme: 'dark', label: 'lightblue / OS深色' },
  { theme: 'blue', scheme: 'dark', label: 'blue / OS深色' },
];

test.describe('侧边栏折叠浮层文字可见性', () => {
  for (const c of CASES) {
    test(`${c.label} 对比度达标`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: c.scheme });
      await page.setContent(buildHtml(c.theme, true, !!c.darkClass));
      const m = await page.evaluate(MEASURE);
      console.log(`[对比度] ${c.label} => ${JSON.stringify(m)}`);
      expect(m.contrast, `${c.label} 文字色=${m.textColor} 背景=${m.bg}/${m.bgMenu}`).toBeGreaterThanOrEqual(4.5);
    });

    test(`${c.label}（popupClassName 失效兜底）对比度达标`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: c.scheme });
      await page.setContent(buildHtml(c.theme, false, !!c.darkClass));
      const m = await page.evaluate(MEASURE);
      console.log(`[对比度-兜底] ${c.label} => ${JSON.stringify(m)}`);
      expect(m.contrast, `${c.label} 文字色=${m.textColor} 背景=${m.bg}/${m.bgMenu}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('html.dark-mode 类不再劫持浅色主题（死块已限定）', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setContent(buildHtml('white', true, true));
    const m = await page.evaluate(MEASURE);
    console.log(`[dark-mode 类劫持检查] => ${JSON.stringify(m)}`);
    expect(m.contrast).toBeGreaterThanOrEqual(4.5);
  });
});
