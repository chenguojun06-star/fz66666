import QRCode from 'qrcode';
import { message } from '@/utils/antdStatic';
import { safePrint } from '@/utils/safePrint';

/** 打印入库二维码（传入质检入库号） */
export async function printWarehousingQr(warehousingNo: string, orderNo?: string) {
  if (!warehousingNo) { message.warning('二维码内容为空'); return; }
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(warehousingNo, { width: 200, margin: 2, errorCorrectionLevel: 'M' });
  } catch {
    message.error('生成二维码失败');
    return;
  }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>入库二维码</title>
    <style>
      body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Heiti SC', 'Songti SC', 'Hiragino Sans GB', serif; }
      .qr-wrap { text-align: center; border: 1px solid #ddd; padding: 16px; border-radius: 8px; width: 240px; }
      img { display: block; }
      .no { font-size: 13px; color: #333; margin-top: 8px; word-break: break-all; }
      .order { font-size: 13px; color: #888; margin-top: 4px; }
      @media print { body { min-height: unset; } }
    </style>
  </head><body><div class="qr-wrap">
    <img src="${qrDataUrl}" width="200" height="200" />
    <div class="no">${warehousingNo}</div>
    ${orderNo ? `<div class="order">订单号：${orderNo}</div>` : ''}
  </div></body></html>`;
  safePrint(html);
}

export const getUrgencyTag = (value: unknown): { text: string; color: string } | null => {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'urgent') return { text: '急', color: 'red' };
  if (key === 'normal') return { text: '普', color: 'default' };
  return null;
};

export const getPlateTypeTag = (value: unknown): { text: string; color: string } | null => {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'FIRST') return { text: '首', color: 'blue' };
  if (key === 'REORDER' || key === 'REPLATE') return { text: '翻', color: 'purple' };
  return null;
};
