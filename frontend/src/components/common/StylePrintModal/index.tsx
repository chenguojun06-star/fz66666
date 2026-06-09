/**
 * 通用样衣/订单打印预览组件
 * 支持选择性打印：基本信息、尺寸表、生产制单、BOM表、工序表、纸样附件等
 * 可在样衣开发、下单管理、大货生产等页面复用
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Checkbox, Button, Space, Spin, QRCode, Radio, InputNumber, Drawer, Image } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import QRCodeLib from 'qrcode';

import api from '@/utils/api';
import { sortSizeNames } from '@/utils/api/size';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { toCategoryCn } from '@/utils/styleCategory';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { message } from '@/utils/antdStatic';
import { useUser } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import { toSeasonCn, PrintOptions, DEFAULT_PRINT_OPTIONS, StylePrintModalProps, PrintData } from './types';
import { buildPrintHtml } from './printTemplate';
import { safePrint } from '@/utils/safePrint';
import { LABEL_SIZE_MAP, parseSizeColorMatrix, resolveLabelItems } from './printDataTransform';

const StylePrintModal: React.FC<StylePrintModalProps> = ({
  visible, onClose, styleId, orderId, orderNo,
  styleNo = '', styleName = '', cover, color, quantity,
  category, season, mode = 'sample', patternProductionId: propPatternId, extraInfo = {}, sizeDetails = [],
  sizes: propSizes, sizeColorConfig,
}) => {
  const { user } = useUser();
  const showPrice = canViewPrice(user);
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [basicInfoFields, setBasicInfoFields] = useState<Set<string>>(new Set([
    'category', 'season', 'price', 'colorSizeMatrix', 'description', 'fabricComposition', 'extraInfo'
  ]));
  const [loading, setLoading] = useState(false);
  const [resolvedCover, setResolvedCover] = useState<string | null>(cover || null);
  const [data, setData] = useState<PrintData>({ sizes: [], bom: [], process: [], attachments: [], productionSheet: null });
  const [labelPrintMode, setLabelPrintMode] = useState(false);
  const [labelSize, setLabelSize] = useState<LabelSize>('40x70');
  const [labelCount, setLabelCount] = useState(1);
  const [labelPrinting, setLabelPrinting] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [autoPatternId, setAutoPatternId] = useState<string | null>(null);
  const [qrPngDataUrl, setQrPngDataUrl] = useState<string>('');
  const resolvedPatternId = propPatternId ? String(propPatternId) : autoPatternId;
  type LabelSize = '40x70' | '50x100';

  const sizeColorMatrix = useMemo(() => {
    return parseSizeColorMatrix(sizeColorConfig || (extraInfo as any)?.sizeColorConfig);
  }, [sizeColorConfig, extraInfo]);


  const labelItems = useMemo(() => {
    return resolveLabelItems(sizeDetails, data.productionSheet, color ?? '', quantity ?? 0);
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
        .catch((err) => { console.warn('[StylePrint] 款式花型匹配失败:', err?.message || err); });
    }
    const loadData = async () => {
      setLoading(true);
      try {
        const newData: PrintData = { sizes: [], bom: [], process: [], attachments: [], productionSheet: null };
        const promises: Promise<any>[] = [];
        promises.push(getStyleInfoByRef(styleId, styleNo).then((styleInfo) => { if (styleInfo) newData.productionSheet = styleInfo; }).catch((err) => { console.warn('[StylePrint] 款式信息加载失败:', err?.message || err); }));
        promises.push(api.get('/style/size/list', { params: { styleId } }).then(res => { if (res.code === 200) newData.sizes = res.data || []; }).catch((err) => { console.warn('[StylePrint] 尺码数据加载失败:', err?.message || err); }));
        promises.push(api.get('/style/bom/list', { params: { styleId } }).then(res => { if (res.code === 200) newData.bom = res.data || []; }).catch((err) => { console.warn('[StylePrint] BOM数据加载失败:', err?.message || err); }));
        promises.push(api.get('/style/process/list', { params: { styleId } }).then(res => { if (res.code === 200) newData.process = res.data || []; }).catch((err) => { console.warn('[StylePrint] 工序数据加载失败:', err?.message || err); }));
        promises.push(api.get('/style/attachment/list', { params: { styleId } }).then(res => {
          if (res.code === 200) {
            newData.attachments = (res.data || []).filter((item: any) => {
              const bizType = String(item.bizType || '');
              return bizType.startsWith('pattern') || bizType === 'size_table' || bizType === 'production_sheet';
            });
          }
        }).catch((err) => { console.warn('[StylePrint] 附件列表加载失败:', err?.message || err); }));
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
  }, [visible, styleId, mode, propPatternId, styleNo, cover]);

  const handlePrint = async () => {
    setPrintLoading(true);
    try {
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
    } finally { setPrintLoading(false); }
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
html,body{width:${w}mm;min-height:${h}mm;color:#000!important;background:#fff!important}
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
  }, [labelItems, isPatternPrint, resolvedPatternId, orderId, styleNo, styleName, orderNo, color, quantity, mode, labelSize, labelCount]);

  const getModeTitle = () => {
    switch (mode) {
      case 'sample': return '样衣';
      case 'order': return '下单';
      case 'production': return '生产';
      default: return '';
    }
  };

  return (
    <Drawer title={`打印预览 - ${styleNo}`} open={visible} onClose={onClose}
      placement="right"
      width={Math.min(1600, Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.85 : 1600))}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
      }}
      maskClosable={false}
      footer={null}
    >
      <div style={{ padding: '16px', flex: 1, overflow: 'auto' }}>
        <Spin spinning={loading}>
          {/* 顶部操作栏 */}
          <div style={{ marginBottom: 12, padding: '10px 16px',
            background: 'linear-gradient(90deg, #f0f5ff 0%, #e6f7ff 100%)',
            borderRadius: 8, border: '1px solid #91d5ff',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ fontWeight: 600, color: '#1d39c4' }}> 打印预览</div>
            <Space>
              <Button icon={<PrinterOutlined />} onClick={() => setLabelPrintMode(v => !v)}>打印标签</Button>
              <Button type="primary" onClick={() => void handlePrint()} loading={printLoading}>打印</Button>
            </Space>
          </div>
          {/* 打印选项 */}
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f2f5', borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '32px' }}> 选择打印内容：</div>
                <Checkbox.Group
                  value={Object.keys(options).filter(k => options[k as keyof PrintOptions])}
                  onChange={(values) => { 
                    setOptions({ 
                      basicInfo: values.includes('basicInfo'), 
                      sizeTable: values.includes('sizeTable'), 
                      bomTable: values.includes('bomTable'), 
                      processTable: values.includes('processTable'), 
                      productionSheet: values.includes('productionSheet'), 
                      sampleReview: values.includes('sampleReview'),
                      styleInfoBlock: values.includes('styleInfoBlock'),
                      customerInfoBlock: values.includes('customerInfoBlock'),
                      patternInfoBlock: values.includes('patternInfoBlock'),
                      timeInfoBlock: values.includes('timeInfoBlock'),
                      remarkBlock: values.includes('remarkBlock'),
                    }); 
                  }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}
                >
                  <Checkbox value="basicInfo">基本信息</Checkbox>
                  <Checkbox value="sizeTable">尺寸表</Checkbox>
                  <Checkbox value="bomTable">BOM表</Checkbox>
                  <Checkbox value="processTable">工序表</Checkbox>
                  <Checkbox value="productionSheet">生产制单</Checkbox>
                  <Checkbox value="sampleReview">样衣审核</Checkbox>
                </Checkbox.Group>
              </div>
            </div>
            {/* 基本信息字段细化选择 */}
            {options.basicInfo && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-bg-base)', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontWeight: 500, color: '#666', marginBottom: 8, fontSize: 13 }}>基本信息区块（可多选）：</div>
                <Checkbox.Group
                  value={Object.keys(options).filter(k => 
                    ['styleInfoBlock', 'customerInfoBlock', 'patternInfoBlock', 'timeInfoBlock', 'remarkBlock'].includes(k) && 
                    options[k as keyof PrintOptions]
                  )}
                  onChange={(values) => { 
                    setOptions(prev => ({ 
                      ...prev,
                      styleInfoBlock: values.includes('styleInfoBlock'),
                      customerInfoBlock: values.includes('customerInfoBlock'),
                      patternInfoBlock: values.includes('patternInfoBlock'),
                      timeInfoBlock: values.includes('timeInfoBlock'),
                      remarkBlock: values.includes('remarkBlock'),
                    })); 
                  }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}
                >
                  <Checkbox value="styleInfoBlock">款号信息</Checkbox>
                  <Checkbox value="customerInfoBlock">客户信息</Checkbox>
                  <Checkbox value="patternInfoBlock">版次信息</Checkbox>
                  <Checkbox value="timeInfoBlock">时间信息</Checkbox>
                  <Checkbox value="remarkBlock">备注信息</Checkbox>
                </Checkbox.Group>
              </div>
            )}
          </div>
          {/* 标签打印选项 */}
          {labelPrintMode && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff7e6', borderRadius: 12, border: '1px solid #ffd591' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: '#d46b08', whiteSpace: 'nowrap' }}>标签打印：</span>
                <Radio.Group value={labelSize} onChange={e => setLabelSize(e.target.value)}>
                  <Radio.Button value="40x70">4 × 7 cm</Radio.Button>
                  <Radio.Button value="50x100">5 × 10 cm</Radio.Button>
                </Radio.Group>
                <span style={{ whiteSpace: 'nowrap' }}>每组份数：</span>
                <InputNumber min={1} max={200} value={labelCount} onChange={v => setLabelCount(v ?? 1)} style={{ width: 80 }} />
                <Button type="primary" icon={<PrinterOutlined />} loading={labelPrinting} onClick={handleLabelPrint}>
                  打印标签{labelItems.length > 0 ? ` (${labelItems.length * labelCount}张)` : ''}
                </Button>
              </div>
              {labelItems.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 14, color: '#8c6d1f' }}>
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
              {/* 标题行 */}
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#111', padding: '8px 14px', background: 'linear-gradient(90deg, #f0f5ff 0%, #e6f7ff 100%)', borderRadius: 6, border: '1px solid #91d5ff' }}>
                {styleNo} - {styleName}
              </div>
              {/* 主体：左列（图片+二维码） + 右列（信息） */}
              <div style={{ display: 'flex', gap: 20, padding: 16, border: '1px solid var(--color-border-antd)', background: '#fff', borderRadius: 8 }}>
                {/* 左侧：图片 + 二维码（纵向排列） */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 120 }}>
                  {resolvedCover ? (
                    <Image src={getFullAuthedFileUrl(resolvedCover)} alt={styleNo}
                      style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)' }} preview={{ cover: <span>预览</span> }} />
                  ) : (
                    <div style={{ width: 120, height: 120, borderRadius: 6, border: '1px dashed #ccc', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>无图片</div>
                  )}
                  {/* 二维码 */}
                  <div style={{ width: 120, height: 120, padding: 6, border: '1px solid var(--color-border-antd)', borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {qrPngDataUrl
                      ? <img src={qrPngDataUrl} alt="QR" style={{ width: 100, height: 100, display: 'block' }} />
                      : <QRCode value={qrValue} size={100} />}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>扫码查看详情</div>
                </div>

                {/* 右侧：4个分组，每组标题 + 横向一排字段（标签:值 同行） */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(() => {
                    // 构建所有分组 — 所有标签不管有没有值都显示
                    const groups: {
                      title: string;
                      fields: { label: string; value: React.ReactNode }[];
                    }[] = [];

                    const empty = '';

                    // 款号信息（sample 模式）
                    if (mode === 'sample' && options.styleInfoBlock) {
                      const styleFields: { label: string; value: React.ReactNode }[] = [];
                      styleFields.push({ label: '款号', value: styleNo || empty });
                      styleFields.push({ label: 'SKC', value: (data.productionSheet as any)?.skc || empty });
                      styleFields.push({ label: '款名', value: styleName || empty });
                      styleFields.push({ label: '品类', value: toCategoryCn(category || (data.productionSheet as any)?.category) || empty });
                      styleFields.push({ label: '季节', value: toSeasonCn(season || (data.productionSheet as any)?.season) || empty });
                      if ((data.productionSheet as any)?.uCode) styleFields.push({ label: 'U码', value: (data.productionSheet as any).uCode });
                      groups.push({ title: '款号信息', fields: styleFields });
                    }

                    // 款号信息（production/order 模式）
                    if ((mode === 'production' || mode === 'order') && options.styleInfoBlock) {
                      const styleFields: { label: string; value: React.ReactNode }[] = [];
                      styleFields.push({ label: '款号', value: styleNo || empty });
                      styleFields.push({ label: 'SKC', value: (data.productionSheet as any)?.skc || empty });
                      styleFields.push({ label: '款名', value: styleName || empty });
                      styleFields.push({ label: '品类', value: toCategoryCn(category || (data.productionSheet as any)?.category) || empty });
                      groups.push({ title: '款号信息', fields: styleFields });
                    }

                    // 客户信息
                    if (options.customerInfoBlock) {
                      if (mode === 'sample') {
                        const fields: { label: string; value: React.ReactNode }[] = [
                          { label: '客户', value: (data.productionSheet as any)?.customer || empty },
                          { label: '跟单员', value: (data.productionSheet as any)?.orderType || empty },
                          { label: '设计师', value: (data.productionSheet as any)?.sampleNo || empty },
                          { label: '打板价', value: (data.productionSheet as any)?.price ? `¥${Number((data.productionSheet as any).price).toFixed(2)}` : empty },
                        ];
                        groups.push({ title: '客户信息', fields });
                      } else {
                        // production/order: 订单号 + 颜色尺码矩阵 + 客户 + 跟单员
                        const fields: { label: string; value: React.ReactNode }[] = [
                          { label: '订单号', value: orderNo || empty },
                        ];
                        // 如果有尺码矩阵，渲染成小表格
                        if (sizeColorMatrix && sizeColorMatrix.sizes.length > 0) {
                          fields.push({ label: '颜色尺码', value: '（见下方矩阵）' });
                        } else {
                          fields.push({ label: '订单数量', value: quantity !== undefined ? String(quantity) : empty });
                        }
                        fields.push({ label: '客户', value: (data.productionSheet as any)?.customer || empty });
                        fields.push({ label: '跟单员', value: (data.productionSheet as any)?.orderType || empty });
                        groups.push({ title: '客户信息', fields });
                      }
                    }

                    // 版次信息
                    if (options.patternInfoBlock) {
                      if (mode === 'sample') {
                        const fields: { label: string; value: React.ReactNode }[] = [
                          { label: '板类', value: (data.productionSheet as any)?.plateType || empty },
                          { label: '纸样师', value: (data.productionSheet as any)?.sampleSupplier || empty },
                          { label: '纸样号', value: (data.productionSheet as any)?.patternNo || empty },
                          { label: '车板师', value: (data.productionSheet as any)?.plateWorker || empty },
                        ];
                        groups.push({ title: '版次信息', fields });
                      } else {
                        const factoryName = (data.productionSheet as any)?.factoryName || (extraInfo as any)?.加工厂 || empty;
                        const fields: { label: string; value: React.ReactNode }[] = [
                          { label: '加工厂', value: factoryName },
                          { label: '设计师', value: (data.productionSheet as any)?.sampleNo || empty },
                        ];
                        groups.push({ title: '版次信息', fields });
                      }
                    }

                    // 时间信息
                    if (options.timeInfoBlock) {
                      const fields: { label: string; value: React.ReactNode }[] = [];
                      if (mode === 'sample') {
                        fields.push({ label: '创建时间', value: (data.productionSheet as any)?.createTime ? formatDateTime((data.productionSheet as any).createTime) : empty });
                        fields.push({ label: '交板日期', value: (data.productionSheet as any)?.deliveryDate ? formatDateTime((data.productionSheet as any).deliveryDate) : empty });
                        fields.push({ label: '完成时间', value: (data.productionSheet as any)?.completedTime ? formatDateTime((data.productionSheet as any).completedTime) : empty });
                      } else {
                        fields.push({ label: '交期', value: (extraInfo as any)?.交期 ? formatDateTime((extraInfo as any).交期) : empty });
                        fields.push({ label: '创建时间', value: (data.productionSheet as any)?.createTime ? formatDateTime((data.productionSheet as any).createTime) : empty });
                        fields.push({ label: '完成时间', value: (data.productionSheet as any)?.completedTime ? formatDateTime((data.productionSheet as any).completedTime) : empty });
                      }
                      groups.push({ title: '时间信息', fields });
                    }

                    // 面料成分（总是显示标签）
                    const fabricVal = (data.productionSheet as any)?.fabricComposition;

                    // 渲染分组：标题 + 横向字段（标签:值 同一行）
                    const cellStyle: React.CSSProperties = {
                      border: '1px solid #e8e8e8',
                      padding: '6px 8px',
                      background: '#fafafa',
                      borderRadius: 4,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    };
                    const labelCellStyle: React.CSSProperties = {
                      fontSize: 12,
                      color: '#666',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    };
                    const valueCellStyle: React.CSSProperties = {
                      fontSize: 12,
                      color: '#111',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    };

                    return (
                      <>
                        {groups.map((group, gi) => (
                          <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1890ff' }}>{group.title}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(group.fields.length, 5)}, 1fr)`, gap: 8 }}>
                              {group.fields.map((f, fi) => (
                                <div key={fi} style={cellStyle}>
                                  <span style={labelCellStyle}>{f.label}：</span>
                                  <span style={valueCellStyle}>{f.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {/* 面料成分 — 总是显示标签 */}
                        {options.styleInfoBlock && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1890ff' }}>面料成分</div>
                            <div style={{ padding: '6px 8px', background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 4, fontSize: 12, color: '#111', lineHeight: 1.5 }}>
                              {fabricVal || empty}
                            </div>
                          </div>
                        )}
                        {/* 备注 — 总是显示标签 */}
                        {options.remarkBlock && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1890ff' }}>备注</div>
                            <div style={{ padding: '6px 8px', background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 4, fontSize: 12, color: '#111', lineHeight: 1.5 }}>
                              {(data.productionSheet as any)?.description || empty}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* 码数/颜色/数量配置表（如果有） */}
              {sizeColorMatrix && sizeColorMatrix.sizes.length > 0 && (
                <div style={{ marginTop: 12, padding: 16, border: '1px solid var(--color-border-antd)', background: '#fff', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: 8, fontSize: 12, paddingBottom: 6, borderBottom: '1px solid #e8e8e8' }}>码数/颜色/数量配置</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid var(--color-border-antd)', padding: '8px 12px', background: 'var(--color-bg-container)', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left', width: 100 }}>颜色/尺码</th>
                          {sizeColorMatrix.sizes.map(s => <th key={s} style={{ border: '1px solid var(--color-border-antd)', padding: '8px 12px', background: 'var(--color-bg-container)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>{s}</th>)}
                          <th style={{ border: '1px solid var(--color-border-antd)', padding: '8px 12px', background: 'var(--color-bg-container)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>合计</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sizeColorMatrix.matrixRows.map((row, i) => {
                          const rowTotal = row.quantities.reduce((s, q) => s + q, 0);
                          return (
                            <tr key={row.color || i}>
                              <td style={{ border: '1px solid var(--color-border-antd)', padding: '6px 12px', fontWeight: 500 }}>{row.color || '-'}</td>
                              {sizeColorMatrix.sizes.map((_, ci) => <td key={ci} style={{ border: '1px solid var(--color-border-antd)', padding: '6px 12px', textAlign: 'center' }}>{row.quantities[ci] || 0}</td>)}
                              <td style={{ border: '1px solid var(--color-border-antd)', padding: '6px 12px', textAlign: 'center', fontWeight: 600 }}>{rowTotal}</td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td style={{ border: '1px solid var(--color-border-antd)', padding: '6px 12px', background: 'rgba(37,99,235,0.04)', fontWeight: 700 }}>合计</td>
                          {sizeColorMatrix.sizes.map((_, ci) => {
                            const colTotal = sizeColorMatrix.matrixRows.reduce((s, r) => s + (r.quantities[ci] || 0), 0);
                            return <td key={ci} style={{ border: '1px solid var(--color-border-antd)', padding: '6px 12px', textAlign: 'center', background: 'rgba(37,99,235,0.04)', fontWeight: 700 }}>{colTotal}</td>;
                          })}
                          <td style={{ border: '1px solid var(--color-border-antd)', padding: '6px 12px', textAlign: 'center', background: 'rgba(37,99,235,0.08)', fontWeight: 700, color: '#1890ff' }}>
                            {sizeColorMatrix.matrixRows.reduce((s, r) => s + r.quantities.reduce((a, b) => a + b, 0), 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'right', marginTop: 8, color: '#999', fontSize: 12 }}>
                打印时间：{formatDateTime(new Date())}
              </div>
            </div>
          )}
          {/* 样衣审核 */}
          {options.sampleReview && (() => {
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
                <div className="print-section-title">样衣审核</div>
                <div style={{ border: '1px solid var(--color-border)', padding: '12px 14px', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, lineHeight: '24px' }}>
                    <div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>审核状态：</span>
                      <span style={{ fontWeight: 600 }}>{reviewLabel || '-'}</span>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>审核人：</span>
                      <span>{sampleReviewer || '-'}</span>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>审核时间：</span>
                      <span>{sampleReviewTime ? formatDateTime(sampleReviewTime) : '-'}</span>
                    </div>
                    {sampleReviewComment && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border-light)' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>审核评语：</span>
                        <div style={{ marginTop: 4, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                          {sampleReviewComment}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 生产制单（生产要求） */}
          {options.productionSheet && (() => {
            const description = data.productionSheet?.description || '';
            return (
              <div className="print-section">
                <div className="print-section-title"> 生产要求</div>
                <div style={{ border: '1px solid var(--color-border)', padding: '12px 14px', borderRadius: 4, fontSize: 'var(--font-size-xs)', whiteSpace: 'pre-wrap', lineHeight: 1.8, minHeight: 40 }}>
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
                                    <Image key={url} src={getFullAuthedFileUrl(url)} style={{ width: '100%', height: row.chunkImgs.length > 1 ? 120 : 220, objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', background: 'var(--color-bg-base)', padding: 4, boxSizing: 'border-box' as const }} preview={{ cover: <span>预览</span> }} />
                                  ))}
                                </div>
                              : <span style={{ color: '#ccc', fontSize: 14 }}>无图</span>
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
                    render: (v: number) => v ? formatMoney(Number(v)) : '-' }] : []),
                  { title: '备注', dataIndex: 'remark', key: 'remark' },
                  { title: '图片', dataIndex: 'imageUrls', key: 'image', width: 90,
                    render: (v: string) => {
                      const imgs: string[] = (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
                      if (!imgs.length) return null;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {imgs.map((url: string) => (
                            <Image key={url} src={getFullAuthedFileUrl(url)} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 3, border: '1px solid #eee' }} preview={{ cover: <span>预览</span> }} />
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
               
                pagination={false}
                bordered
                columns={[
                  { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
                  { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 150 },
                  { title: '工序编码', dataIndex: 'processCode', key: 'processCode', width: 100 },
                  { title: '工时(秒)', dataIndex: 'standardTime', key: 'standardTime', width: 80, align: 'right' as const },
                  ...(showPrice ? [{ title: '单价', dataIndex: 'price', key: 'price', width: 80, align: 'right' as const,
                    render: (v: number) => v ? formatMoney(Number(v)) : '-' }] : []),
                  { title: '备注', dataIndex: 'remark', key: 'remark' },
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
      </div>
    </Drawer>
  );
};

export default StylePrintModal;
