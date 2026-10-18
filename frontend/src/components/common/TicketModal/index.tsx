import React from 'react';
import { Modal, Spin, Button, Space } from 'antd';
import { DownloadOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import { ticketApi } from '@/services/ticket/ticketApi';
import type { TicketData, TicketSourceBizType } from '@/services/ticket/ticketApi';
import TicketReceipt from './TicketReceipt';
import './ticket-receipt.css';

export interface TicketModalProps {
  open: boolean;
  onClose: () => void;
  sourceBizType: TicketSourceBizType;
  sourceBizId: string | number;
  sourceBizNo?: string;
}

/**
 * 电子小票弹窗：POS 收银 / 店铺订单 / 批发出库 通用。
 *
 * 内容实时聚合自源单据（getByBiz 惰性补建），支持打印（window.print）与
 * 下载小票图片（html2canvas，useCORS 防 OSS 跨域空白）。
 */
const TicketModal: React.FC<TicketModalProps> = ({
  open,
  onClose,
  sourceBizType,
  sourceBizId,
  sourceBizNo,
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
          <Button icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!data}>
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
