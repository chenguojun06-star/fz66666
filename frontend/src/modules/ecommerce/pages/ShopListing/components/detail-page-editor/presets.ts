import type { SizeTableElement, TextElement } from './types';
import { DEFAULT_PAGE_W, uid } from './types';

/**
 * D-835：编辑器预设。
 *
 * <p><b>内置文案模版</b>沿用 D-831 的六段式（卖点→面料工艺→版型尺码→模特参考→
 * 洗涤保养→发货售后）——那是按服装详情页行业惯例写的，直接搬过来。
 * 插入时转成画布文字元素（纯文本 + 换行），商家在画布上直接改。
 */
export const TEXT_TEMPLATES: Array<{ key: string; label: string; html: string }> = [
  {
    key: 'points',
    label: '核心卖点',
    html:
      '<p><strong>为什么值得入手</strong></p>' +
      '<ul>' +
      '<li>面料亲肤透气，上身轻盈不闷热</li>' +
      '<li>版型修身不紧绷，遮肉显瘦显气质</li>' +
      '<li>经典百搭款，通勤、约会、日常都能穿</li>' +
      '</ul>',
  },
  {
    key: 'fabric',
    label: '面料与工艺',
    html:
      '<p><strong>面料与工艺</strong></p>' +
      '<p>精选高支面料，手感细腻、垂顺有光泽；走线平整细密，里衬收边干净利落，细节经得起细看。</p>',
  },
  {
    key: 'size',
    label: '版型与尺码建议',
    html:
      '<p><strong>版型与尺码建议</strong></p>' +
      '<p>正常体型按平时尺码拿即可，喜欢宽松感建议拍大一码；拿不准可对照尺码表量一下，或联系客服帮您推荐。</p>',
  },
  {
    key: 'model',
    label: '模特实拍参考',
    html:
      '<p><strong>模特实拍参考</strong></p>' +
      '<p>模特身高 168cm / 体重 50kg，试穿尺码 M，上身效果如图，供您参考。</p>',
  },
  {
    key: 'wash',
    label: '洗涤与保养',
    html:
      '<p><strong>洗涤与保养</strong></p>' +
      '<ul>' +
      '<li>建议 30℃ 以下水温单独手洗</li>' +
      '<li>不可漂白，中性洗涤剂效果更好</li>' +
      '<li>阴凉处平铺晾干，避免暴晒</li>' +
      '<li>深浅色分开存放，避免串色</li>' +
      '</ul>',
  },
  {
    key: 'service',
    label: '发货与售后',
    html:
      '<p><strong>发货与售后</strong></p>' +
      '<p>付款后 48 小时内发货；支持 7 天无理由退换（不影响二次销售），质量问题运费全免，请放心购买。</p>',
  },
];

/** 「文字」页签：三种字号预设（页面坐标 750 宽下的 px） */
export const TEXT_PRESETS: Array<{ key: string; label: string; make: (pageW: number) => TextElement }> = [
  {
    key: 'title',
    label: '大标题',
    make: (pageW) => ({
      id: uid('el'), kind: 'text', content: '点击右侧面板编辑文字', fontSize: 64, color: '#222222',
      bold: true, align: 'center', opacity: 100, w: Math.min(640, pageW - 80), x: (pageW - Math.min(640, pageW - 80)) / 2, y: 160,
    }),
  },
  {
    key: 'body',
    label: '正文',
    make: (pageW) => ({
      id: uid('el'), kind: 'text', content: '在这里输入正文内容', fontSize: 32, color: '#333333',
      align: 'center', opacity: 100, w: Math.min(600, pageW - 80), x: (pageW - Math.min(600, pageW - 80)) / 2, y: 240,
    }),
  },
  {
    key: 'note',
    label: '小字说明',
    make: (pageW) => ({
      id: uid('el'), kind: 'text', content: '小字说明，例如「手工量取，误差 1-2cm」', fontSize: 22, color: '#888888',
      align: 'center', opacity: 100, w: Math.min(520, pageW - 80), x: (pageW - Math.min(520, pageW - 80)) / 2, y: 320,
    }),
  },
];

/** 「形状」页签 */
export const SHAPE_PRESETS: Array<{
  key: 'rect' | 'circle' | 'line';
  label: string;
  color: string;
  w: number;
  h: number;
}> = [
  { key: 'rect', label: '矩形色块', color: '#f4f4f4', w: 400, h: 200 },
  { key: 'circle', label: '圆形', color: '#f4f4f4', w: 200, h: 200 },
  { key: 'line', label: '分隔线', color: '#333333', w: 400, h: 4 },
];

/**
 * 「素材」页签：不做假图库，只放能立刻用的装饰元素（本质是预置形状/文字），
 * 每个都是真实可渲染、可导出的东西，不放占位图。
 */
export const STICKER_PRESETS: Array<{ key: string; label: string; make: (pageW: number) => TextElement | import('./types').ShapeElement }> = [
  {
    key: 'divider',
    label: '装饰细线',
    make: (pageW) => ({ id: uid('el'), kind: 'shape', shape: 'line', color: '#dddddd', x: (pageW - 320) / 2, y: 300, w: 320, h: 2, opacity: 100 }),
  },
  {
    key: 'badge',
    label: '标签底块',
    make: (pageW) => ({ id: uid('el'), kind: 'shape', shape: 'rect', color: '#222222', x: (pageW - 200) / 2, y: 280, w: 200, h: 56, opacity: 100 }),
  },
  {
    key: 'dot',
    label: '圆点',
    make: (pageW) => ({ id: uid('el'), kind: 'shape', shape: 'circle', color: '#222222', x: (pageW - 16) / 2, y: 300, w: 16, h: 16, opacity: 100 }),
  },
];

/** 「尺码」页签插入的元素 */
export function makeSizeTableEl(data: { cols: string[]; rows: string[][] }, pageW: number): SizeTableElement {
  const w = Math.min(Math.max(data.cols.length * 130 + 40, 360), pageW - 40);
  return {
    id: uid('el'),
    kind: 'sizeTable',
    cols: data.cols,
    rows: data.rows,
    fontSize: 22,
    x: Math.round((pageW - w) / 2),
    y: 140,
    w,
    h: Math.max(1, data.rows.length + 1) * 44,
    opacity: 100,
  };
}
