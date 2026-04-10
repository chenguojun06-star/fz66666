import React, { useMemo } from 'react';
import { Button, Divider, Empty, Space, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import StandardModal from '@/components/common/StandardModal';

export interface MaterialOutboundPrintItem {
  batchNo?: string;
  warehouseLocation?: string;
  quantity: number;
  unit?: string;
  materialName?: string;
  specification?: string;
  color?: string;
  unitPrice?: number;
}

export interface MaterialOutboundPrintPayload {
  outboundNo: string;
  outboundTime: string;
  materialCode: string;
  materialName: string;
  materialType?: string;
  specification?: string;
  color?: string;
  unit?: string;
  supplierName?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  orderNo?: string;
  styleNo?: string;
  factoryName?: string;
  factoryType?: string;
  pickupType?: string;
  usageType?: string;
  receiverName?: string;
  issuerName?: string;
  warehouseLocation?: string;
  remark?: string;
  items: MaterialOutboundPrintItem[];
}

interface MaterialOutboundPrintModalProps {
  open: boolean;
  data: MaterialOutboundPrintPayload | null;
  onClose: () => void;
}

const pickupTypeLabelMap: Record<string, string> = {
  INTERNAL: '内部',
  EXTERNAL: '外部',
};

const usageTypeLabelMap: Record<string, string> = {
  BULK: '大货用料',
  SAMPLE: '样衣用料',
  STOCK: '备库/补库',
  OTHER: '其他',
};

const buildPrintHtml = (data: MaterialOutboundPrintPayload) => {
  const itemRows = data.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.materialName || data.materialName}</td>
      <td>${item.color || data.color || '-'}</td>
      <td>${item.specification || data.specification || '-'}</td>
      <td>${item.batchNo || '-'}</td>
      <td>${item.warehouseLocation || data.warehouseLocation || '-'}</td>
      <td>${item.quantity}</td>
      <td>${item.unit || data.unit || ''}</td>
      <td>${item.unitPrice != null ? item.unitPrice.toFixed(2) : '-'}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <title>面辅料出库单</title>
        <style>
          body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; color: #111; padding: 24px; }
          .page { border: 1px solid #d9d9d9; padding: 24px; }
          .title { text-align: center; font-size: 24px; font-weight: 700; margin-bottom: 20px; }
          .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 20px; margin-bottom: 20px; }
          .meta-item { font-size: 13px; line-height: 1.6; }
          .meta-label { color: #666; display: inline-block; min-width: 88px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #111; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f5f5f5; }
          .remark { margin-top: 16px; font-size: 13px; line-height: 1.7; min-height: 56px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; }
          .signature { width: 28%; border-top: 1px solid #111; padding-top: 8px; text-align: center; }
          @media print {
            body { padding: 0; }
            .page { border: 0; padding: 0; }
            @page { margin: 12mm; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="title">面辅料出库单</div>
          <div class="meta">
            <div class="meta-item"><span class="meta-label">出库单号</span>${data.outboundNo}</div>
            <div class="meta-item"><span class="meta-label">出库时间</span>${data.outboundTime}</div>
            <div class="meta-item"><span class="meta-label">出库类型</span>${pickupTypeLabelMap[data.pickupType || ''] || data.pickupType || '-'}</div>
            <div class="meta-item"><span class="meta-label">用料场景</span>${usageTypeLabelMap[data.usageType || ''] || data.usageType || '-'}</div>
            <div class="meta-item"><span class="meta-label">关联订单</span>${data.orderNo || '-'}</div>
            <div class="meta-item"><span class="meta-label">关联款号</span>${data.styleNo || '-'}</div>
            <div class="meta-item"><span class="meta-label">关联工厂</span>${data.factoryName || '-'}</div>
            <div class="meta-item"><span class="meta-label">物料编号</span>${data.materialCode}</div>
            <div class="meta-item"><span class="meta-label">物料名称</span>${data.materialName}</div>
            <div class="meta-item"><span class="meta-label">供应商</span>${data.supplierName || '-'}</div>
            <div class="meta-item"><span class="meta-label">颜色</span>${data.color || '-'}</div>
            <div class="meta-item"><span class="meta-label">规格/幅宽</span>${[data.specification, data.fabricWidth].filter(Boolean).join(' / ') || '-'}</div>
            <div class="meta-item"><span class="meta-label">克重</span>${data.fabricWeight || '-'}</div>
            <div class="meta-item"><span class="meta-label">成分</span>${data.fabricComposition || '-'}</div>
            <div class="meta-item"><span class="meta-label">领取人</span>${data.receiverName || '-'}</div>
            <div class="meta-item"><span class="meta-label">出库人</span>${data.issuerName || '-'}</div>
            <div class="meta-item"><span class="meta-label">默认库位</span>${data.warehouseLocation || '-'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 48px;">序号</th>
                <th>物料名称</th>
                <th>颜色</th>
                <th>规格/幅宽</th>
                <th>批次号</th>
                <th>库位</th>
                <th style="width: 80px;">数量</th>
                <th style="width: 56px;">单位</th>
                <th style="width: 72px;">单价</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
          <div class="remark"><strong>备注：</strong>${data.remark || '-'}</div>
          <div class="signatures">
            <div class="signature">仓库出库人</div>
            <div class="signature">领取人</div>
            <div class="signature">审核人</div>
          </div>
        </div>
      </body>
    </html>
  `;
};

const printWithIframe = (html: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return;
  }
  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();
  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 300);
  };
  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  }, 250);
};

const MaterialOutboundPrintModal: React.FC<MaterialOutboundPrintModalProps> = ({
  open,
  data,
  onClose,
}) => {
  const usageLabel = useMemo(() => usageTypeLabelMap[data?.usageType || ''] || data?.usageType || '-', [data?.usageType]);
  const pickupLabel = useMemo(() => pickupTypeLabelMap[data?.pickupType || ''] || data?.pickupType || '-', [data?.pickupType]);

  return (
    <StandardModal
      title="打印面辅料出库单"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          disabled={!data}
          onClick={() => {
            if (!data) return;
            printWithIframe(buildPrintHtml(data));
          }}
        >
          直接打印
        </Button>,
      ]}
      size="lg"
    >
      {!data ? (
        <Empty description="暂无可打印的出库单数据" />
      ) : (
        <div style={{ padding: '8px 0' }}>
          <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, marginBottom: 20 }}>面辅料出库单</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 12,
              padding: 16,
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-bg-subtle)',
            }}
          >
            <div><strong>出库单号：</strong>{data.outboundNo}</div>
            <div><strong>出库时间：</strong>{dayjs(data.outboundTime).format('YYYY-MM-DD')}</div>
            <div>
              <strong>类型：</strong>
              <Space size={6}>
                <Tag color={data.pickupType === 'EXTERNAL' ? 'blue' : 'green'}>{pickupLabel}</Tag>
                <Tag color={data.usageType === 'SAMPLE' ? 'purple' : data.usageType === 'BULK' ? 'orange' : 'default'}>{usageLabel}</Tag>
              </Space>
            </div>
            <div><strong>订单号：</strong>{data.orderNo || '-'}</div>
            <div><strong>款号：</strong>{data.styleNo || '-'}</div>
            <div><strong>关联工厂：</strong>{data.factoryName || '-'}</div>
            <div><strong>默认库位：</strong>{data.warehouseLocation || '-'}</div>
            <div><strong>物料编号：</strong>{data.materialCode}</div>
            <div><strong>物料名称：</strong>{data.materialName}</div>
            <div><strong>供应商：</strong>{data.supplierName || '-'}</div>
            <div><strong>颜色：</strong>{data.color || '-'}</div>
            <div><strong>规格/幅宽：</strong>{[data.specification, data.fabricWidth].filter(Boolean).join(' / ') || '-'}</div>
            <div><strong>克重：</strong>{data.fabricWeight || '-'}</div>
            <div><strong>成分：</strong>{data.fabricComposition || '-'}</div>
            <div><strong>领取人：</strong>{data.receiverName || '-'}</div>
            <div><strong>出库人：</strong>{data.issuerName || '-'}</div>
          </div>
          <Divider style={{ margin: '20px 0 16px' }} />
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--color-border)' }}>
            <thead>
              <tr>
                <th style={cellStyle}>序号</th>
                <th style={cellStyle}>物料名称</th>
                <th style={cellStyle}>颜色</th>
                <th style={cellStyle}>规格/幅宽</th>
                <th style={cellStyle}>批次号</th>
                <th style={cellStyle}>库位</th>
                <th style={cellStyle}>数量</th>
                <th style={cellStyle}>单位</th>
                <th style={cellStyle}>单价</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={`${item.batchNo || 'row'}-${index}`}>
                  <td style={cellStyle}>{index + 1}</td>
                  <td style={cellStyle}>{item.materialName || data.materialName}</td>
                  <td style={cellStyle}>{item.color || data.color || '-'}</td>
                  <td style={cellStyle}>{item.specification || data.specification || '-'}</td>
                  <td style={cellStyle}>{item.batchNo || '-'}</td>
                  <td style={cellStyle}>{item.warehouseLocation || data.warehouseLocation || '-'}</td>
                  <td style={cellStyle}>{item.quantity}</td>
                  <td style={cellStyle}>{item.unit || data.unit || '-'}</td>
                  <td style={cellStyle}>{item.unitPrice != null ? item.unitPrice.toFixed(2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Divider style={{ margin: '16px 0' }} />
          <div style={{ minHeight: 60, lineHeight: 1.7 }}>
            <strong>备注：</strong>{data.remark || '-'}
          </div>
        </div>
      )}
    </StandardModal>
  );
};

const cellStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  padding: '10px 8px',
  textAlign: 'left',
  verticalAlign: 'top',
};

export default MaterialOutboundPrintModal;
