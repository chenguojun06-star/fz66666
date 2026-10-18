import React from 'react';
import { Tag, Image } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import type { TicketData, TicketItem } from '@/services/ticket/ticketApi';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';

const PAY_LABEL: Record<string, string> = {
  CASH: '现金',
  WECHAT: '微信',
  ALIPAY: '支付宝',
  CARD: '刷卡',
  CREDIT: '挂账',
};

const SOURCE_LABEL: Record<string, string> = {
  POS_SALE: '收银台',
  SHOP_ORDER: '店铺订单',
  OUTSTOCK: '批发出库',
};

const RETURN_POLICY =
  '收到货后请第一时间检查，如有质量问题请第一时间联系我们，超过7天一概不退不换。' +
  '本店货品15天内可调码，不调色不调款，逾期不受理，谢谢！';

/** 颜色 × 码数矩阵表（保序） */
const MatrixTable: React.FC<{ matrix: NonNullable<TicketData['matrix']> }> = ({ matrix }) => {
  const sizes = Object.keys(matrix[0]?.sizes ?? {});
  if (!sizes.length) return null;
  return (
    <table className="ticket-receipt__matrix">
      <thead>
        <tr>
          <th>颜色\码数</th>
          {sizes.map((s) => (
            <th key={s}>{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row) => (
          <tr key={row.color}>
            <td>{row.color}</td>
            {sizes.map((s) => (
              <td key={s}>{row.sizes[s] || '-'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ItemRow: React.FC<{ item: TicketItem }> = ({ item }) => (
  <div className="ticket-receipt__item">
    {item.imageUrl ? (
      <Image
        className="ticket-receipt__img"
        src={item.imageUrl}
        width={56}
        height={56}
        style={{ objectFit: 'cover', borderRadius: 6 }}
        preview={{ mask: null }}
      />
    ) : (
      <div className="ticket-receipt__img" />
    )}
    <div className="ticket-receipt__item-main">
      <div className="ticket-receipt__item-name">{item.styleNo || item.skuCode || '—'}</div>
      <div className="ticket-receipt__item-sub">{item.styleName || ''}</div>
      <div className="ticket-receipt__item-sub">
        {formatMoney(Number(item.unitPrice ?? 0))} × {item.quantity ?? 0} 件
        {item.color ? ` · ${item.color}` : ''}
        {item.size ? ` · ${item.size}` : ''}
      </div>
    </div>
    <div className="ticket-receipt__item-amt">{formatMoney(Number(item.amount ?? 0))}</div>
  </div>
);

/**
 * 小票纸（纯展示）：打印与下载图片的截取区域。
 */
const TicketReceipt: React.FC<{ data: TicketData }> = ({ data }) => {
  const discount = Number(data.discountAmount ?? 0);
  const shipping = Number(data.shippingFee ?? 0);
  const total = Number(data.totalAmount ?? 0);
  const goods = Number(data.goodsAmount ?? 0);
  const receivable = Number(data.receivableAmount ?? 0);

  return (
    <div className="ticket-receipt">
      <div className="ticket-receipt__head">
        <div className="ticket-receipt__no">{data.ticketNo}</div>
        <div className="ticket-receipt__meta">
          <span>{SOURCE_LABEL[data.sourceBizType] ?? data.sourceBizType}</span>
          <span>单号 {data.sourceBizNo}</span>
          <span>
            {data.status === 'SIGNED'
              ? `已签收${data.signedBy ? `（${data.signedBy}）` : ''}`
              : '待签收'}
          </span>
        </div>
      </div>

      <div className="ticket-receipt__section">
        {(data.items ?? []).map((it, idx) => (
          <ItemRow key={it.skuId ?? idx} item={it} />
        ))}
        {(data.matrix ?? []).length > 0 ? <MatrixTable matrix={data.matrix!} /> : null}
      </div>

      <div className="ticket-receipt__section">
        <div className="ticket-receipt__row">
          <span>销售：{data.itemCount ?? 0} 件</span>
          <span>
            {discount > 0 ? <span style={{ marginRight: 12 }}>折扣 -{formatMoney(discount)}</span> : null}
            总额：<strong>{formatMoney(total)}</strong>
          </span>
        </div>
        {shipping > 0 ? (
          <div className="ticket-receipt__row">
            <span>运费</span>
            <span>{formatMoney(shipping)}</span>
          </div>
        ) : null}
        {data.payMethod ? (
          <div className="ticket-receipt__row">
            <span>
              {PAY_LABEL[data.payMethod] ?? data.payMethod}
              {data.payStatus === 'UNPAID' ? '（挂账）' : ''}
            </span>
            <span>
              {receivable > 0
                ? `已收 ${formatMoney(Number(data.receivableReceived ?? 0))} / ${formatMoney(receivable)}`
                : formatMoney(total)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="ticket-receipt__section">
        <div className="ticket-receipt__row">
          <span>开单时间</span>
          <span>{formatDateTime(data.createTime)}</span>
        </div>
        {data.serverName ? (
          <div className="ticket-receipt__row">
            <span>店员</span>
            <span>{data.serverName}</span>
          </div>
        ) : null}
        {data.customerName ? (
          <div className="ticket-receipt__row">
            <span>客户</span>
            <span>{data.customerName}</span>
          </div>
        ) : null}
        {data.customerPhone ? (
          <div className="ticket-receipt__row">
            <span>联系电话</span>
            <span>{data.customerPhone}</span>
          </div>
        ) : null}
        {data.remark ? (
          <div className="ticket-receipt__row">
            <span>备注</span>
            <span>{data.remark}</span>
          </div>
        ) : null}
      </div>

      <div className="ticket-receipt__section ticket-receipt__qr">
        <QRCodeSVG
          value={`${window.location.origin}/ticket/index.html?t=${encodeURIComponent(data.signToken)}`}
          size={120}
          level="M"
        />
        <div className="ticket-receipt__qr-tip">
          手机扫码查看小票{data.status === 'SIGNED' ? '' : '，收货后可确认签收'}
        </div>
      </div>

      <div className="ticket-receipt__policy">
        提醒：{RETURN_POLICY}
        {goods > 0 && goods !== total ? (
          <>
            <br />
            <Tag style={{ marginTop: 4 }}>商品 {formatMoney(goods)}</Tag>
            {discount > 0 ? <Tag style={{ marginTop: 4 }}>优惠 {formatMoney(discount)}</Tag> : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default TicketReceipt;
