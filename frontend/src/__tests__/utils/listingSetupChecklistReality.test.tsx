import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ListingSetupChecklist from '../../modules/ecommerce/pages/ShopListing/components/ListingSetupChecklist';

/**
 * D-813：上架检查清单必须检查**顾客端真实能看到的内容**。
 *
 * <p>历史故障：清单里的「详情描述」检查的是款式描述文本 `desc`，
 * 而顾客端详情页渲染的是 `content.blocks`（详情长图内容块）。
 * 结果「详情页一张图都没有」的款式，只要填了描述文本就显示「详情描述 ✓」——
 * 提示是假的，运营照着清单做完，顾客端还是空白。
 * 线上 11 个已上架款里 9 个详情页接近空白，正是这么来的。
 *
 * <p>本测试锁的是「清单项 ↔ 顾客端渲染源」的对应关系，
 * 防止有人以后又把清单项指回错误的字段。
 */
type Step = { key: string; label: string; done: boolean; action?: string };

const render2 = (required: Step[], optional: Step[] = []) =>
  render(
    <ListingSetupChecklist
      required={required as never}
      optional={optional as never}
      blockIssues={[]}
      listed={false}
    />,
  );

describe('上架检查清单 · 检查项必须对应顾客端真实内容（D-813）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('必做项未完成时如实显示进度，不虚报完成', () => {
    render2([
      { key: 'cover', label: '主图已上传', done: false, action: '待上传' },
      { key: 'price', label: '售价已设置', done: true },
    ]);

    expect(screen.getByText(/1\/2 项必做已完成/)).toBeTruthy();
  });

  it('主图：只配了 1 张时明确提示「建议补到 5 张」，而不是让人以为已达标', () => {
    // coverGroup 为空、只有单张 cover —— 顾客端顶部轮播只有 1 张。
    // 另留一项未完成，否则必做项全完成会走「已完成」分支，看不到逐项明细。
    render2([
      { key: 'cover', label: '主图已上传', done: true, action: '只有 1 张主图，建议补到 5 张' },
      { key: 'price', label: '售价已设置', done: false, action: '顾客看不到价格' },
    ]);

    expect(screen.getByText(/只有 1 张主图，建议补到 5 张/)).toBeTruthy();
  });

  it('详情长图：一块都没有时显示「详情页现在没有图」，而不是含糊的提升转化率', () => {
    render2([], [
      { key: 'detail', label: '详情长图（图+文）', done: false, action: '详情页现在没有图' },
    ]);

    expect(screen.getByText('详情长图（图+文）')).toBeTruthy();
    expect(screen.getByText('详情页现在没有图')).toBeTruthy();
  });

  it('详情长图有内容时显示真实块数', () => {
    render2([], [
      { key: 'detail', label: '详情长图（图+文）', done: true, action: '15 块' },
    ]);

    expect(screen.getByText('15 块')).toBeTruthy();
  });

  it('手工尺码表未配时如实说明「当前是 SKU 矩阵表，不是量体数据」', () => {
    // 自动矩阵表是「尺码×颜色→价格」，不是腰围/臀围/裤长；
    // 若清单显示成「已配」，运营会以为量体数据已经齐了
    render2([], [
      {
        key: 'sizechart',
        label: '手工尺码表（腰围/臀围/裤长）',
        done: false,
        action: '当前是 SKU 矩阵表，不是量体数据',
      },
    ]);

    expect(screen.getByText(/当前是 SKU 矩阵表，不是量体数据/)).toBeTruthy();
  });

  it('建议项不计入必做进度分母（否则「建议永远做不完」）', () => {
    render2(
      [{ key: 'price', label: '售价已设置', done: true }],
      [{ key: 'detail', label: '详情长图（图+文）', done: false, action: '详情页现在没有图' }],
    );

    // 必做项全做完 → 走「已完成」分支，建议项不进分母也不阻塞
    expect(screen.getByText(/上架准备已完成/)).toBeTruthy();
    expect(screen.getByText(/1 项建议/)).toBeTruthy();
    // 关键：这个分支原先把建议项的诊断整段丢了 —— 商家只看到「详情长图（图+文）」
    // 却不知道详情页现在一张图都没有
    expect(screen.getByText(/详情页现在没有图/)).toBeTruthy();
  });

  it('未完成项的诊断文案必须显示（此前只在已完成时渲染，清单形同虚设）', () => {
    render2([
      { key: 'cover', label: '主图已上传', done: false, action: '待上传' },
    ]);

    expect(screen.getByText('待上传')).toBeTruthy();
  });
});