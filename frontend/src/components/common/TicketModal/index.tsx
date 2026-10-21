import React from 'react';
import { Alert, Modal, Spin, Button, Space } from 'antd';
import { DownloadOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import { ticketApi } from '@/services/ticket/ticketApi';
import type { TicketData, TicketSourceBizType } from '@/services/ticket/ticketApi';
import TicketReceipt from './TicketReceipt';
import { buildTicketPrintHtml } from './buildTicketPrintHtml';
import { printTicketHtml } from './printTicketHtml';
import { ticketH5Url } from '@/services/ticket/ticketApi';
import './ticket-receipt.css';

export interface TicketModalProps {
  open: boolean;
  onClose: () => void;
  sourceBizType: TicketSourceBizType;
  sourceBizId: string | number;
  sourceBizNo?: string;
  /**
   * 开单成功信息（仅 POS 收银台传入）：与打印弹窗合并展示，避免开一次单弹两个窗。
   * 旧实现（TicketPrint.tsx）把它放在一个**无二维码的 58mm 小票弹窗**里，
   * 于是「今日单据打印」与「电子小票」成了两种版式 —— 顾客明确要求统一，
   * 于 2026-10-21 删除 TicketPrint，收款成功信息并入本弹窗。
   */
  summary?: {
    saleNo: string;
    totalAmount?: number | null;
    change?: number | null;
    receivableId?: number | string | null;
    saleId?: number | string | null;
  } | null;
}

/**
 * 电子小票弹窗：POS 收银 / 店铺订单 / 批发出库 通用。
 *
 * 内容实时聚合自源单据（getByBiz 惰性补建），支持打印（独立 iframe 文档）与
 * 下载小票图片（html2canvas，useCORS 防 OSS 跨域空白）。
 *
 * **打印只有一种版式**（buildTicketPrintHtml，带二维码）：2026-10-21 之前
 * 打印走 `window.print()` + visibility 方案，页面弹窗一多就出 2 张纸；
 * 且与收银台的 58mm 无二维码版并存，顾客看到"两种不一样的小票"。
 */
const TicketModal: React.FC<TicketModalProps> = ({
  open,
  onClose,
  sourceBizType,
  sourceBizId,
  sourceBizNo,
  summary,
}) => {
  const [data, setData] = React.useState<TicketData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const receiptRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    if (!sourceBizId) return;
    setLoading(true);
    try {
      setData(await ticketApi.getByBiz(sourceBizType, sourceBizId, sourceBizNo));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载电子小票失败');
    } finally {
      setLoading(false);
    }
  }, [sourceBizType, sourceBizId, sourceBizNo]);

  React.useEffect(() => {
    if (open) {
      setData(null);
      void load();
    }
  }, [open, load]);

  /** 下载小票图片（useCORS：款式图走 OSS，不带跨域会画成空白） */
  const downloadImage = React.useCallback(async () => {
    if (!receiptRef.current || !data) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(receiptRef.current.querySelector('.ticket-receipt') ?? receiptRef.current, {
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = `电子小票-${data.ticketNo}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      message.error('生成小票图片失败');
    } finally {
      setExporting(false);
    }
  }, [data]);

  /**
   * 打印：独立 iframe 文档 + 唯一版式（buildTicketPrintHtml）。
   *
   * <p>二维码从屏幕上已渲染的 QRCodeSVG 取 SVG outerHTML 嵌进打印件 ——
   * 不引 CDN、不重新生成，屏上预览的码与打印出的码必定同一个。
   * 二维码按设计就是 H5 免登录入口（PC 上扫不开是正常的：顾客用手机扫）。
   */
  const doPrint = React.useCallback(() => {
    if (!data) return;
    const qrSvg = receiptRef.current?.querySelector('.ticket-receipt__qr svg')?.outerHTML ?? '';
    const html = buildTicketPrintHtml(data, { qrSvg, h5Url: ticketH5Url(data.signToken) });
    printTicketHtml(html);
  }, [data]);

  return (
    <Modal
      open={open}
      title={`电子小票${data ? ` · ${data.ticketNo}` : ''}`}
      width={440}
      onCancel={onClose}
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button icon={<PrinterOutlined />} onClick={doPrint} disabled={!data}>
            打印
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={() => void downloadImage()}
            disabled={!data}
          >
            下载图片
          </Button>
        </Space>
      }
    >
      {summary ? (
        <div style={{ marginBottom: 12 }}>
          <div className="pos-done__row">
            <span>销售单号</span>
            <span>{summary.saleNo}</span>
          </div>
          {summary.totalAmount != null ? (
            <div className="pos-done__row pos-done__row--total">
              <span>应收</span>
              <span>{`¥${Number(summary.totalAmount).toFixed(2)}`}</span>
            </div>
          ) : null}
          {summary.change != null && summary.change >= 0 ? (
            <div className="pos-done__row">
              <span>找零</span>
              <span>{`¥${Number(summary.change).toFixed(2)}`}</span>
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
        </div>
      ) : null}

      <div ref={receiptRef}>
        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : data ? (
          <TicketReceipt data={data} />
        ) : (
          <div style={{ textAlign: 'center', padding: 24 }}>未取到小票数据</div>
        )}
      </div>
    </Modal>
  );
};

export default TicketModal;
