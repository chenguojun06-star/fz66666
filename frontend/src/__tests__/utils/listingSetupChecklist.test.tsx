/**
 * ListingSetupChecklist 上架前检查清单
 *
 * 这些断言锁的是「清单语义」而非渲染细节 —— 尤其锁死三条业界共识（Saleor 源码）：
 *   1. 进度只按必做项算，建议项不进分母（否则「建议永远做不完」，进度条到不了 100%）
 *   2. 卡点只有一个（第一个未完成的必做项），不是所有未完成项都抢主按钮
 *   3. 无数据/有阻断项时不能显示成「已完成」
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingSetupChecklist from '@/modules/ecommerce/pages/ShopListing/components/ListingSetupChecklist';

const requiredAllDone = [
  { key: 'cover', label: '主图已上传', done: true, anchor: 'cover' },
  { key: 'price', label: '售价已设置', done: true, anchor: 'sku' },
];

const requiredPartial = [
  { key: 'cover', label: '主图已上传', done: true, anchor: 'cover' },
  { key: 'price', label: '售价已设置', done: false, anchor: 'sku' },
  { key: 'stock', label: '可售库存大于 0', done: false, anchor: 'sku' },
];

describe('ListingSetupChecklist 上架前检查清单', () => {
  it('全部必做项完成 → 显示可上架，进度为满', () => {
    render(<ListingSetupChecklist required={requiredAllDone} />);
    expect(screen.getByText(/上架准备已完成|已上架/)).toBeTruthy();
    expect(screen.queryByText(/上架准备清单/)).toBeNull();
  });

  it('未完成时进度只按必做项计算，不把建议项算进分母', () => {
    // 1/3 必做完成 + 2 项建议（都没做）→ 分母必须是 3 而不是 5。
    const { container } = render(
      <ListingSetupChecklist
        required={requiredPartial}
        optional={[
          { key: 'fabric', label: '面料成分', done: false, action: '降低退货率' },
          { key: 'detail', label: '详情描述', done: false, action: '提升转化率' },
        ]}
      />,
    );
    // 文案被 React 拆成多个文本节点，用 container 归一化空白后匹配
    expect(container.textContent?.replace(/\s+/g, ' ')).toContain('1/3 项必做已完成');
  });

  it('建议项区标题明示「不影响上架」，不被误读为待办', () => {
    render(
      <ListingSetupChecklist
        required={requiredPartial}
        optional={[{ key: 'fabric', label: '面料成分', done: false }]}
      />,
    );
    expect(screen.getByText('建议完善（不影响上架）')).toBeTruthy();
  });

  it('有阻断项时即便必做项全完成也不能显示为可上架', () => {
    render(
      <ListingSetupChecklist
        required={requiredAllDone}
        blockIssues={[
          { level: 'block', field: '标题/描述', message: '含违禁词「最」', action: '删除违禁词' },
          { level: 'warn', field: '主图', message: '建议白底', action: '换图' },
        ]}
      />,
    );
    // 必须仍显示清单（因为有 block），且 block 项要列出来
    expect(screen.getByText(/上架准备清单/)).toBeTruthy();
    expect(screen.getByText('必须修复（否则无法上架）')).toBeTruthy();
    expect(screen.getByText(/含违禁词/)).toBeTruthy();
  });

  it('warn 级问题不进阻断区（只提示，不阻断上架）', () => {
    render(
      <ListingSetupChecklist
        required={requiredPartial}
        blockIssues={[{ level: 'warn', field: '主图', message: '建议白底', action: '换图' }]}
      />,
    );
    expect(screen.queryByText('必须修复（否则无法上架）')).toBeNull();
  });

  it('卡点只有一个：只有第一个未完成项给「去处理」入口', () => {
    const jumped: (string | undefined)[] = [];
    render(
      <ListingSetupChecklist
        required={requiredPartial}
        onJump={(a) => jumped.push(a)}
      />,
    );
    const jumpBtns = screen.getAllByText(/去处理/);
    // 3 个必做项里有 2 个未完成，但主按钮只应出现在第一个（售价）
    expect(jumpBtns.length).toBe(1);
  });

  it('已上架状态下仍展示清单（改动会立即对顾客生效，需提示）', () => {
    render(<ListingSetupChecklist required={requiredPartial} listed />);
    expect(screen.getByText(/已上架（修改会立即对顾客生效）/)).toBeTruthy();
  });
});
