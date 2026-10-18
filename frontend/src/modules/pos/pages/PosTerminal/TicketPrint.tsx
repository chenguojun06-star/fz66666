import { Button, Modal, Space, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
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
 * 58mm 热敏小票打印。
 *
 * <p><b>说清楚它是什么</b>：这是**浏览器直连打印**，走 `window.print()`，
 * 不依赖任何打印机驱动或打印代理。门店把浏览器默认打印机设成热敏机即可。
 * 服务端连不到门店局域网里的打印机，所以"云端直接推打印指令"这条路不成立 ——
 * 这里不做假的。
 *
 * <p>为什么仍然值得做：专业收银**打完小票才算这一单结束**，
 * 没有小票顾客会当场要，事后补打又要翻记录。
 */
interface Props {
  open: boolean;
  ticket: TicketData | null;
  onClose: () => void;
  onPrinted?: () => void;
}

const TicketPrint: React.FC<Props> = ({ open, ticket, onClose, onPrinted }) => {
  const doPrint = () => {
    window.print();
    onPrinted?.();
  };

  return (
    <Modal
      open={open}
      title="小票打印"
      onCancel={onClose}
      width={400}
      footer={
        <Space style={{ width: '100%' }}>
          <Button block onClick={onClose}>
            关闭
          </Button>
          <Button block type="primary" icon={<PrinterOutlined />} onClick={doPrint}>
            打印 / 补打
          </Button>
        </Space>
      }
    >
      {!ticket ? (
        <Text type="secondary">没有可打印的小票</Text>
      ) : (
        <>
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
            打印时请选择已设为默认的 58mm 热敏打印机；纸张宽度需设为「实际大小」。
          </Text>
        </>
      )}
    </Modal>
  );
};

export default TicketPrint;
