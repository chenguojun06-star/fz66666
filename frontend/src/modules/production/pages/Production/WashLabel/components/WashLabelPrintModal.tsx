/**
 * 打印标签弹窗 — 洗水唛 / U编码
 *
 * 逻辑与裁剪菲号完全一致：
 *  · 按颜色×尺码分行，每行可调节"每标签件数"（默认=该尺码总量, 即1张）
 *  · 系统自动计算 标签总数 = ⌈总量 ÷ 每标签件数⌉
 *  · 每张标签带自增序号（1, 2, 3...），最后一张数量按余量取整
 *  · 纸张：7×4 cm（与菲号标签规格相同）
 *  · QR内容：款号-颜色-码数-序号（本地生成，不走外部API）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, InputNumber, Button, Alert, Checkbox, Tag, Typography, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import ResizableModal from '../../../../../../components/common/ResizableModal';
import type { ProductionOrder } from '../../../../../../types/production';
import { productionCuttingApi } from '../../../../../../services/production/productionApi';
import { message } from '@/utils/antdStatic';

const { Text } = Typography;

interface SkuRow {
  key: string;
  color: string;
  size: string;
  totalQty: number;
  perLabelQty: number;  // 工厂可手动调整
}

interface Props {
  open: boolean;
  onCancel: () => void;
  order: ProductionOrder | null;
}

export default function WashLabelPrintModal({ open, onCancel, order }: Props) {
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState<SkuRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);

  /* ── 拉取裁剪明细，按 (颜色+码数) 聚合 ── */
  useEffect(() => {
    if (!open || !order) { setRows([]); setSelectedKeys([]); return; }
    setLoading(true);

    productionCuttingApi.listBundles(order.id as any)
      .then((res: any) => {
        const bundles: any[] = Array.isArray(res?.data) ? res.data : [];
        const skuRows: SkuRow[] = [];

        if (bundles.length > 0) {
          const map = new Map<string, { color: string; size: string; qty: number }>();
          bundles.forEach((b: any) => {
            const k = `${b.color ?? ''}__${b.size ?? ''}`;
            const e = map.get(k);
            if (e) e.qty += (b.quantity || 0);
            else map.set(k, { color: b.color ?? '', size: b.size ?? '', qty: b.quantity || 0 });
          });
          map.forEach((v, k) =>
            skuRows.push({ key: k, color: v.color, size: v.size, totalQty: v.qty, perLabelQty: v.qty }),
          );
        } else {
          // 兜底：按订单整体颜色/码数生成一行
          const k = `${order.color ?? ''}__${order.size ?? ''}`;
          skuRows.push({
            key: k,
            color: order.color || '-',
            size:  order.size  || '-',
            totalQty:    order.orderQuantity || 0,
            perLabelQty: order.orderQuantity || 0,
          });
        }

        setRows(skuRows);
        setSelectedKeys(skuRows.map(r => r.key));
      })
      .catch(() => {
        const k = `${order.color ?? ''}__${order.size ?? ''}`;
        const row: SkuRow = {
          key: k, color: order.color || '-', size: order.size || '-',
          totalQty: order.orderQuantity || 0, perLabelQty: order.orderQuantity || 0,
        };
        setRows([row]);
        setSelectedKeys([k]);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  /* ── 调整每标签件数 ── */
  const handlePerLabelChange = (key: string, val: number | null) => {
    setRows(prev => prev.map(r =>
      r.key === key ? { ...r, perLabelQty: Math.max(1, val ?? 1) } : r,
    ));
  };

  /* ── 全选/取消全选 ── */
  const allSelected     = rows.length > 0 && selectedKeys.length === rows.length;
  const partialSelected = selectedKeys.length > 0 && !allSelected;
  const toggleAll = () => setSelectedKeys(allSelected ? [] : rows.map(r => r.key));
  const toggleRow = (key: string, checked: boolean) =>
    setSelectedKeys(prev => checked ? [...prev, key] : prev.filter(k => k !== key));

  /* ── 合计标签数 ── */
  const totalLabels = rows
    .filter(r => selectedKeys.includes(r.key))
    .reduce((sum, r) => sum + Math.ceil(r.totalQty / Math.max(1, r.perLabelQty)), 0);

  /* ── 打印 ── */
  const handlePrint = useCallback(async () => {
    if (!order) return;
    const selected = rows.filter(r => selectedKeys.includes(r.key));
    if (!selected.length) { void message.warning('请勾选需要打印的颜色/码数行'); return; }

    setPrinting(true);
    try {
      /* 1. 展开所有标签 */
      interface LabelInfo {
        color: string; size: string;
        qty: number; seq: number; qrCode: string;
      }
      const labels: LabelInfo[] = [];

      selected.forEach(row => {
        const nc = Math.ceil(row.totalQty / Math.max(1, row.perLabelQty));
        for (let i = 0; i < nc; i++) {
          const seq = i + 1;
          const qty = i < nc - 1
            ? row.perLabelQty
            : (row.totalQty - row.perLabelQty * (nc - 1));
          const styleNo = order.styleNo || '';
          const uCode = [styleNo, row.color, row.size].filter(Boolean).join('-');
          labels.push({ color: row.color, size: row.size, qty, seq, qrCode: `${uCode}-${seq}` });
        }
      });

      /* 2. 生成 QR DataURL（本地 qrcode 库，不走外部接口） */
      const qrMap: Record<string, string> = {};
      for (const lb of labels) {
        if (lb.qrCode && !qrMap[lb.qrCode]) {
          try {
            qrMap[lb.qrCode] = await QRCode.toDataURL(lb.qrCode, {
              width: 84, margin: 1, errorCorrectionLevel: 'M',
            });
          } catch { qrMap[lb.qrCode] = ''; }
        }
      }

      /* 3. 构建每张标签 HTML（7×4cm = 70×40mm，与菲号标签完全相同规格） */
      const labelW = 70, labelH = 40;
      const printQrSize = Math.min(labelH - 4, 29.5);

      const labelsHtml = labels.map(lb => `
        <div class="print-page">
          <div class="label">
            <div class="qr">
              <img src="${qrMap[lb.qrCode] || ''}" width="84" height="84" />
            </div>
            <div class="text">
              <div class="top-code">${lb.qrCode}</div>
              <div>款号：${order.styleNo || '-'}</div>
              ${order.styleName ? `<div>款名：${order.styleName}</div>` : ''}
              <div>颜色：${lb.color || '-'}</div>
              <div>码数：${lb.size || '-'}</div>
              <div>数量：${lb.qty}</div>
              <div>序号：${lb.seq}</div>
            </div>
          </div>
        </div>
      `).join('');

      const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>标签打印</title>
  <style>
    @page { size: ${labelW}mm ${labelH}mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${labelW}mm; height: ${labelH}mm; font-family: Arial, "Microsoft YaHei", sans-serif; }
    .print-page {
      width: ${labelW}mm; height: ${labelH}mm; padding: 2mm;
      page-break-after: always;
      display: flex; justify-content: center; align-items: center;
    }
    .print-page:last-child { page-break-after: auto; }
    .label {
      width: ${labelW - 4}mm; height: ${labelH - 4}mm;
      border: 1px solid #000;
      display: flex; flex-direction: row;
      padding: 1.2mm 1.6mm; gap: 1.8mm; background: #fff;
    }
    .qr { flex: 0 0 ${printQrSize + 2.5}mm; display: flex; align-items: center; justify-content: center; }
    .qr img { width: ${printQrSize}mm; height: ${printQrSize}mm; }
    .text {
      flex: 1; display: flex; flex-direction: column;
      justify-content: flex-start;
      font-size: 6.3pt; line-height: 1.22; color: #000; min-width: 0;
    }
    .text > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .top-code {
      font-size: 7.2pt; font-weight: 700;
      border-bottom: 0.8pt dashed #9a9a9a;
      padding-bottom: 0.8mm;
      margin-bottom: 0.9mm;
    }
  </style>
</head>
<body>${labelsHtml}</body>
</html>`;

      /* 4. iframe 打印（与菲号打印完全相同方式） */
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(printHtml);
        iframeDoc.close();

        const imgs = iframeDoc.querySelectorAll('img');
        const totalImgs = imgs.length;
        let loadedCnt = 0;

        const doPrint = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* noop */ } }, 1000);
        };

        if (totalImgs === 0) {
          setTimeout(doPrint, 100);
        } else {
          const onDone = () => { loadedCnt++; if (loadedCnt >= totalImgs) setTimeout(doPrint, 100); };
          imgs.forEach(img => {
            if ((img as HTMLImageElement).complete) onDone();
            else { img.onload = onDone; img.onerror = onDone; }
          });
          setTimeout(() => { if (loadedCnt < totalImgs) doPrint(); }, 5000);
        }
      }
    } finally {
      setPrinting(false);
    }
  }, [order, rows, selectedKeys]);

  /* ── 表格列定义 ── */
  const columns = [
    {
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={partialSelected}
          onChange={toggleAll}
        />
      ),
      width: 36,
      key: 'check',
      render: (_: unknown, record: SkuRow) => (
        <Checkbox
          checked={selectedKeys.includes(record.key)}
          onChange={e => toggleRow(record.key, e.target.checked)}
        />
      ),
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 90,
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    {
      title: '尺码', dataIndex: 'size', key: 'size', width: 80,
      render: (v: string) => <Tag>{v || '-'}</Tag>,
    },
    {
      title: '下单数', dataIndex: 'totalQty', key: 'totalQty',
      width: 80, align: 'right' as const,
    },
    {
      title: '每标签件数',
      key: 'perLabelQty',
      width: 120,
      render: (_: unknown, record: SkuRow) => (
        <InputNumber
          min={1}
          max={record.totalQty || 99999}
          value={record.perLabelQty}
          onChange={v => handlePerLabelChange(record.key, v)}
          style={{ width: 90 }}
          size="small"
        />
      ),
    },
    {
      title: '标签数',
      key: 'labelCount',
      width: 70, align: 'right' as const,
      render: (_: unknown, record: SkuRow) => (
        <Text type="danger" strong>
          {Math.ceil(record.totalQty / Math.max(1, record.perLabelQty))}
        </Text>
      ),
    },
  ];

  return (
    <ResizableModal
      title={`打印标签 — ${order?.orderNo ?? ''}`}
      open={open}
      onCancel={onCancel}
      width="40vw"
      footer={null}
      destroyOnHidden
    >
      {order && (
        <div style={{ marginBottom: 10, color: '#666', fontSize: 12 }}>
          款号：{order.styleNo || '-'}&nbsp;&nbsp;
          款名：{order.styleName || '-'}&nbsp;&nbsp;
          <Text type="secondary">纸张规格：7 × 4 cm（与菲号标签相同）</Text>
        </div>
      )}

      <Spin spinning={loading}>
        {!loading && rows.length === 1 && rows[0].color === '-' && (
          <Alert
            message="未找到裁剪明细，使用订单整体数据打印"
            type="info" showIcon style={{ marginBottom: 10 }}
          />
        )}
        <Table
          dataSource={rows}
          columns={columns}
          pagination={false}
          rowKey="key"
          size="small"
          bordered
        />
      </Spin>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16,
      }}>
        <Text type="secondary">
          已选 {selectedKeys.length} 个规格，合计
          <Text strong type="danger"> {totalLabels} </Text>
          张标签（序号 1→N，最后一张自动补余量）
        </Text>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onCancel}>关闭</Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            loading={printing}
            disabled={totalLabels === 0}
            onClick={() => void handlePrint()}
          >
            网页批量打印
          </Button>
        </div>
      </div>
    </ResizableModal>
  );
}
