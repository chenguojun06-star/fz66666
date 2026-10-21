/**
 * 电子小票打印通道（**全场唯一**）。
 *
 * <p>为什么不用 `window.print()`（2026-10-21 顾客报障：一次打出 2 张单）：
 * 旧实现用 `body *{visibility:hidden}` + 只留小票 visible 的方式打印当前页。
 * 这个方案有三个已知坑（TicketPrint.tsx 的注释里逐条记载过）：
 *   ① 隐藏元素**仍占布局高度**，整页后台的高度被带进打印 → 出 2 张纸、
 *      小票被分页劈开、第一页大面积空白；
 *   ② 页面同时开多个弹窗时，凡是匹配到可见规则的小票块都会被打印
 *      —— 这正是"打印电子小票出现 2 张"的直接原因：收银台里
 *      「小票打印弹窗」和「电子小票弹窗」叠加着打开；
 *   ③ iframe/打印对话框时序脆弱，打印对话框未弹出就可能移除 iframe。
 *
 * <p>现在：把小票写进**一次性、独立、空文档**的隐藏 iframe，只对这一份文档调
 * `print()`。页面开几个弹窗、背景多复杂，打印内容都只有 iframe 里那一张票。
 * 不依赖任何打印机驱动或打印代理；门店把浏览器默认打印机设成热敏机即可
 * （服务端连不到门店局域网里的打印机，"云端直接推打印指令"这条路不成立，
 * 这里不做假的）。
 */
export function printTicketHtml(html: string): void {
  const frame = document.createElement('iframe');
  // 不能用 display:none —— 部分浏览器对 display:none 的 iframe 不执行打印；
  // 用 0 尺寸 + fixed 移出可视区。
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', '电子小票打印');
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = frame.contentWindow!;
  const fire = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // 打印对话框弹出后再移除 iframe；留 2 秒给对话框取内容
      // （Chrome 的 print() 在对话框关闭后才继续执行， Firefox 立即返回）。
      window.setTimeout(() => frame.remove(), 2000);
    }
  };
  // 等 iframe 文档就绪再打印，避免打出空白页
  if (doc.readyState === 'complete') {
    window.setTimeout(fire, 60);
  } else {
    win.addEventListener('load', () => window.setTimeout(fire, 60), { once: true });
  }
}
