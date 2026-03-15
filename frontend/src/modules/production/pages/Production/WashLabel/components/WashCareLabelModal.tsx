import React, { useState, useEffect } from 'react';
import { Alert, Radio, Button, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProductionOrder } from '@/types/production';
import api from '@/utils/api';

type PaperSize = '40x60' | '50x80' | '60x90';

const PAPER_OPTS: { value: PaperSize; label: string; w: number; h: number }[] = [
  { value: '40x60', label: '40×60mm（小水唛）',  w: 40, h: 60 },
  { value: '50x80', label: '50×80mm（标准水唛）', w: 50, h: 80 },
  { value: '60x90', label: '60×90mm（大水唛）',   w: 60, h: 90 },
];

interface StyleData { fabricComposition?: string; washInstructions?: string; }
interface Props { open: boolean; onCancel: () => void; order: ProductionOrder | null; }

export default function WashCareLabelModal({ open, onCancel, order }: Props) {
  const [loading, setLoading]     = useState(false);
  const [styleData, setStyleData] = useState<StyleData>({});
  const [paperSize, setPaperSize] = useState<PaperSize>('40x60');
  const [printing, setPrinting]   = useState(false);

  const styleId = (order as any)?.styleId as string | undefined;

  useEffect(() => {
    if (!open || !styleId) { setStyleData({}); return; }
    setLoading(true);
    (api as any).get(`/style/info/${styleId}`)
      .then((res: any) => {
        const d = res?.data ?? res ?? {};
        setStyleData({
          fabricComposition: d.fabricComposition,
          washInstructions:  d.washInstructions,
        });
      })
      .catch(() => setStyleData({}))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, styleId]);

  const noInfo = !styleData.fabricComposition && !styleData.washInstructions;
  const paper  = PAPER_OPTS.find(p => p.value === paperSize)!;

  const handlePrint = () => {
    if (!order) return;
    setPrinting(true);
    const { w, h } = paper;
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>洗水唛</title><style>
@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;height:${h}mm;font-family:Arial,"Microsoft YaHei",sans-serif}
.lbl{width:${w}mm;height:${h}mm;padding:3mm;border:1px solid #000;
  display:flex;flex-direction:column;justify-content:space-around}
.ttl{font-size:9pt;font-weight:bold;text-align:center}
.row{font-size:8pt;line-height:1.6}
.hr{border-top:.5px solid #ccc;margin:1.5mm 0}
.muted{color:#555}
</style></head><body><div class="lbl">
  <div class="ttl">${order.styleName || order.styleNo || ''}</div>
  <div class="hr"></div>
  <div class="row"><span class="muted">款号：</span>${order.styleNo || '-'}</div>
  <div class="row"><span class="muted">颜色：</span>${order.color || '-'}</div>
  <div class="row"><span class="muted">码数：</span>${order.size || '-'}</div>
  ${styleData.fabricComposition ? `<div class="hr"></div><div class="row"><span class="muted">成分：</span>${styleData.fabricComposition}</div>` : ''}
  ${styleData.washInstructions  ? `<div class="row">${styleData.washInstructions}</div>` : ''}
</div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /**/ } }, 1000);
        setPrinting(false);
      }, 200);
    } else {
      setPrinting(false);
    }
  };

  return (
    <ResizableModal title="打印洗水唛" open={open} onCancel={onCancel} width="40vw" footer={null} destroyOnClose>
      <Spin spinning={loading}>
        {noInfo && !loading && (
          <Alert
            message="面料成分或洗涤说明未填写"
            description="请先在款式基本信息中完善面料成分和洗涤说明后再打印洗水唛"
            type="warning" showIcon style={{ marginBottom: 16 }}
          />
        )}
        {order && (
          <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>款式信息</div>
            <div style={{ fontSize: 13 }}>
              款号：{order.styleNo || '-'}&nbsp;&nbsp;
              颜色：{order.color  || '-'}&nbsp;&nbsp;
              码数：{order.size   || '-'}
            </div>
            {styleData.fabricComposition && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>成分：{styleData.fabricComposition}</div>
            )}
            {styleData.washInstructions && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>洗涤：{styleData.washInstructions}</div>
            )}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>纸张规格</div>
          <Radio.Group value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)}>
            {PAPER_OPTS.map(p => <Radio key={p.value} value={p.value}>{p.label}</Radio>)}
          </Radio.Group>
        </div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
          提示：建议使用专用标签打印机，或A4纸打印后裁剪。
        </div>
      </Spin>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>
          打印标签
        </Button>
      </div>
    </ResizableModal>
  );
}
