import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D-770：订单导出 Excel + 打印发货单。
 *
 * 守护两个业务事实：
 * 1. **导出与打印是两种东西** —— 导出是订单头流水表（可读、可对账），
 *    发货单是一个订单一块（含明细与签字栏）。做成同一个功能就都不好用。
 * 2. **缺数据要显式失败**，不能导出一张全空的表、或打出没有明细的发货单。
 */
describe('订单导出与发货单（D-770）', () => {
  const readTool = () => readFileSync(
    resolve(process.cwd(), 'src/modules/ecommerce/pages/ShopManage/deliveryTools.ts'),
    'utf-8',
  );
  const readPage = () => readFileSync(
    resolve(process.cwd(), 'src/modules/ecommerce/pages/ShopManage/index.tsx'),
    'utf-8',
  );

  it('导出列必须覆盖发货与对账必需字段', () => {
    const s = readTool();
    for (const h of ['订单号', '状态', '收货人', '手机号', '收货地址',
      '件数', '实付合计', '快递公司', '快递单号', '发货时间']) {
      expect(s, `导出缺少「${h}」列`).toContain(`header: '${h}'`);
    }
  });

  it('导出优先用勾选项，未勾选才导出整页', () => {
    const s = readTool();
    expect(s).toContain('selectedIds.length');
    expect(s).toMatch(/selectedIds\.length\s*\?\s*orders\.filter/);
  });

  it('无可导出订单时必须报错，不能产出空表', () => {
    expect(readTool()).toContain('没有可导出的订单');
  });

  it('已取消订单不打印（打出来也是浪费纸）', () => {
    const s = readTool();
    expect(s).toContain("o.status !== 'CANCELLED'");
    expect(s).toContain('已取消的订单不打印');
  });

  it('打印窗口被拦截时必须给出可操作的提示', () => {
    const s = readTool();
    expect(s).toContain('打印窗口被浏览器拦截');
    expect(s).toContain('允许弹出窗口');
  });

  it('发货单必须一个订单一块并分页', () => {
    const s = readTool();
    expect(s).toContain('page-break-after: always');
    expect(s).toContain('class="note"');
  });

  it('发货单必须含签字栏（仓库实际流程需要回签）', () => {
    const s = readTool();
    expect(s).toContain('发货人签字');
    expect(s).toContain('日期');
  });

  it('明细缺失时必须显式标注，不能静默留空行', () => {
    const s = readTool();
    expect(s).toContain('无明细，请在系统中核对');
  });

  it('发货单内容必须转义，防止顾客填的备注/地址注入 HTML', () => {
    const s = readTool();
    // 地址、姓名等都来自顾客输入，必须统一走 esc
    expect(s).toContain('const esc =');
    expect(s).toMatch(/esc\(o\.address\)/);
    expect(s).toMatch(/esc\(o\.customerName\)/);
  });

  it('页面两个按钮都要在，且导出与打印分别可用', () => {
    const s = readPage();
    expect(s).toContain('导出 Excel');
    expect(s).toContain('打印发货单');
    expect(s).toContain('handleExportOrders');
    expect(s).toContain('handlePrintNotes');
  });

  it('拉明细必须有并发上限，避免订单多时打满浏览器', () => {
    const s = readPage();
    expect(s).toMatch(/i \+= 5/);
    expect(s).toContain('避免订单多时把浏览器打满');
  });

  it('单单拉取失败不阻断整批发货单生成', () => {
    const s = readPage();
    expect(s).toContain('单单拉取失败不阻断整批');
  });
});