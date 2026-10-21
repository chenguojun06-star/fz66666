import { Alert, Button, Modal, Space, Typography } from 'antd';
import { PrinterOutlined, ProfileOutlined } from '@ant-design/icons';
import { formatMoney } from '@/utils/format';
import type { TicketData } from '@/services/ticket/ticketApi';

const { Text } = Typography;

const PAY_LABEL: Record<string, string> = {
  CASH: '现金',
  WECHAT: '微信',
  ALIPAY: '支付宝',
  CARD: '刷卡',
  CREDIT: '挂账',
  MEMBER_BALANCE: '会员余额',
};

/**
 * 小票打印 HTML（独立文档）。
 *
 * <p>为什么是独立 HTML 而不是 window.print() 打当前页面：
 * 之前用 `visibility:hidden` 藏页面只留小票，隐藏元素**仍占布局高度**，
 * 整页收银台的高度被带进打印 → 小票被分页劈开、出 2 张纸、第一页大面积空白。
 * 独立文档从根上隔离：只有小票自己，永远 1 张纸。
 */
function buildTicketHtml(ticket: TicketData): string {
  const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const rows = (ticket.items || [])
    .map(
      (it, i) => `<tr>
        <td class="name">${esc((it.styleName || it.styleNo || it.skuCode || '商品') + ((it.color || it.size) ? ` (${[it.color, it.size].filter(Boolean).join('/')})` : ''))}</td>
        <td>${it.quantity ?? 0}</td>
        <td>${formatMoney(Number(it.amount ?? 0))}</td>
      </tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>小票</title>
<style>
  @page { margin: 6mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .ticket { width: 58mm; margin: 0 auto; font: 12px/1.5 "Noto Sans Mono", Menlo, Consolas, monospace; color: #000; }
  .shop { text-align: center; font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 4px; }
  .rule { text-align: center; letter-spacing: 1px; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 1px 0; font-weight: normal; font-size: 12px; }
  th { font-weight: 700; border-bottom: 1px dashed #000; }
  th:nth-child(n+2), td:nth-child(n+2) { text-align: right; width: 64px; }
  td.name, th:nth-child(1) { text-align: left; }
  td.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 0; }
  tr.total td { font-weight: 700; }
  .foot { text-align: center; font-size: 11px; }
</style></head>
<body>
  <div class="ticket">
    <div class="shop">${esc(ticket.serverName || '门店')}</div>
    <div class="meta">单号 ${esc(ticket.sourceBizNo || ticket.ticketNo)}<br>${esc(String(ticket.paidTime || ticket.createTime || '').replace('T', ' ').slice(0, 16))}<br>收银 ${esc(ticket.signedBy || '')}</div>
    <div class="rule">--------------------------------</div>
    <table>
      <thead><tr><th>品名</th><th>数量</th><th>金额</th></tr></thead>
      <tbody>
        ${rows}
        <tr><td>商品金额</td><td></td><td>${formatMoney(ticket.goodsAmount)}</td></tr>
        ${Number(ticket.discountAmount) !== 0 ? `<tr><td>优惠</td><td></td><td>-${formatMoney(ticket.discountAmount)}</td></tr>` : ''}
        <tr class="total"><td>应收</td><td></td><td>${formatMoney(ticket.totalAmount)}</td></tr>
        <tr><td>收款方式</td><td></td><td>${esc(PAY_LABEL[String(ticket.payMethod ?? '')] || ticket.payMethod || '—')}</td></tr>
        ${ticket.payMethod === 'CREDIT' ? `<tr><td>客户</td><td></td><td>${esc(ticket.customerPhone || '')}</td></tr>` : ''}
      </tbody>
    </table>
    <div class="rule">--------------------------------</div>
    <div class="foot">共 ${ticket.itemCount ?? 0} 件</div>
    <div class="foot">谢谢惠顾，欢迎再来</div>
  </div>
</body></html>`;
}

/**
 * 58mm 热敏小票打印。
 *
 * <p>浏览器直连打印：写进隐藏 iframe 后调 `iframe.print()`，
 * 不依赖任何打印机驱动或打印代理；门店把浏览器默认打印机设成热敏机即可。
 * 服务端连不到门店局域网里的打印机，所以"云端直接推打印指令"这条路不成立 ——
 * 这里不做假的。
 */
interface Props {
  open: boolean;
  ticket: TicketData | null;
  /** 开单成功的结算信息：与打印弹窗合并展示，避免开一次单弹两个窗 */
  summary?: {
    saleNo: string;
    totalAmount?: number | null;
    change?: number | null;
    receivableId?: number | string | null;
    saleId?: number | string | null;
  } | null;
  onViewTicket?: () => void;
  onClose: () => void;
  onPrinted?: () => void;
}

const TicketPrint: React.FC<Props> = ({ open, ticket, summary, onViewTicket, onClose, onPrinted }) => {
  const doPrint = () => {
    if (!ticket) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(buildTicketHtml(ticket));
    doc.close();
    const win = frame.contentWindow!;
    const fire = () => {
      try {
        win.focus();
        win.print();
      } finally {
        // 打印框弹出后再移除 iframe；留 2 秒给打印对话框取内容
        window.setTimeout(() => frame.remove(), 2000);
      }
    };
    // 等 iframe 文档就绪再打印，避免打出空白页
    if (doc.readyState === 'complete') {
      window.setTimeout(fire, 60);
    } else {
      win.addEventListener('load', () => window.setTimeout(fire, 60), { once: true });
    }
    onPrinted?.();
  };

  return (
    <Modal
      open={open}
      title="收款成功"
      onCancel={onClose}
      width={400}
      footer={
        <Space style={{ width: '100%' }}>
          <Button block onClick={onClose}>
            关闭
          </Button>
          <Button block type="primary" icon={<PrinterOutlined />} onClick={doPrint} disabled={!ticket}>
            打印 / 补打
          </Button>
        </Space>
      }
    >
      {!ticket && !summary ? (
        <Text type="secondary">没有可打印的小票</Text>
      ) : (
        <>
          {summary ? (
            <div style={{ marginBottom: 12 }}>
              <div className="pos-done__row">
                <span>销售单号</span>
                <Text copyable>{summary.saleNo}</Text>
              </div>
              {summary.totalAmount != null ? (
                <div className="pos-done__row pos-done__row--total">
                  <span>应收</span>
                  <span>{formatMoney(summary.totalAmount)}</span>
                </div>
              ) : null}
              {summary.change != null && summary.change >= 0 ? (
                <div className="pos-done__row">
                  <span>找零</span>
                  <span>{formatMoney(summary.change)}</span>
                </div>
              ) : null}
              {summary.receivableId ? (
                <Alert
                  style={{ marginTop: 8 }}
                  type="warning"
                  showIcon
                  message="已生成应收单，请在「收付款中心」核销"
                />
              ) : null}
              {summary.saleId && onViewTicket ? (
                <Button
                  block
                  style={{ marginTop: 8 }}
                  icon={<ProfileOutlined />}
                  onClick={onViewTicket}
                >
                  查看电子小票（扫码签收）
                </Button>
              ) : null}
            </div>
          ) : null}
          {ticket ? (
            <>
              {/* 屏上预览（打印走独立 iframe 文档，见 buildTicketHtml） */}
              <div className="ticket-print">
                <div className="ticket-print__shop">{ticket.serverName || '门店'}</div>
                <div className="ticket-print__meta">
                  单号 {ticket.sourceBizNo || ticket.ticketNo}
                  <br />
                  {String(ticket.paidTime || ticket.createTime || '').replace('T', ' ').slice(0, 16)}
                  <br />
                  收银 {ticket.signedBy || ''}
                </div>
                <div className="ticket-print__rule">--------------------------------</div>
                <div className="ticket-print__head">
                  <span>品名</span>
                  <span>数量</span>
                  <span>金额</span>
                </div>
                {(ticket.items || []).map((it, i) => (
                  <div className="ticket-print__row" key={`${it.skuCode ?? i}`}>
                    <span>
                      {it.styleName || it.styleNo || it.skuCode || '商品'}
                      {(it.color || it.size) ? ` (${[it.color, it.size].filter(Boolean).join('/')})` : ''}
                    </span>
                    <span>{it.quantity ?? 0}</span>
                    <span>{formatMoney(Number(it.amount ?? 0))}</span>
                  </div>
                ))}
                <div className="ticket-print__rule">--------------------------------</div>
                <div className="ticket-print__row">
                  <span>商品金额</span>
                  <span />
                  <span>{formatMoney(ticket.goodsAmount)}</span>
                </div>
                {Number(ticket.discountAmount) !== 0 ? (
                  <div className="ticket-print__row">
                    <span>优惠</span>
                    <span />
                    <span>-{formatMoney(ticket.discountAmount)}</span>
                  </div>
                ) : null}
                <div className="ticket-print__row ticket-print__row--total">
                  <span>应收</span>
                  <span />
                  <span>{formatMoney(ticket.totalAmount)}</span>
                </div>
                <div className="ticket-print__row">
                  <span>收款方式</span>
                  <span />
                  <span>{PAY_LABEL[String(ticket.payMethod ?? '')] || ticket.payMethod || '—'}</span>
                </div>
                {ticket.payMethod === 'CREDIT' ? (
                  <div className="ticket-print__row">
                    <span>客户</span>
                    <span />
                    <span>{ticket.customerPhone || ''}</span>
                  </div>
                ) : null}
                <div className="ticket-print__rule">--------------------------------</div>
                <div className="ticket-print__foot">共 {ticket.itemCount ?? 0} 件</div>
                <div className="ticket-print__foot">谢谢惠顾，欢迎再来</div>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                打印机选热敏小票机即可；纸张缩放保持「实际大小」。
              </Text>
            </>
          ) : null}
        </>
      )}
    </Modal>
  );
};

export default TicketPrint;
