import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTicketPrintHtml } from '@/components/common/TicketModal/buildTicketPrintHtml';
import type { TicketData } from '@/services/ticket/ticketApi';

/**
 * 电子小票「一种版式 + 一条打印通道」回归（2026-10-21 顾客报障：一次打 2 张、
 * 「今日单据打印」与「电子小票」两种版式）。
 *
 * 修复前系统里三套并存：
 *   ① PosTerminal/TicketPrint.tsx（58mm、无二维码、iframe 打印）——已删除
 *   ② TicketModal（带二维码）打印走 window.print() + visibility 老方案
 *      ——窗口一多就出 2 张（TicketPrint 原注释里逐条记载过该方案的坑）
 *   ③ static/ticket/index.html（手机 H5）
 * 现统一为：②的版式 + iframe 独立文档打印。
 */

const QR_SVG =
  '<svg viewBox="0 0 33 33" shape-rendering="crispEdges"><path fill="#000" d="M0 0h7v7H0z"/></svg>';

function sample(overrides: Partial<TicketData> = {}): TicketData {
  return {
    ticketNo: 'T202610210003',
    signToken: 'a'.repeat(43),
    status: 'UNSIGNED',
    sourceBizType: 'POS_SALE',
    sourceBizNo: 'POS2026102110210621',
    createTime: '2026-10-21T14:21:05',
    customerName: '散客',
    serverName: '李老板',
    items: [
      {
        skuCode: 'BR26CB020E-L',
        styleNo: 'BR26CB020E',
        styleName: '象牙白单面醋酸无氨羊半裙',
        color: '象牙白',
        size: 'L(170/78A)',
        unitPrice: 2200,
        quantity: 2,
        amount: 4400,
      },
    ],
    matrix: [{ color: '象牙白', sizes: { 'L(170/78A)': 2 } }],
    itemCount: 2,
    goodsAmount: 4400,
    discountAmount: 9,
    shippingFee: 0,
    totalAmount: 4391,
    payMethod: 'CASH',
    payStatus: 'PAID',
    ...overrides,
  };
}

describe('buildTicketPrintHtml —— 电子小票唯一打印版式', () => {
  it('一份 HTML 只有一张票（绝不会出 2 张）', () => {
    const html = buildTicketPrintHtml(sample(), { qrSvg: QR_SVG });
    // 票根节点只允许出现一次；多一个就是一次打印出两张的直接成因
    expect(html.split('class="ticket"').length - 1).toBe(1);
    // 独立文档骨架也只一份
    expect(html.split('<!doctype html>').length - 1).toBe(1);
  });

  it('必带二维码（扫码签收入口），且用调用方传入的同一个码', () => {
    const html = buildTicketPrintHtml(sample(), { qrSvg: QR_SVG, h5Url: 'https://x/ticket/index.html?t=a' });
    expect(html).toContain(QR_SVG);
    expect(html).toContain('手机扫码查看小票，收货后可确认签收');
    // 已签收的不该再催顾客签收
    const signed = buildTicketPrintHtml(sample({ status: 'SIGNED', signedBy: '张三' }), { qrSvg: QR_SVG });
    expect(signed).toContain('已签收（张三）');
    expect(signed).toContain('手机扫码查看小票<');
    expect(signed).not.toContain('收货后可确认签收');
  });

  it('取不到二维码时给醒目提示，而不是静默出一张不能签收的票', () => {
    const html = buildTicketPrintHtml(sample(), { qrSvg: '' });
    expect(html).toContain('二维码未生成');
    expect(html).not.toContain(QR_SVG);
  });

  it('关键字段齐全：票号/来源/商品/矩阵/汇总/开单时间/店员', () => {
    const html = buildTicketPrintHtml(sample(), { qrSvg: QR_SVG });
    expect(html).toContain('T202610210003');
    expect(html).toContain('收银台');
    expect(html).toContain('POS2026102110210621');
    expect(html).toContain('BR26CB020E');
    expect(html).toContain('象牙白单面醋酸无氨羊半裙');
    expect(html).toContain('颜色\\码数');
    expect(html).toContain('销售：2 件');
    expect(html).toContain('折扣 -');
    expect(html).toContain('总额：');
    expect(html).toContain('开单时间');
    expect(html).toContain('李老板');
    expect(html).toContain('待签收');
  });

  it('挂账/运费等可选分行按数据出现', () => {
    const html = buildTicketPrintHtml(
      sample({ shippingFee: 12, payStatus: 'UNPAID', receivableAmount: 4391, receivableReceived: 500 }),
      { qrSvg: QR_SVG },
    );
    expect(html).toContain('运费');
    expect(html).toContain('（挂账）');
    expect(html).toContain('已收');
    expect(html).toContain('/');
  });

  it('HTML 注入必须转义（小票数据来自顾客/店员输入）', () => {
    const html = buildTicketPrintHtml(
      sample({ sourceBizNo: '<script>alert(1)</script>', customerName: '"><img src=x onerror=alert(1)>' }),
      { qrSvg: QR_SVG },
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('打印文档零外链资源（商品图不外挂：防 OSS 跨域空白与挂图拖慢打印）', () => {
    const html = buildTicketPrintHtml(sample(), { qrSvg: QR_SVG });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://cdn');
  });
});

describe('打印通道契约（源码级守护）', () => {
  // vitest 的 cwd 是 frontend/；用 process.cwd() 而不是 __dirname ——
  // 后者在 ESM 编译后的测试文件里不可靠（首版就踩了这个坑）。
  //
  // stripComments：守护的本意是防**代码**里出现 window.print()/display:none，
  // 但这两个词在"为什么不能这么做"的注释里必然出现 —— 首版就被注释误伤。
  // 所以断言前先把注释剥掉。
  const readSrc = (rel: string) => {
    const raw = readFileSync(resolve(process.cwd(), rel), 'utf8');
    return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  };

  it('TicketModal 不允许再用 window.print()（visibility 老方案已两次闯祸）', () => {
    const src = readSrc('src/components/common/TicketModal/index.tsx');
    expect(src).not.toContain('window.print()');
    expect(src).toContain('buildTicketPrintHtml');
  });

  it('打印只走 iframe 独立文档，且可见性隐藏而非 display:none', () => {
    const src = readSrc('src/components/common/TicketModal/printTicketHtml.ts');
    expect(src).toContain('createElement(\'iframe\')');
    expect(src).toContain('win.print()');
    // display:none 的 iframe 在部分浏览器不执行打印
    expect(src).not.toContain('display:none');
    expect(src).toContain('visibility:hidden');
  });

  it('58mm 无二维码的第二版式不许复活', () => {
    const base = resolve(process.cwd(), 'src/modules/pos/pages/PosTerminal');
    expect(existsSync(resolve(base, 'TicketPrint.tsx'))).toBe(false);
    expect(existsSync(resolve(base, 'ticket-print.css'))).toBe(false);
    expect(readdirSync(base).join(',')).not.toContain('TicketPrint');
  });

  it('收银台开单成功/扫码支付/今日单据补打，三个入口共用同一个弹窗 state', () => {
    const src = readSrc('src/modules/pos/pages/PosTerminal/index.tsx');
    // 只允许一个 TicketModal；不允许再引入第二套小票组件
    expect(src.split('<TicketModal').length - 1).toBe(1);
    expect(src).not.toContain("from './TicketPrint'");
  });
});
