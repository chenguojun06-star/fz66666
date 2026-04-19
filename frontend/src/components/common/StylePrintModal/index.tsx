/**
 * 通用样衣/订单打印预览组件
 * 支持选择性打印：基本信息、尺寸表、生产制单、BOM表、工序表、纸样附件等
 * 可在样衣开发、下单管理、大货生产等页面复用
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Checkbox, Button, Space, Spin, QRCode, Radio, InputNumber } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import QRCodeLib from 'qrcode';

import api from '@/utils/api';
import { sortSizeNames } from '@/utils/api/size';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { toCategoryCn } from '@/utils/styleCategory';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import StandardModal from '@/components/common/StandardModal';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { message } from '@/utils/antdStatic';
import { useAuth } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import { toSeasonCn, PrintOptions, DEFAULT_PRINT_OPTIONS, StylePrintModalProps, PrintData } from './types';
import { buildPrintHtml } from './printTemplate';
import { safePrint } from '@/utils/safePrint';

type LabelSize = '40x70' | '50x100';
const LABEL_SIZE_MAP: Record<LabelSize, [number, number]> = {
  '40x70': [70, 40],
  '50x100': [100, 50],
};

const StylePrintModal: React.FC<StylePrintModalProps> = ({
  visible, onClose, styleId, orderId, orderNo,
  styleNo = '', styleName = '', cover, color, quantity,
  category, season, mode = 'sample', patternProductionId: propPatternId, extraInfo = {}, sizeDetails = [],
  sizes: propSizes, sizeColorConfig,
}) => {
  const { user } = useAuth();
  const showPrice = canViewPrice(user);
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [resolvedCover, setResolvedCover] = useState<string | null>(cover || null);
  const [data, setData] = useState<PrintData>({ sizes: [], bom: [], process: [], attachments: [], productionSheet: null });
  const [labelPrintMode, setLabelPrintMode] = useState(false);
  const [labelSize, setLabelSize] = useState<LabelSize>('40x70');
  const [labelCount, setLabelCount] = useState(1);
  const [labelPrinting, setLabelPrinting] = useState(false);
  const [autoPatternId, setAutoPatternId] = useState<string | null>(null);
  const [qrPngDataUrl, setQrPngDataUrl] = useState<string>('');
  const resolvedPatternId = propPatternId ? String(propPatternId) : autoPatternId;

  /* ---- 解析 sizeColorConfig（开发详情的权威数据） ---- */
  const sizeColorMatrix = useMemo(() => {
    const raw = sizeColorConfig || (extraInfo as any)?.sizeColorConfig;
    if (!raw) return null;
    try {
      const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const sizes: string[] = Array.isArray(config.sizes) ? config.sizes.map((s: unknown) => String(s || '').trim()).filter(Boolean) : [];
      const matrixRows: Array<{ color: string; quantities: number[] }> = Array.isArray(config.matrixRows)
        ? config.matrixRows.map((row: any) => ({
            color: String(row?.color || '').trim(),
            quantities: Array.isArray(row?.quantities) ? row.quantities.map((q: any) => Number(q || 0)) : [],
          }))
        : [];
      if (sizes.length === 0 && matrixRows.length === 0) return null;
      return { sizes, matrixRows };
    } catch { return null; }
  }, [sizeColorConfig, extraInfo]);

  /* ---- 自动识别颜色×码数×数量 ---- */
  const labelItems = useMemo(() => {
    // 优先使用 sizeDetails prop（调用方显式传入）
    if (sizeDetails && sizeDetails.length > 0) {
      return sizeDetails.filter(d => d.quantity > 0);
    }
    // 其次解析 productionSheet 的 sizeColorConfig
    const raw = (data.productionSheet as any)?.sizeColorConfig;
    if (raw) {
      try {
        const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const sizes: string[] = config.sizes || [];
        const matrixRows: Array<{ color: string; quantities: number[] }> = config.matrixRows || [];
        if (matrixRows.length > 0 && sizes.length > 0) {
          return matrixRows.flatMap(row =>
            row.quantities.map((qty: number, idx: number) => ({
              color: row.color,
              size: sizes[idx] || '',
              quantity: qty || 0,
            }))
          ).filter(item => item.quantity > 0 && item.size);
        }
        // 仅有 colors + sizes 无 matrixRows 时，生成空数量占位
        const colors: string[] = config.colors || [];
        if (colors.length > 0 && sizes.length > 0) {
          return colors.flatMap(c => sizes.map(s => ({ color: c, size: s, quantity: 0 })));
        }
      } catch { /* ignore parse error */ }
    }
    // 兜底：使用 props 单色/单数量
    if (color) {
      return [{ color, size: '', quantity: quantity ?? 0 }];
    }
    return [];
  }, [sizeDetails, data.productionSheet, color, quantity]);

  useEffect(() => { setResolvedCover(cover || null); }, [cover]);

  useEffect(() => {
    if (!visible || !styleId) return;
    setLabelPrintMode(false);
    setAutoPatternId(null);
    // 样衣模式下自动查询样衣生产记录ID（用于二维码）
    if (mode === 'sample' && !propPatternId && styleNo) {
      api.get('/production/pattern/list', { params: { page: 1, pageSize: 20, keyword: styleNo } })
        .then(res => {
          const records = Array.isArray(res?.data?.records) ? res.data.records : [];
          const matched = records.find((item: any) => String(item.styleId || '') === String(styleId || ''))
            || records.find((item: any) => String(item.styleNo || '') === String(styleNo || ''));
          if (matched?.id) setAutoPatternId(String(matched.id));
        })
        .catch(() => {});
    }
    const loadData = async () => {
      setLoading(true);
      try {
        const newData: PrintData = { sizes: [], bom: [], process: [], attachments: [], productionSheet: null };
        const promises: Promise<any>[] = [];
        promises.push(getStyleInfoByRef(styleId, styleNo).then((styleInfo) => { if (styleInfo) newData.productionSheet = styleInfo; }).catch(() => {}));
        promises.push(api.get('/style/size/list', { params: { styleId } }).then(res => { if (res.code === 200) newData.sizes = res.data || []; }).catch(() => {}));
        promises.push(api.get('/style/bom/list', { params: { styleId } }).then(res => { if (res.code === 200) newData.bom = res.data || []; }).catch(() => {}));
        promises.push(api.get('/style/process/list', { params: { styleId } }).then(res => { if (res.code === 200) newData.process = res.data || []; }).catch(() => {}));
        promises.push(api.get('/style/attachment/list', { params: { styleId } }).then(res => {
          if (res.code === 200) {
            newData.attachments = (res.data || []).filter((item: any) => {
              const bizType = String(item.bizType || '');
              return bizType.startsWith('pattern') || bizType === 'size_table' || bizType === 'production_sheet';
            });
          }
        }).catch(() => {}));
        await Promise.all(promises);
        setData(newData);
        if (!cover) {
          const styleData = newData.productionSheet as any;
          if (styleData?.cover) { setResolvedCover(styleData.cover); }
          else {
            try {
              const attachRes = await api.get<{ code: number; data: any[] }>('/style/attachment/list', { params: { styleId } });
              if (attachRes.code === 200) {
                const images = (attachRes.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
                if (images.length > 0) { setResolvedCover((images[0] as any)?.fileUrl || null); }
              }
            } catch { /* ignore */ }
          }
        }
      } catch (error) { console.error('加载打印数据失败:', error); message.error('加载打印数据失败'); }
      finally { setLoading(false); }
    };
    loadData();
  }, [visible, styleId, mode, propPatternId, styleNo]);

  const handlePrint = () => {
    const hasSelection = Object.values(options).some(v => v);
    if (!hasSelection) { message.warning('请至少选择一项打印内容'); return; }
    const printContent = document.getElementById('style-print-content');
    if (!printContent) { message.error('无法获取打印内容'); return; }
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const printerName = userInfo.name || userInfo.username || '未知用户';
    const printerAccount = userInfo.username || '';
    const headerInfo = [
      styleNo ? `款号: ${styleNo}` : '',
      styleName ? `款名: ${styleName}` : '',
      color ? `颜色: ${color}` : '',
      (propSizes || (extraInfo as any)?.sizes) ? `码数: ${propSizes || (extraInfo as any)?.sizes}` : '',
      (orderNo || orderId) ? `订单号: ${orderNo || orderId}` : '',
    ].filter(Boolean).join('  |  ');
    const printDate = new Date().toLocaleString('zh-CN');
    const printerInfo = printerAccount ? `打印人: ${printerName} (${printerAccount})` : `打印人: ${printerName}`;
    const htmlContent = buildPrintHtml({ headerInfo, printerInfo, printDate, styleNo, bodyHtml: printContent.innerHTML });
    safePrint(htmlContent, `打印预览-${styleNo}`);
  };

  const isPatternPrint = extraInfo?.isPattern === true || (mode === 'sample' && !!resolvedPatternId);
  const qrValue = isPatternPrint && resolvedPatternId
    ? JSON.stringify({ type: 'pattern', id: resolvedPatternId })
    : JSON.stringify({ type: mode === 'production' ? 'order' : 'style', styleNo, styleName, orderId, orderNo: orderNo || '' });

  // 异步把 qrValue 转成 PNG dataURL，供基本信息区<img>使用，确保打印 iframe 序列化时图片可见
  useEffect(() => {
    let cancelled = false;
    QRCodeLib.toDataURL(qrValue, { width: 480, margin: 0, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setQrPngDataUrl(url); })
      .catch(() => { if (!cancelled) setQrPngDataUrl(''); });
    return () => { cancelled = true; };
  }, [qrValue]);

  /* ---- 标签打印（自动识别全部颜色×码数） ---- */
  const handleLabelPrint = useCallback(async () => {
    setLabelPrinting(true);
    try {
      const [w, h] = LABEL_SIZE_MAP[labelSize];
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      const sNo = styleNo || '';
      const sName = styleName || '';
      const qrMm = 26;
      const qrPx = 480;
      const fs = h >= 48 ? 6.2 : h >= 38 ? 5.4 : 4.9;

      // 如果 labelItems 为空则兜底单条
      const items = labelItems.length > 0
        ? labelItems
        : [{ color: color || '', size: '', quantity: quantity ?? 0 }];
      const copies = Math.max(1, labelCount);
      const totalLabels = items.length * copies;

      // 批量生成 QR 码（每个颜色×码数生成独立二维码）
      const BATCH = 20;
      const qrUrls: string[] = new Array(totalLabels).fill('');
      for (let i = 0; i < totalLabels; i += BATCH) {
        const batch = Math.min(BATCH, totalLabels - i);
        const urls = await Promise.all(
          Array.from({ length: batch }, (_, j) => {
            const itemIdx = Math.floor((i + j) / copies);
            const item = items[itemIdx];
            const itemQrValue = isPatternPrint && resolvedPatternId
              ? JSON.stringify({ type: 'pattern', id: resolvedPatternId })
              : JSON.stringify({ type: mode === 'production' ? 'order' : 'style', styleNo, styleName, orderId, orderNo: orderNo || '', color: item.color, size: item.size });
            return QRCodeLib.toDataURL(itemQrValue, { width: qrPx, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '');
          }),
        );
        urls.forEach((u, j) => { qrUrls[i + j] = u; });
      }

      // 生成标签 HTML — 每个 item × copies 份
      const labelsHtml = items.flatMap((item, itemIdx) =>
        Array.from({ length: copies }, (_, copyIdx) => {
          const qrIdx = itemIdx * copies + copyIdx;
          const displayText = [sNo, item.color, item.size].filter(Boolean).join(' - ');
          return `<div class="page"><div class="label">
            <div class="qr-col"><img src="${qrUrls[qrIdx]}" style="width:${qrMm}mm;height:${qrMm}mm;display:block;"/></div>
            <div class="info-col">
              <div class="ucode-row">${displayText}</div>
              <div class="info-row"><span class="lbl">款号</span><span class="val">${sNo}</span></div>
              ${sName ? `<div class="info-row"><span class="lbl">款名</span><span class="val">${sName}</span></div>` : ''}
              ${item.color ? `<div class="info-row"><span class="lbl">颜色</span><span class="val">${item.color}</span></div>` : ''}
              ${item.size ? `<div class="info-row"><span class="lbl">码数</span><span class="val">${item.size}</span></div>` : ''}
              ${item.quantity ? `<div class="info-row"><span class="lbl">数量</span><span class="val">${item.quantity}</span></div>` : ''}
              <div class="info-row"><span class="lbl">类型</span><span class="val">${mode === 'production' ? '生产' : '样衣'}</span></div>
              <div class="info-row date-row">${dateStr}</div>
            </div>
          </div></div>`;
        }),
      ).join('\n');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${w}mm ${h}mm;margin:0}*{margin:0;padding:0;box-sizing:border-box}
html,body{color:#000!important;background:#fff!important}
body{font-family:'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',Arial,serif}
.page{width:${w}mm;height:${h}mm;display:flex;align-items:center;justify-content:center;page-break-after:always}
.page:last-child{page-break-after:auto}
.label{width:calc(${w}mm - 3mm);height:calc(${h}mm - 3mm);border:0.8pt solid #333;display:flex;flex-direction:row;align-items:stretch;padding:1.5mm 2.5mm;gap:1.5mm}
.qr-col{flex:0 0 ${qrMm + 1}mm;display:flex;align-items:center;justify-content:center}
.qr-col img{display:block;object-fit:contain}
.info-col{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0;overflow:hidden;padding:0 0 0 0.5mm}
.ucode-row{font-size:${fs + 0.9}pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-bottom:1mm;border-bottom:0.8pt dashed #9a9a9a;margin-bottom:1.1mm}
.info-row{font-size:${fs}pt;display:flex;align-items:baseline;flex-wrap:nowrap;min-width:0;margin-bottom:0.65mm}
.lbl{color:#555!important;white-space:nowrap}.val{font-weight:600;margin-left:0.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.date-row{color:#777!important;font-size:${fs - 0.4}pt;margin-top:2mm;padding-top:0.4mm}
</style></head><body>${labelsHtml}</body></html>`;

      safePrint(html, `标签打印-${styleNo}`);
      message.success(`已发送 ${totalLabels} 张标签到打印机`);
    } catch { message.error('标签打印失败，请重试'); }
    finally { setLabelPrinting(false); }
  }, [labelItems, isPatternPrint, resolvedPatternId, orderId, styleId, styleNo, styleName, orderNo, color, quantity, mode, labelSize, labelCount]);

  const getModeTitle = () => {
    switch (mode) {
      case 'sample': return '样衣';
      case 'order': return '下单';
      case 'production': return '生产';
      default: return '';
    }
  };

  return (
    <StandardModal title={`打印预览 - ${styleNo}`} open={visible} onCancel={onClose} size="lg" footer={null}>
      <Spin spinning={loading}>
        {/* 顶部操作栏 */}
        <div style={{ marginBottom: 12, padding: '10px 16px',
          background: 'linear-gradient(90deg, #f0f5ff 0%, #e6f7ff 100%)',
          borderRadius: 8, border: '1px solid #91d5ff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ fontWeight: 600, color: '#1d39c4' }}> 打印预览</div>
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => setLabelPrintMode(v => !v)}>打印标签</Button>
            <Button type="primary" onClick={handlePrint}>打印</Button>
          </Space>
        </div>
        {/* 打印选项 */}
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f2f5', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap' }}> 选择打印内容：</div>
              <Checkbox.Group
                value={Object.keys(options).filter(k => options[k as keyof PrintOptions])}
                onChange={(values) => { setOptions({ basicInfo: values.includes('basicInfo'), sizeTable: values.includes('sizeTable'), bomTable: values.includes('bomTable'), processTable: values.includes('processTable'), productionSheet: values.includes('productionSheet') }); }}
                style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}
              >
                <Checkbox value="basicInfo">基本信息</Checkbox>
                <Checkbox value="sizeTable">尺寸表</Checkbox>
                <Checkbox value="bomTable">BOM表</Checkbox>
                <Checkbox value="processTable">工序表</Checkbox>
                <Checkbox value="productionSheet">生产制单</Checkbox>
              </Checkbox.Group>
            </div>
          </div>
        </div>
        {/* 标签打印选项 */}
        {labelPrintMode && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff7e6', borderRadius: 12, border: '1px solid #ffd591' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#d46b08', whiteSpace: 'nowrap' }}>标签打印：</span>
              <Radio.Group value={labelSize} onChange={e => setLabelSize(e.target.value)} size="small">
                <Radio.Button value="40x70">4 × 7 cm</Radio.Button>
                <Radio.Button value="50x100">5 × 10 cm</Radio.Button>
              </Radio.Group>
              <span style={{ whiteSpace: 'nowrap' }}>每组份数：</span>
              <InputNumber min={1} max={200} value={labelCount} onChange={v => setLabelCount(v ?? 1)} size="small" style={{ width: 80 }} />
              <Button type="primary" size="small" icon={<PrinterOutlined />} loading={labelPrinting} onClick={handleLabelPrint}>
                打印标签{labelItems.length > 0 ? ` (${labelItems.length * labelCount}张)` : ''}
              </Button>
            </div>
            {labelItems.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#8c6d1f' }}>
                检测到 {[...new Set(labelItems.map(i => i.color))].length} 颜色
                {[...new Set(labelItems.map(i => i.size).filter(Boolean))].length > 0
                  ? ` × ${[...new Set(labelItems.map(i => i.size).filter(Boolean))].length} 码数`
                  : ''}
                {' '}= {labelItems.length} 组，每组 {labelCount} 份，共 {labelItems.length * labelCount} 张标签
              </div>
            )}
          </div>
        )}
        {/* 打印内容预览区域 */}
        <div className="style-print-content" id="style-print-content" style={{ background: 'var(--color-bg-base)', padding: 20, border: '1px solid var(--color-border)', borderRadius: 12 }}>
          <style>{`
            .print-section { margin-bottom: 24px; }
            .print-section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; }
          `}</style>
          {/* 基本信息 */}
          {options.basicInfo && (
            <div className="print-section">
              <div style={{ display: 'flex', gap: 24, padding: 16, borderBottom: '2px solid #d9d9d9', background: 'var(--color-bg-container)', borderRadius: 8 }}>
                {resolvedCover && (
                  <div style={{ flexShrink: 0, width: 120, height: 120 }}>
                    <img src={getFullAuthedFileUrl(resolvedCover)} alt={styleNo}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--font-size-xxl)", fontWeight: 600, marginBottom: 8 }}>{styleNo} - {styleName}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: "var(--font-size-base)" }}>
                    {category && <div><span style={{ color: 'var(--color-text-secondary)' }}>分类：</span><strong>{toCategoryCn(category)}</strong></div>}
                    {season && <div><span style={{ color: 'var(--color-text-secondary)' }}>季节：</span><strong>{toSeasonCn(season)}</strong></div>}
                    {Object.entries(extraInfo).map(([key, value]) => {
                      if (!value || key === 'sizeColorConfig' || key === 'sizes') return null;
                      const display = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
                        ? formatDateTime(value) : String(value);
                      return <div key={key}><span style={{ color: 'var(--color-text-secondary)' }}>{key}：</span><strong>{display}</strong></div>;
                    })}
                  </div>
                  {/* 颜色×码数×数量矩阵 */}
                  {sizeColorMatrix && sizeColorMatrix.sizes.length > 0 && (
                    <div style={{ marginTop: 12, overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 300 }}>
                        <thead>
                          <tr>
                            <th style={{ border: '1px solid #d9d9d9', padding: '6px 10px', background: '#fafafa', fontWeight: 600 }}>颜色/尺码</th>
                            {sizeColorMatrix.sizes.map(s => <th key={s} style={{ border: '1px solid #d9d9d9', padding: '6px 10px', background: '#fafafa', fontWeight: 600, textAlign: 'center' }}>{s}</th>)}
                            <th style={{ border: '1px solid #d9d9d9', padding: '6px 10px', background: '#fafafa', fontWeight: 600, textAlign: 'center' }}>小计</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sizeColorMatrix.matrixRows.map((row, i) => {
                            const rowTotal = row.quantities.reduce((s, q) => s + q, 0);
                            return (
                              <tr key={row.color || i}>
                                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px', fontWeight: 500 }}>{row.color || '-'}</td>
                                {sizeColorMatrix.sizes.map((_, ci) => <td key={ci} style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'center' }}>{row.quantities[ci] || 0}</td>)}
                                <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'center', fontWeight: 600 }}>{rowTotal}</td>
                              </tr>
                            );
                          })}
                          <tr>
                            <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px', background: 'rgba(37,99,235,0.04)', fontWeight: 700 }}>合计</td>
                            {sizeColorMatrix.sizes.map((_, ci) => {
                              const colTotal = sizeColorMatrix.matrixRows.reduce((s, r) => s + (r.quantities[ci] || 0), 0);
                              return <td key={ci} style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'center', background: 'rgba(37,99,235,0.04)', fontWeight: 700 }}>{colTotal}</td>;
                            })}
                            <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'center', background: 'rgba(37,99,235,0.04)', fontWeight: 700 }}>
                              {sizeColorMatrix.matrixRows.reduce((s, r) => s + r.quantities.reduce((a, b) => a + b, 0), 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* 无矩阵数据时的回退显示 */}
                  {!sizeColorMatrix && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: "var(--font-size-base)", marginTop: 4 }}>
                      {color && <div><span style={{ color: 'var(--color-text-secondary)' }}>颜色：</span><strong>{color}</strong></div>}
                      {(propSizes || (extraInfo as any)?.sizes) && <div><span style={{ color: 'var(--color-text-secondary)' }}>码数：</span><strong>{propSizes || (extraInfo as any)?.sizes}</strong></div>}
                      {quantity !== undefined && <div><span style={{ color: 'var(--color-text-secondary)' }}>{getModeTitle()}数量：</span><strong>{quantity}</strong></div>}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  {/* 必须使用 PNG dataURL 的 <img>，不能用 antd <QRCode type="svg">：
                      SVG 元素通过 innerHTML 序列化到打印 iframe 后命名空间会丢失，导致打印预览中二维码不显示。 */}
                  {qrPngDataUrl
                    ? <img src={qrPngDataUrl} alt="QR" style={{ width: 160, height: 160, display: 'block' }} />
                    : <QRCode value={qrValue} size={160} />}
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 8, color: 'var(--color-text-tertiary)', fontSize: "var(--font-size-xs)" }}>
                打印时间：{formatDateTime(new Date())}
              </div>
            </div>
          )}
          {/* 生产制单（生产要求） */}
          {options.productionSheet && (() => {
            const description = data.productionSheet?.description || '';
            const sampleReviewStatus = String((data.productionSheet as any)?.sampleReviewStatus || '').trim().toUpperCase();
            const sampleReviewComment = String((data.productionSheet as any)?.sampleReviewComment || '').trim();
            const sampleReviewer = String((data.productionSheet as any)?.sampleReviewer || '').trim();
            const sampleReviewTime = (data.productionSheet as any)?.sampleReviewTime;
            const reviewLabel =
              sampleReviewStatus === 'PASS' ? '通过'
                : sampleReviewStatus === 'REWORK' ? '需修改'
                  : sampleReviewStatus === 'REJECT' ? '不通过'
                    : sampleReviewStatus === 'PENDING' ? '待审核'
                      : '';
            return (
              <div className="print-section">
                <div className="print-section-title"> 生产要求</div>
                {(reviewLabel || sampleReviewComment || sampleReviewer || sampleReviewTime) && (
                  <div style={{ marginBottom: 10, border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: 6 }}>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>样衣审核</div>
                    <div style={{ fontSize: 12, lineHeight: '20px' }}>
                      <span>审核状态：{reviewLabel || '-'}</span>
                      <span style={{ marginLeft: 16 }}>审核人：{sampleReviewer || '-'}</span>
                      <span style={{ marginLeft: 16 }}>审核时间：{sampleReviewTime ? formatDateTime(sampleReviewTime) : '-'}</span>
                    </div>
                    {sampleReviewComment && (
                      <div style={{ marginTop: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>审核评语：{sampleReviewComment}</div>
                    )}
                  </div>
                )}
                <div style={{ border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: 4, fontSize: 'var(--font-size-xs)', whiteSpace: 'pre-wrap', lineHeight: 1.8, minHeight: 40 }}>
                  {description || <span style={{ color: 'var(--color-text-quaternary)' }}>暂无生产要求</span>}
                </div>
              </div>
            );
          })()}

          {/* 码数明细 IIFE */}
          {options.basicInfo && sizeDetails && sizeDetails.length > 0 && (() => {
            const colors = [...new Set(sizeDetails.map(d => d.color))];
            const sizes = [...new Set(sizeDetails.map(d => d.size))];
            const dataMap: Record<string, Record<string, number>> = {};
            sizeDetails.forEach(d => { if (!dataMap[d.size]) dataMap[d.size] = {}; dataMap[d.size][d.color] = (dataMap[d.size][d.color] || 0) + d.quantity; });
            const colorTotals: Record<string, number> = {};
            colors.forEach(c => { colorTotals[c] = sizeDetails.filter(d => d.color === c).reduce((sum, d) => sum + d.quantity, 0); });
            const grandTotal = sizeDetails.reduce((sum, d) => sum + d.quantity, 0);
            return (
              <div className="print-section">
                <div className="print-section-title"> 码数明细</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: "var(--font-size-sm)" }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-container)' }}>
                      <th style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'left', width: 60 }}>颜色</th>
                      {colors.map(color => <th key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>{color}</th>)}
                      <th style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', width: 80, background: '#e6f7ff' }}>合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', fontWeight: 600 }}>尺码</td>
                      {colors.map(color => <td key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>{sizes.join(' / ')}</td>)}
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', background: '#e6f7ff' }}>-</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', fontWeight: 600 }}>数量</td>
                      {colors.map(color => <td key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>{sizes.map(size => dataMap[size]?.[color] || 0).join(' / ')}</td>)}
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', fontWeight: 600, background: '#e6f7ff' }}>{grandTotal}</td>
                    </tr>
                    <tr style={{ background: 'var(--color-bg-container)' }}>
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', fontWeight: 600 }}>小计</td>
                      {colors.map(color => <td key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{colorTotals[color]}</td>)}
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#e6f7ff', color: 'var(--color-primary)' }}>{grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 尺寸表 — 分组+参考图布局（与纸样开发Tab保持一致） */}
          {options.sizeTable && data.sizes.length > 0 && (() => {
            // ─── 分组辅助（与 StyleSizeTab 同逻辑）───
            const _inferGroup = (pn: string): string => {
              const n = String(pn || '').replace(/\s+/g, '').toLowerCase();
              if (!n) return '其他区';
              const upper = ['衣长','胸围','肩宽','袖长','袖口','袖肥','领围','领宽','领深','门襟','胸宽','摆围','下摆','前长','后长','前胸','后背','袖窿'];
              const lower = ['裤长','腰围','臀围','前浪','后浪','脚口','裤口','腿围','小腿围','大腿围','膝围','坐围','裆','裙长','裙摆'];
              if (upper.some(k => n.includes(k))) return '上装区';
              if (lower.some(k => n.includes(k))) return '下装区';
              return '其他区';
            };
            const _resolveGroup = (gName?: string, pName?: string) => {
              const g = String(gName || '').trim();
              return g || _inferGroup(String(pName || ''));
            };

            // ─── 收集所有尺码并排序 ───
            const sizeNames = [...new Set(data.sizes.map((s: any) => s.sizeName).filter(Boolean))];
            const sortedSizeNames = sortSizeNames([...sizeNames]);

            // ─── 按 sort 字段预排序，与 Tab 保持一致 ───
            const sortedSizes = [...data.sizes].sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0));

            // ─── 构建部位矩阵行 ───
            type PrintRow = { resolvedGroupName: string; partName: string; measureMethod: string; tolerance: number | null; cells: Record<string, number | null>; };
            const partMap = new Map<string, PrintRow>();
            const groupOrder: string[] = [];
            const partOrderPerGroup = new Map<string, string[]>();

            sortedSizes.forEach((s: any) => {
              const rg = _resolveGroup(s.groupName, s.partName);
              const pk = `${rg}::${s.partName}`;
              if (!partMap.has(pk)) {
                partMap.set(pk, { resolvedGroupName: rg, partName: s.partName || '', measureMethod: s.measureMethod || '', tolerance: null, cells: {} });
                if (!groupOrder.includes(rg)) { groupOrder.push(rg); partOrderPerGroup.set(rg, []); }
                partOrderPerGroup.get(rg)!.push(s.partName || '');
              }
              const row = partMap.get(pk)!;
              row.cells[s.sizeName] = s.standardValue != null ? Number(s.standardValue) : null;
              if (row.tolerance === null && s.tolerance != null) row.tolerance = Number(s.tolerance);
            });

            // ─── 每分组取首条有图的记录作参考图（最多2张）───
            const groupImages = new Map<string, string[]>();
            sortedSizes.forEach((s: any) => {
              if (!s.imageUrls) return;
              const rg = _resolveGroup(s.groupName, s.partName);
              if (!groupImages.has(rg)) {
                try { const p: string[] = JSON.parse(s.imageUrls); if (p.length) groupImages.set(rg, p.slice(0, 2)); } catch { /* skip */ }
              }
            });

            // ─── 构建扁平展示行（含 rowspan 元数据）───
            type FlatRow = PrintRow & { key: string; isGroupStart: boolean; groupSpan: number; chunkImgs: string[]; isImgStart: boolean; imgSpan: number; };
            const flatRows: FlatRow[] = [];
            groupOrder.forEach(rg => {
              const parts = partOrderPerGroup.get(rg) || [];
              const imgs = groupImages.get(rg) || [];
              parts.forEach((pn, i) => {
                flatRows.push({ ...partMap.get(`${rg}::${pn}`)!, key: `${rg}::${pn}`, isGroupStart: i === 0, groupSpan: i === 0 ? parts.length : 0, chunkImgs: i === 0 ? imgs : [], isImgStart: i === 0, imgSpan: i === 0 ? parts.length : 0 });
              });
            });

            const thS: React.CSSProperties = { border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', background: 'var(--color-bg-container)', whiteSpace: 'nowrap' as const };
            const tdS: React.CSSProperties = { border: '1px solid var(--color-border)', padding: '6px 8px', verticalAlign: 'middle', fontSize: 'var(--font-size-xs)' };

            return (
              <div className="print-section">
                <div className="print-section-title"> 尺寸表</div>
                {/* table-layout:fixed + 只固定图片/分组列宽，其余列自动均分剩余空间 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, width: 160 }}>参考图</th>
                      <th style={{ ...thS, width: 60 }}>分组</th>
                      <th style={{ ...thS, width: 60, textAlign: 'left' }}>部位(cm)</th>
                      <th style={{ ...thS, width: 100 }}>度量方式</th>
                      {sortedSizeNames.map((sn: string) => <th key={sn} style={{ ...thS, width: 60 }}>{sn}</th>)}
                      <th style={{ ...thS, width: 60 }}>公差(+/-)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map(row => (
                      <tr key={row.key}>
                        {row.isImgStart && (
                          <td rowSpan={row.imgSpan} style={{ ...tdS, verticalAlign: 'top', textAlign: 'center', padding: 6 }}>
                            {row.chunkImgs.length > 0
                              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                                  {row.chunkImgs.map((url: string) => (
                                    <img key={url} src={getFullAuthedFileUrl(url)} style={{ width: '100%', height: row.chunkImgs.length > 1 ? 120 : 220, objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', background: '#fff', padding: 4, boxSizing: 'border-box' as const }} />
                                  ))}
                                </div>
                              : <span style={{ color: '#ccc', fontSize: 11 }}>无图</span>
                            }
                          </td>
                        )}
                        {row.isGroupStart && (
                          <td rowSpan={row.groupSpan} style={{ ...tdS, verticalAlign: 'top', textAlign: 'center', fontWeight: 600 }}>
                            {row.resolvedGroupName}
                          </td>
                        )}
                        <td style={tdS}>{row.partName}</td>
                        <td style={{ ...tdS, textAlign: 'center' }}>{row.measureMethod || '平量'}</td>
                        {sortedSizeNames.map((sn: string) => (
                          <td key={sn} style={{ ...tdS, textAlign: 'center' }}>{row.cells[sn] != null ? row.cells[sn] : '-'}</td>
                        ))}
                        <td style={{ ...tdS, textAlign: 'center' }}>{row.tolerance != null ? `±${row.tolerance}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* BOM表 */}
          {options.bomTable && data.bom.length > 0 && (
            <div className="print-section">
              <div className="print-section-title"> BOM物料清单</div>
              <ResizableTable
                storageKey="print-bom"
                className="print-table"
                dataSource={data.bom}
                rowKey="id"
                size="small"
                pagination={false}
                bordered
                columns={[
                  { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100,
                    render: (v: unknown) => getMaterialTypeLabel(v) },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 150 },
                  { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
                  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
                  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
                  { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const },
                  ...(showPrice ? [{ title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, align: 'right' as const,
                    render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
                  { title: '图片', dataIndex: 'imageUrls', key: 'image', width: 90,
                    render: (v: string) => {
                      const imgs: string[] = (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
                      if (!imgs.length) return null;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {imgs.map((url: string) => (
                            <img key={url} src={getFullAuthedFileUrl(url)} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 3, border: '1px solid #eee' }} />
                          ))}
                        </div>
                      );
                    }
                  },
                ]}
              />
            </div>
          )}

          {/* 工序表 */}
          {options.processTable && data.process.length > 0 && (
            <div className="print-section">
              <div className="print-section-title"> 工序表</div>
              <ResizableTable
                storageKey="print-process"
                className="print-table"
                dataSource={data.process}
                rowKey="id"
                size="small"
                pagination={false}
                bordered
                columns={[
                  { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
                  { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 150 },
                  { title: '工序编码', dataIndex: 'processCode', key: 'processCode', width: 100 },
                  { title: '工时(秒)', dataIndex: 'standardTime', key: 'standardTime', width: 80, align: 'right' as const },
                  ...(showPrice ? [{ title: '单价', dataIndex: 'price', key: 'price', width: 80, align: 'right' as const,
                    render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
                ]}
              />
            </div>
          )}

          {/* 无数据提示 */}
          {!loading && !options.basicInfo && data.sizes.length === 0 && data.bom.length === 0 &&
           data.process.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-tertiary)' }}>
              暂无打印数据，请选择要打印的内容
            </div>
          )}
        </div>
      </Spin>
    </StandardModal>
  );
};

export default StylePrintModal;
