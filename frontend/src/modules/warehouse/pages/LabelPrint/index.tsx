import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, Input, Button, Space, InputNumber, Radio, App, Spin, Row, Col, Image, Divider, Slider, Switch, Collapse, Tooltip, Typography, Select, Dropdown, Modal } from 'antd';
import { PrinterOutlined, SearchOutlined, SettingOutlined, QuestionCircleOutlined, EditOutlined, SaveOutlined, BookOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { safePrint } from '@/utils/safePrint';
import api, { parseProductionOrderLines, sortSizeNames } from '@/utils/api';
import { formatMoney } from '@/utils/format';
import { buildWashLabelPrintHtml, buildWashLabelMultiPageHtml, getDefaultDateText, compositionFromSections, washTextFromInstructions, type WashLabelPrintData } from '@/utils/washLabelPrintTemplate';
import { getEffectiveCareIconCodes, CARE_ICONS } from '@/utils/careIcons';
import BarcodeSvg from '@/components/common/BarcodeSvg';
import { printTemplateApi } from '@/services/system/printTemplateApi';

const { Text } = Typography;

interface OrderInfo {
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  colors: string[];
  sizes: string[];
  cover: string;
  fabricComposition: string;
  fabricCompositionParts: string;
  washInstructions: string;
  uCode: string;
  washTempCode: string;
  bleachCode: string;
  tumbleDryCode: string;
  ironCode: string;
  dryCleanCode: string;
  careIconCodes: string;
  price: number;
  qualityGrade: string;
  executeStandard: string;
  safetyCategory: string;
  inspector: string;
  inspectionDate: string;
}

type PrintType = 'hangtag' | 'barcode' | 'washlabel';

const defaultHang = {
  w: 100, h: 70, titleSz: 11, infoSz: 6.5, brandName: '',
  showStyleNo: true, showColorSize: true, showComposition: true, showOrderNo: false,
  showPrice: true, showUCode: true, showImage: false, showQr: false, showBarcode: false,
  showQualityGrade: true, showExecuteStandard: true, showSafetyCategory: true,
  showInspector: true, showInspectionDate: true,
};
const defaultBar = { w: 40, h: 20, codeSz: 7, textSz: 5.5, showName: true, codeType: 'qr' as 'qr' | 'barcode128' };
const defaultWash = { 
  w: 30, h: 80, 
  titleSz: 7, textSz: 5, careSz: 4, 
  manufacturingText: 'MADE IN CHINA', 
  dateText: '', 
  showManufacturing: true, 
  showDate: true, 
  showCareIcons: true, 
  showComposition: true, 
  showWashInstructions: true 
};

const STORAGE_KEY = 'label-print-settings';

const LabelPrint: React.FC = () => {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderInfo | null>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [printType, setPrintType] = useState<PrintType>('hangtag');
  const [printCount, setPrintCount] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');

  const [coverBase64, setCoverBase64] = useState('');
  
  // 从本地存储加载设置
  const loadSavedSettings = (): { hang: typeof defaultHang; bar: typeof defaultBar; wash: typeof defaultWash } => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          hang: parsed.hang || defaultHang,
          bar: parsed.bar || defaultBar,
          wash: parsed.wash || defaultWash,
        };
      }
    } catch { /* ignore */ }
    return { hang: defaultHang, bar: defaultBar, wash: defaultWash };
  };
  const saved = loadSavedSettings();
  
  const [hang, setHang] = useState(saved.hang);
  const [bar, setBar] = useState(saved.bar);
  const [wash, setWash] = useState(saved.wash);
  
  // 保存设置到本地存储
  const saveSettings = useCallback((newHang?: typeof defaultHang, newBar?: typeof defaultBar, newWash?: typeof defaultWash) => {
    try {
      const current = { hang, bar, wash };
      const toSave = {
        hang: newHang || current.hang,
        bar: newBar || current.bar,
        wash: newWash || current.wash,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [hang, bar, wash]);
  
  // 自动保存设置变化
  useEffect(() => {
    saveSettings(hang, bar, wash);
  }, [hang, bar, wash, saveSettings]);

  const resetSettings = useCallback(() => {
    setHang(defaultHang); setBar(defaultBar); setWash(defaultWash);
  }, []);

  /** Generate an inline SVG string for Code128 barcode (for print HTML) */
  const generateBarcodeSvgString = useCallback((value: string) => {
    try {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgEl, value, { format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 10, margin: 0, background: 'transparent' });
      return svgEl.outerHTML;
    } catch {
      return '';
    }
  }, []);

  // 模板加载
  const loadTemplates = useCallback(async () => {
    try {
      const res = await printTemplateApi.list(printType);
      const data = (res as any)?.data?.data || (res as any)?.data || [];
      setTemplates(Array.isArray(data) ? data : []);
    } catch { setTemplates([]); }
  }, [printType]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleSaveTemplate = useCallback(async () => {
    if (!saveTemplateName.trim()) { message.warning('请输入模板名称'); return; }
    try {
      const config = printType === 'hangtag' ? hang : printType === 'barcode' ? bar : wash;
      await printTemplateApi.save({
        templateName: saveTemplateName.trim(),
        templateType: printType,
        configJson: JSON.stringify(config),
        isDefault: false,
      });
      message.success('模板保存成功');
      setSaveTemplateOpen(false);
      setSaveTemplateName('');
      loadTemplates();
    } catch (e: any) { message.error(e.message || '保存失败'); }
  }, [saveTemplateName, printType, hang, bar, wash, message, loadTemplates]);

  const handleLoadTemplate = useCallback((tpl: any) => {
    try {
      const config = typeof tpl.configJson === 'string' ? JSON.parse(tpl.configJson) : tpl.configJson;
      if (tpl.templateType === 'hangtag') setHang(config);
      else if (tpl.templateType === 'barcode') setBar(config);
      else if (tpl.templateType === 'washlabel') setWash(config);
      message.success(`已加载模板: ${tpl.templateName}`);
    } catch { message.error('模板加载失败'); }
  }, [message]);

  const handleDeleteTemplate = useCallback(async (id: number) => {
    try {
      await printTemplateApi.delete(id);
      message.success('模板已删除');
      loadTemplates();
    } catch (e: any) { message.error(e.message || '删除失败'); }
  }, [message, loadTemplates]);

  const handleSetDefaultTemplate = useCallback(async (id: number) => {
    try {
      await printTemplateApi.setDefault(id);
      message.success('已设为默认模板');
      loadTemplates();
    } catch (e: any) { message.error(e.message || '设置失败'); }
  }, [message, loadTemplates]);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) { message.warning('请输入订单号或款号'); return; }
    setLoading(true);
    try {
      const res = await api.get('/production/order/list', { params: { keyword: keyword.trim(), page: 1, pageSize: 20 } });
      const data = res?.data?.data || res?.data || {};
      const records: any[] = data.records || (Array.isArray(data) ? data : []);
      if (records.length === 0) { message.info('未找到订单'); setOrders([]); setSelectedOrder(null); return; }
      const orderList: OrderInfo[] = [];
      const fetches: Promise<void>[] = [];
      for (const r of records) {
        const lines = parseProductionOrderLines(r).filter((l: any) => String(l?.color || '').trim() && String(l?.size || '').trim());
        const colors = Array.from(new Set(lines.map((l: any) => String(l.color || '').trim()).filter(Boolean)));
        const sizes = sortSizeNames(Array.from(new Set(lines.map((l: any) => String(l.size || '').trim()).filter(Boolean))));
        const order: OrderInfo = { orderId: r.id, orderNo: r.orderNo || '', styleId: r.styleId || '', styleNo: r.styleNo || '', styleName: r.styleName || '', colors, sizes, cover: '', fabricComposition: '', fabricCompositionParts: '', washInstructions: '', uCode: '', washTempCode: '', bleachCode: '', tumbleDryCode: '', ironCode: '', dryCleanCode: '', careIconCodes: '', price: 0, qualityGrade: '', executeStandard: '', safetyCategory: '', inspector: '', inspectionDate: '' };
        orderList.push(order);
        if (r.styleId) {
          fetches.push((async () => {
            try {
              const sr = await api.get(`/style/info/${r.styleId}`);
              const sd = sr?.data?.data || sr?.data || {};
              order.cover = sd.cover || '';
              order.fabricComposition = sd.fabricComposition || '';
              order.fabricCompositionParts = sd.fabricCompositionParts || '';
              order.washInstructions = sd.washInstructions || '';
              order.uCode = sd.uCode || '';
              order.washTempCode = sd.washTempCode || '';
              order.bleachCode = sd.bleachCode || '';
              order.tumbleDryCode = sd.tumbleDryCode || '';
              order.ironCode = sd.ironCode || '';
              order.dryCleanCode = sd.dryCleanCode || '';
              order.careIconCodes = sd.careIconCodes || '';
              order.price = sd.price || 0;
              order.qualityGrade = sd.qualityGrade || '';
              order.executeStandard = sd.executeStandard || '';
              order.safetyCategory = sd.safetyCategory || '';
              order.inspector = sd.inspector || '';
              order.inspectionDate = sd.inspectionDate || '';
            } catch { /* ignore */ }
          })());
        }
      }
      await Promise.allSettled(fetches);
      setOrders(orderList);
      if (orderList.length > 0) {
        const first = orderList[0];
        setSelectedOrder(first);
        setSelectedColor(first.colors[0] || '');
        setSelectedSize(first.sizes[0] || '');
      }
    } catch (e: any) { message.error(e.message || '搜索失败'); } finally { setLoading(false); }
  }, [keyword, message]);

  useEffect(() => {
    const url = selectedOrder?.cover;
    if (!url) { setCoverBase64(''); return; }
    let cancelled = false;
    (async () => {
      try {
        const path = url.replace(/^\/?api\//, '');
        const res = await api.get(path, { responseType: 'blob' });
        if (cancelled) return;
        const blob = res.data;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        if (!cancelled) setCoverBase64(dataUrl);
      } catch { if (!cancelled) setCoverBase64(''); }
    })();
    return () => { cancelled = true; };
  }, [selectedOrder?.cover]);

  const generateHangtagHtml = useCallback(async (count: number) => {
    if (!selectedOrder) return '';
    const sku = `${selectedOrder.styleNo}-${selectedColor}-${selectedSize}`;
    const qrUrl = hang.showQr ? await QRCode.toDataURL(sku, { width: 200, margin: 1, errorCorrectionLevel: 'M' }).catch(() => '') : '';
    const barcodeSvgStr = hang.showBarcode ? generateBarcodeSvgString(selectedOrder.uCode || selectedOrder.styleNo) : '';
    const brand = hang.brandName || selectedOrder.styleName || selectedOrder.styleNo;
    const imgHtml = hang.showImage && coverBase64 ? `<img class="img" src="${coverBase64}" />` : '';
    const ts = hang.titleSz; const isz = hang.infoSz;

    const infoRows: string[] = [];
    if (hang.showStyleNo) infoRows.push(`<div class="row"><span class="lbl">款号</span><span class="val">${selectedOrder.styleNo}</span></div>`);
    if (hang.showColorSize) {
      infoRows.push(`<div class="row"><span class="lbl">颜色</span><span class="val">${selectedColor}</span></div>`);
      infoRows.push(`<div class="row"><span class="lbl">尺码</span><span class="val">${selectedSize}</span></div>`);
    }
    if (hang.showComposition && selectedOrder.fabricComposition) infoRows.push(`<div class="row"><span class="lbl">成分</span><span class="val">${selectedOrder.fabricComposition}</span></div>`);
    if (hang.showQualityGrade && selectedOrder.qualityGrade) infoRows.push(`<div class="row"><span class="lbl">质量等级</span><span class="val">${selectedOrder.qualityGrade}</span></div>`);
    if (hang.showExecuteStandard && selectedOrder.executeStandard) infoRows.push(`<div class="row"><span class="lbl">执行标准</span><span class="val">${selectedOrder.executeStandard}</span></div>`);
    if (hang.showSafetyCategory && selectedOrder.safetyCategory) infoRows.push(`<div class="row"><span class="lbl">安全类别</span><span class="val">${selectedOrder.safetyCategory}</span></div>`);
    if (hang.showOrderNo) infoRows.push(`<div class="row"><span class="lbl">订单号</span><span class="val">${selectedOrder.orderNo}</span></div>`);

    const certRows: string[] = [];
    if (hang.showInspector && selectedOrder.inspector) certRows.push(`<div class="cert-row"><span class="cert-lbl">检验员</span><span class="cert-val">${selectedOrder.inspector}</span></div>`);
    if (hang.showInspectionDate && selectedOrder.inspectionDate) certRows.push(`<div class="cert-row"><span class="cert-lbl">检验日期</span><span class="cert-val">${selectedOrder.inspectionDate}</span></div>`);

    const hasCert = certRows.length > 0;
    const hasPrice = hang.showPrice && selectedOrder.price;
    const hasUCode = hang.showUCode && selectedOrder.uCode;

    const certHtml = hasCert ? `<div class="cert-box"><div class="cert-title">合 格 证</div>${certRows.join('')}</div>` : '';
    const priceHtml = hasPrice ? `<div class="price">${formatMoney(selectedOrder.price!)}</div>` : '';
    const ucodeHtml = hasUCode ? `<div class="ucode">${selectedOrder.uCode}</div>` : '';
    const bottomHtml = (hasPrice || hasUCode) ? `<div class="bottom-bar">${ucodeHtml}${priceHtml}</div>` : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${hang.w}mm ${hang.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${hang.w}mm;min-height:${hang.h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:var(--color-text-primary);background:var(--color-bg-base);-webkit-font-smoothing:antialiased}
.tag{width:${hang.w}mm;height:${hang.h}mm;page-break-after:always;display:flex;flex-direction:column;overflow:hidden;position:relative}
.tag:last-child{page-break-after:auto}
.tag::before{content:'';position:absolute;inset:0;border:1.2pt solid #222;pointer-events:none}
.tag::after{content:'';position:absolute;inset:1.6mm;border:0.4pt solid #999;pointer-events:none}
.inner{padding:4mm 5.5mm;display:flex;flex-direction:column;height:100%;position:relative;z-index:1}
.img{width:100%;max-height:${Math.round(hang.h * 0.28)}mm;object-fit:contain;margin-bottom:2.5mm;border-radius:0.5mm}
.brand{text-align:center;padding-bottom:2.5mm;margin-bottom:2.5mm;position:relative}
.brand-name{font-size:${ts}pt;font-weight:800;letter-spacing:2.5mm;color:#111;line-height:1.3}
.brand-line{width:60%;height:0;border-top:0.8pt solid #222;margin:1.8mm auto 0}
.brand-line::after{content:'';display:block;width:30%;height:0;border-top:0.4pt solid #999;margin:0.8mm auto 0}
.info{flex:1;display:flex;flex-direction:column;justify-content:flex-start}
.row{display:flex;align-items:baseline;padding:0.7mm 0;border-bottom:0.2pt solid #e0e0e0;font-size:${isz}pt;line-height:1.5}
.row:last-child{border-bottom:none}
.lbl{color:#888;min-width:13mm;white-space:nowrap;font-weight:400;flex-shrink:0}
.val{font-weight:600;color:var(--color-text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cert-box{margin-top:auto;border:0.6pt solid #555;padding:1.5mm 2.5mm;position:relative}
.cert-title{font-size:${isz + 0.5}pt;font-weight:700;text-align:center;letter-spacing:2mm;color:#222;margin-bottom:1mm;padding-bottom:0.8mm;border-bottom:0.3pt solid #bbb}
.cert-row{display:flex;align-items:baseline;font-size:${isz - 0.3}pt;padding:0.3mm 0}
.cert-lbl{color:#888;min-width:13mm}
.cert-val{font-weight:600;color:#222}
.bottom-bar{display:flex;justify-content:space-between;align-items:flex-end;padding-top:1.5mm;margin-top:1.5mm;border-top:0.3pt solid #ccc}
.ucode{font-size:${isz - 0.5}pt;color:#888;letter-spacing:0.3mm}
.price{font-size:${ts * 1.15}pt;font-weight:800;color:#c00;letter-spacing:0.5mm}
${hang.showQr ? '.qr{width:14mm;height:auto;margin:1mm auto 0;display:block}' : ''}
${hang.showBarcode ? '.barcode{width:30mm;height:auto;margin:1mm auto 0;display:block}' : ''}
</style></head><body>
${Array.from({ length: count }, () => `<div class="tag"><div class="inner">
${imgHtml}
<div class="brand"><div class="brand-name">${brand}</div><div class="brand-line"></div></div>
<div class="info">${infoRows.join('')}</div>
${certHtml}
${bottomHtml}
${hang.showQr ? `<img class="qr" src="${qrUrl}" />` : ''}
${hang.showBarcode ? `<div class="barcode">${barcodeSvgStr}</div>` : ''}
</div></div>`).join('\n')}
</body></html>`;
  }, [selectedOrder, selectedColor, selectedSize, hang, coverBase64]);

  const generateBarcodeHtml = useCallback(async (count: number) => {
    if (!selectedOrder) return '';
    const sku = `${selectedOrder.styleNo}-${selectedColor}-${selectedSize}`;
    const cs = bar.codeSz; const ts = bar.textSz;
    const isBarcode128 = bar.codeType === 'barcode128';
    const codeImgHtml = isBarcode128
      ? `<div class="barcode-wrap">${generateBarcodeSvgString(sku)}</div>`
      : `<img src="${await QRCode.toDataURL(sku, { width: 160, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '')}" />`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${bar.w}mm ${bar.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${bar.w}mm;min-height:${bar.h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:#000;background:var(--color-bg-base);-webkit-font-smoothing:antialiased}
.lb{width:${bar.w}mm;height:${bar.h}mm;page-break-after:always;display:flex;align-items:center;padding:1.5mm 2.5mm;border:0.6pt solid #333;position:relative}
.lb:last-child{page-break-after:auto}
.lb img{height:${bar.h * 0.65}mm;width:auto;margin-right:2.5mm;flex-shrink:0}
.lb .barcode-wrap{height:${bar.h * 0.65}mm;width:auto;margin-right:2.5mm;flex-shrink:0;display:flex;align-items:center}
.lb .barcode-wrap svg{height:100%;width:auto}
.lb .i{flex:1;display:flex;flex-direction:column;gap:0.5mm;overflow:hidden;min-width:0}
.lb .c{font-size:${cs}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.2mm}
.lb .n{font-size:${ts}pt;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb .s{font-size:${ts * 0.85}pt;color:#888;letter-spacing:0.2mm}
</style></head><body>
${Array.from({ length: count }, () => `<div class="lb">
${codeImgHtml}
<div class="i"><div class="c">${sku}</div>${bar.showName ? `<div class="n">${selectedOrder.styleName}</div>` : ''}<div class="s">${selectedColor} / ${selectedSize}</div></div>
</div>`).join('\n')}
</body></html>`;
  }, [selectedOrder, selectedColor, selectedSize, bar, generateBarcodeSvgString]);

  const generateWashlabelHtml = useCallback(async (count: number) => {
    if (!selectedOrder) return '';
    const careCodes = wash.showCareIcons ? getEffectiveCareIconCodes(
      selectedOrder.careIconCodes,
      { washTempCode: selectedOrder.washTempCode, bleachCode: selectedOrder.bleachCode, tumbleDryCode: selectedOrder.tumbleDryCode, ironCode: selectedOrder.ironCode, dryCleanCode: selectedOrder.dryCleanCode },
      selectedOrder.washInstructions,
    ) : [];
    
    const compositionText = wash.showComposition 
      ? compositionFromSections(selectedOrder.fabricCompositionParts, selectedOrder.fabricComposition) 
      : '';
    const washInstructionsText = wash.showWashInstructions 
      ? washTextFromInstructions(selectedOrder.washInstructions, selectedOrder.fabricCompositionParts) 
      : '';
    const manufacturingText = wash.showManufacturing 
      ? (wash.manufacturingText || 'MADE IN CHINA') 
      : '';
    const dateText = wash.showDate 
      ? (wash.dateText || getDefaultDateText()) 
      : '';
    
    const printData: WashLabelPrintData = {
      width: wash.w,
      height: wash.h,
      compositionText,
      washInstructionsText,
      careIconCodes: careCodes,
      manufacturingText,
      dateText,
    };
    if (count <= 1) return buildWashLabelPrintHtml(printData);
    return buildWashLabelMultiPageHtml(Array.from({ length: count }, () => printData));
  }, [selectedOrder, wash]);

  const generateHtml = useCallback(async (count: number) => {
    if (printType === 'hangtag') return generateHangtagHtml(count);
    if (printType === 'barcode') return generateBarcodeHtml(count);
    return generateWashlabelHtml(count);
  }, [printType, generateHangtagHtml, generateBarcodeHtml, generateWashlabelHtml]);

  const updatePreview = useCallback(async () => {
    if (!selectedOrder) return;
    const html = await generateHtml(1);
    setPreviewHtml(html);
  }, [selectedOrder, generateHtml]);

  useEffect(() => {
    const timer = setTimeout(() => { updatePreview(); }, 80);
    return () => clearTimeout(timer);
  }, [printType, selectedColor, selectedSize, selectedOrder, coverBase64,
    hang.w, hang.h, hang.titleSz, hang.infoSz, hang.brandName, hang.showStyleNo, hang.showColorSize, hang.showComposition, hang.showOrderNo, hang.showPrice, hang.showUCode, hang.showImage, hang.showQr, hang.showBarcode, hang.showQualityGrade, hang.showExecuteStandard, hang.showSafetyCategory, hang.showInspector, hang.showInspectionDate,
    selectedOrder?.fabricComposition, selectedOrder?.qualityGrade, selectedOrder?.executeStandard, selectedOrder?.safetyCategory, selectedOrder?.inspector, selectedOrder?.inspectionDate,
    bar.w, bar.h, bar.codeSz, bar.textSz, bar.showName, bar.codeType,
    wash.w, wash.h,
    updatePreview]);

  const handlePrint = async () => {
    if (!selectedOrder) { message.warning('请先搜索订单'); return; }
    setPrinting(true);
    try { safePrint(await generateHtml(printCount)); } catch (e: any) { message.error(e.message || '打印失败'); } finally { setPrinting(false); }
  };

  const ptLabel = printType === 'hangtag' ? '吊牌' : printType === 'barcode' ? '条码' : '洗水唛';

  const sizePresets: Record<PrintType, { w: number; h: number; label: string }[]> = {
    hangtag: [{ w: 100, h: 70, label: '100×70' }, { w: 90, h: 60, label: '90×60' }, { w: 110, h: 80, label: '110×80' }, { w: 80, h: 50, label: '80×50' }],
    barcode: [{ w: 40, h: 20, label: '40×20' }, { w: 50, h: 25, label: '50×25' }, { w: 60, h: 30, label: '60×30' }],
    washlabel: [{ w: 30, h: 80, label: '30×80' }, { w: 40, h: 60, label: '40×60' }, { w: 50, h: 80, label: '50×80' }, { w: 60, h: 90, label: '60×90' }],
  };

  const toggleRow = <T,>(
    label: string, 
    field: string, 
    checked: boolean,
    setter: (updater: (prev: T) => T) => void
  ) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <Switch size="small" checked={checked} onChange={v => setter(prev => ({ ...prev, [field]: v }))} />
    </div>
  );

  const effectiveCareCodes = selectedOrder
    ? getEffectiveCareIconCodes(
        selectedOrder.careIconCodes,
        { washTempCode: selectedOrder.washTempCode, bleachCode: selectedOrder.bleachCode, tumbleDryCode: selectedOrder.tumbleDryCode, ironCode: selectedOrder.ironCode, dryCleanCode: selectedOrder.dryCleanCode },
        selectedOrder.washInstructions,
      )
    : [];

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={16}>
        <Col span={6}>
          <Card title="打印种类" size="small" style={{ marginBottom: 12 }}>
            <Radio.Group value={printType} onChange={e => setPrintType(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Radio value="hangtag">吊牌 <Tooltip title="产品合格证吊牌，含品牌名/款号/颜色尺码/成分/质量等级/执行标准/安全类别/检验员"><QuestionCircleOutlined style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }} /></Tooltip></Radio>
              <Radio value="barcode">条码 <Tooltip title="贴在包装上的小标签，含二维码和SKU编码"><QuestionCircleOutlined style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }} /></Tooltip></Radio>
              <Radio value="washlabel">洗水唛 <Tooltip title="缝在衣服内侧的标签，含面料成分和洗护说明"><QuestionCircleOutlined style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }} /></Tooltip></Radio>
            </Radio.Group>
          </Card>

          {selectedOrder && (
            <>
              <Card title="打印设置" size="small" style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>打印数量</div>
                  <InputNumber min={1} max={999} value={printCount} onChange={v => setPrintCount(v || 1)} style={{ width: '100%' }} />
                </div>
                <Button type="primary" icon={<PrinterOutlined />} loading={printing} onClick={() => void handlePrint()} block>
                  打印{ptLabel} ({printCount}张)
                </Button>
                <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                  <Button size="small" icon={<SaveOutlined />} style={{ flex: 1 }} onClick={() => setSaveTemplateOpen(true)}>保存模板</Button>
                  {templates.length > 0 && (
                    <Dropdown menu={{ items: templates.map(tpl => ({
                      key: tpl.id,
                      label: (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span>{tpl.templateName}{tpl.isDefault ? ' ★' : ''}</span>
                          <Space size={2}>
                            <Button type="link" size="small" icon={<StarOutlined />} onClick={e => { e.stopPropagation(); handleSetDefaultTemplate(tpl.id); }} />
                            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={e => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }} />
                          </Space>
                        </div>
                      ),
                      onClick: () => handleLoadTemplate(tpl),
                    })) }} trigger={['click']}>
                      <Button size="small" icon={<BookOutlined />} style={{ flex: 1 }}>加载模板</Button>
                    </Dropdown>
                  )}
                </div>
              </Card>

              <Collapse size="small" ghost items={[{
                key: 'settings', label: <span><SettingOutlined style={{ marginRight: 6 }} />{ptLabel}自定义</span>,
                children: (
                  <div style={{ padding: '2px 0' }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>尺寸 (mm)</div>
                      <Space wrap size={4} style={{ marginBottom: 4 }}>
                        {sizePresets[printType].map(p => (
                          <Button key={p.label} size="small"
                            type={printType === 'hangtag' ? (hang.w === p.w && hang.h === p.h ? 'primary' : 'default')
                                : printType === 'barcode' ? (bar.w === p.w && bar.h === p.h ? 'primary' : 'default')
                                : (wash.w === p.w && wash.h === p.h ? 'primary' : 'default')}
                            onClick={() => {
                              if (printType === 'hangtag') setHang(h => ({ ...h, w: p.w, h: p.h }));
                              else if (printType === 'barcode') setBar(b => ({ ...b, w: p.w, h: p.h }));
                              else setWash(w => ({ ...w, w: p.w, h: p.h }));
                            }}>{p.label}</Button>
                        ))}
                      </Space>
                      <Space.Compact>
                        <InputNumber size="small" min={20} max={200}
                          value={printType === 'hangtag' ? hang.w : printType === 'barcode' ? bar.w : wash.w}
                          onChange={v => { if (printType === 'hangtag') setHang(h => ({ ...h, w: v || 100 })); else if (printType === 'barcode') setBar(b => ({ ...b, w: v || 40 })); else setWash(w => ({ ...w, w: v || 90 })); }}
                          style={{ width: 68 }} placeholder="宽" />
                        <InputNumber size="small" min={10} max={200}
                          value={printType === 'hangtag' ? hang.h : printType === 'barcode' ? bar.h : wash.h}
                          onChange={v => { if (printType === 'hangtag') setHang(h => ({ ...h, h: v || 70 })); else if (printType === 'barcode') setBar(b => ({ ...b, h: v || 20 })); else setWash(w => ({ ...w, h: v || 40 })); }}
                          style={{ width: 68 }} placeholder="高" />
                      </Space.Compact>
                    </div>

                    {printType === 'hangtag' && (<>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>品牌名（留空=使用款名）</div>
                        <Input size="small" value={hang.brandName} placeholder={selectedOrder.styleName || selectedOrder.styleNo}
                          onChange={e => setHang(h => ({ ...h, brandName: e.target.value }))} maxLength={20} />
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>标题字号: {hang.titleSz}pt</div>
                        <Slider min={8} max={20} step={0.5} value={hang.titleSz} onChange={v => setHang(h => ({ ...h, titleSz: v }))} />
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>信息字号: {hang.infoSz}pt</div>
                        <Slider min={5} max={12} step={0.5} value={hang.infoSz} onChange={v => setHang(h => ({ ...h, infoSz: v }))} />
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--color-text-quaternary)', margin: '6px 0 4px', fontWeight: 600 }}>显示内容</div>
                      <Space orientation="vertical" style={{ width: '100%' }} size={2}>
                        {toggleRow('款号', 'showStyleNo', hang.showStyleNo, setHang)}
                        {toggleRow('颜色尺码', 'showColorSize', hang.showColorSize, setHang)}
                        {toggleRow('成分', 'showComposition', hang.showComposition, setHang)}
                        {toggleRow('质量等级', 'showQualityGrade', hang.showQualityGrade, setHang)}
                        {toggleRow('执行标准', 'showExecuteStandard', hang.showExecuteStandard, setHang)}
                        {toggleRow('安全类别', 'showSafetyCategory', hang.showSafetyCategory, setHang)}
                        {toggleRow('检验员', 'showInspector', hang.showInspector, setHang)}
                        {toggleRow('检验日期', 'showInspectionDate', hang.showInspectionDate, setHang)}
                        {toggleRow('价格', 'showPrice', hang.showPrice, setHang)}
                        {toggleRow('商品编码', 'showUCode', hang.showUCode, setHang)}
                        {toggleRow('订单号', 'showOrderNo', hang.showOrderNo, setHang)}
                        {toggleRow('商品图', 'showImage', hang.showImage, setHang)}
                        {toggleRow('二维码', 'showQr', hang.showQr, setHang)}
                        {toggleRow('条形码', 'showBarcode', hang.showBarcode, setHang)}
                      </Space>
                    </>)}

                    {printType === 'barcode' && (<>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>码类型</div>
                        <Select
                          value={bar.codeType}
                          onChange={v => setBar(b => ({ ...b, codeType: v }))}
                          style={{ width: '100%' }}
                          options={[
                            { label: '二维码 (QR)', value: 'qr' },
                            { label: '条形码 (Code128)', value: 'barcode128' },
                          ]}
                        />
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>编码字号: {bar.codeSz}pt</div>
                        <Slider min={5} max={14} step={0.5} value={bar.codeSz} onChange={v => setBar(b => ({ ...b, codeSz: v }))} />
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>文字字号: {bar.textSz}pt</div>
                        <Slider min={4} max={10} step={0.5} value={bar.textSz} onChange={v => setBar(b => ({ ...b, textSz: v }))} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 14 }}>显示款式名</span><Switch size="small" checked={bar.showName} onChange={v => setBar(b => ({ ...b, showName: v }))} /></div>
                    </>)}

                    {printType === 'washlabel' && (<>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>制造地</div>
                        <Input size="small" value={wash.manufacturingText} placeholder="MADE IN CHINA"
                          onChange={e => setWash(w => ({ ...w, manufacturingText: e.target.value }))} maxLength={30} />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>日期（留空=自动使用今天）</div>
                        <Input size="small" value={wash.dateText} placeholder="如：20260605"
                          onChange={e => setWash(w => ({ ...w, dateText: e.target.value }))} maxLength={20} />
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--color-text-quaternary)', margin: '6px 0 4px', fontWeight: 600 }}>显示内容</div>
                      <Space orientation="vertical" style={{ width: '100%' }} size={2}>
                        {toggleRow('面料成分', 'showComposition', wash.showComposition, setWash)}
                        {toggleRow('洗涤说明', 'showWashInstructions', wash.showWashInstructions, setWash)}
                        {toggleRow('护理图标', 'showCareIcons', wash.showCareIcons, setWash)}
                        {toggleRow('制造地', 'showManufacturing', wash.showManufacturing, setWash)}
                        {toggleRow('日期', 'showDate', wash.showDate, setWash)}
                      </Space>
                    </>)}

                    <Button size="small" type="link" danger style={{ marginTop: 6, padding: 0 }} onClick={resetSettings}>恢复默认</Button>
                  </div>
                ),
              }]} />
            </>
          )}
        </Col>

        <Col span={18}>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space wrap>
              <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="输入订单号或款号搜索" style={{ width: 220 }} onPressEnter={() => void handleSearch()} prefix={<SearchOutlined />} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => void handleSearch()} loading={loading}>搜索</Button>
              <Button onClick={() => { setKeyword(''); setOrders([]); setSelectedOrder(null); setCoverBase64(''); }}>清空</Button>
            </Space>
          </Card>

          <Spin spinning={loading}>
            {selectedOrder ? (
              <Card>
                <Row gutter={24}>
                  <Col span={7}>
                    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-container)' }}>
                      {coverBase64 ? (
                        <Image src={coverBase64} style={{ maxHeight: 200, objectFit: 'contain' }} />
                      ) : (
                        <div style={{ color: '#ccc', fontSize: 14 }}>暂无图片</div>
                      )}
                    </div>
                  </Col>
                  <Col span={17}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{selectedOrder.styleName || selectedOrder.styleNo}</div>
                    <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>款号: <span style={{ color: 'var(--color-info)' }}>{selectedOrder.styleNo}</span></div>
                    <div style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>订单号: {selectedOrder.orderNo}</div>
                    <Divider style={{ margin: '10px 0' }} />
                    {selectedOrder.colors.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>颜色</div>
                        <Space wrap>{selectedOrder.colors.map(c => (
                          <Button key={c} size="small" type={selectedColor === c ? 'primary' : 'default'} onClick={() => setSelectedColor(c)}>{c}</Button>
                        ))}</Space>
                      </div>
                    )}
                    {selectedOrder.sizes.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>尺码</div>
                        <Space wrap>{selectedOrder.sizes.map(s => (
                          <Button key={s} size="small" type={selectedSize === s ? 'primary' : 'default'} onClick={() => setSelectedSize(s)}>{s}</Button>
                        ))}</Space>
                      </div>
                    )}
                    <Divider style={{ margin: '10px 0' }} />

                    <Collapse size="small" ghost items={[{
                      key: 'edit', label: <span><EditOutlined style={{ marginRight: 6 }} />吊牌信息编辑</span>,
                      children: (
                        <div style={{ padding: '2px 0' }}>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>成分</div>
                            <Input size="small" value={selectedOrder.fabricComposition} placeholder="如：100%棉"
                              onChange={e => setSelectedOrder(o => o ? { ...o, fabricComposition: e.target.value } : o)} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>质量等级</div>
                            <Input size="small" value={selectedOrder.qualityGrade} placeholder="如：合格品"
                              onChange={e => setSelectedOrder(o => o ? { ...o, qualityGrade: e.target.value } : o)} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>执行标准</div>
                            <Input size="small" value={selectedOrder.executeStandard} placeholder="如：GB/T 2660-2017"
                              onChange={e => setSelectedOrder(o => o ? { ...o, executeStandard: e.target.value } : o)} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>安全类别</div>
                            <Input size="small" value={selectedOrder.safetyCategory} placeholder="如：GB 18401 B类"
                              onChange={e => setSelectedOrder(o => o ? { ...o, safetyCategory: e.target.value } : o)} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>检验员</div>
                            <Input size="small" value={selectedOrder.inspector} placeholder="检验员姓名"
                              onChange={e => setSelectedOrder(o => o ? { ...o, inspector: e.target.value } : o)} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>检验日期</div>
                            <Input size="small" value={selectedOrder.inspectionDate} placeholder="如：2026-05-15"
                              onChange={e => setSelectedOrder(o => o ? { ...o, inspectionDate: e.target.value } : o)} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>价格（元）</div>
                            <InputNumber size="small" min={0} step={0.01} value={selectedOrder.price ?? undefined} placeholder="如：299.00"
                              onChange={v => setSelectedOrder(o => o ? { ...o, price: v ?? 0 } : o)} style={{ width: '100%' }} />
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>商品编码（U码）</div>
                            <Input size="small" value={selectedOrder.uCode} placeholder="商品条码"
                              onChange={e => setSelectedOrder(o => o ? { ...o, uCode: e.target.value } : o)} />
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <Button size="small" type="primary" icon={<SaveOutlined />}
                              onClick={async () => {
                                try {
                                  const res = await api.get(`/style/info/${selectedOrder.styleId}`);
                                  const detail = res?.data?.data || res?.data || {};
                                  if (!detail.styleNo) { message.error('款式信息不完整，无法保存'); return; }
                                  await api.put('/style/info', {
                                    ...detail,
                                    fabricComposition: selectedOrder.fabricComposition,
                                    qualityGrade: selectedOrder.qualityGrade,
                                    executeStandard: selectedOrder.executeStandard,
                                    safetyCategory: selectedOrder.safetyCategory,
                                    inspector: selectedOrder.inspector,
                                    inspectionDate: selectedOrder.inspectionDate,
                                    price: selectedOrder.price,
                                    uCode: selectedOrder.uCode,
                                  });
                                  message.success('保存成功');
                                } catch (e: any) { message.error(e.message || '保存失败'); }
                              }}>保存到款式资料</Button>
                          </div>
                        </div>
                      ),
                    }, {
                      key: 'wash-info', label: <span>洗水唛信息（样衣设定）</span>,
                      children: (
                        <div style={{ padding: '2px 0' }}>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>① 面料成分</div>
                            <Text style={{ fontSize: 14 }}>
                              {compositionFromSections(selectedOrder.fabricCompositionParts, selectedOrder.fabricComposition) || '未设定'}
                            </Text>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>② 洗涤说明</div>
                            <Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                              {washTextFromInstructions(selectedOrder.washInstructions, selectedOrder.fabricCompositionParts) || '未设定'}
                            </Text>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>③ 护理图标</div>
                            {effectiveCareCodes.length > 0 ? (
                              <Space wrap size={6}>
                                {effectiveCareCodes.map(code => {
                                  const icon = CARE_ICONS[code];
                                  return (
                                    <div key={code} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      padding: '3px 8px', borderRadius: 6,
                                      border: '1.5px solid var(--color-primary)',
                                      background: '#e6f4ff',
                                    }}>
                                      <span dangerouslySetInnerHTML={{ __html: icon?.svg || '' }} style={{ display: 'inline-block', width: 22, height: 22, flexShrink: 0 }} />
                                      <span style={{ fontSize: 14, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{icon?.label || code}</span>
                                    </div>
                                  );
                                })}
                              </Space>
                            ) : (
                              <Text style={{ fontSize: 14, color: 'var(--color-text-quaternary)' }}>未设定</Text>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>④ 生产制造</div>
                            <Text style={{ fontSize: 14 }}>MADE IN CHINA</Text>
                            <Text style={{ fontSize: 14, color: '#888', marginLeft: 12 }}>{getDefaultDateText()}</Text>
                          </div>
                        </div>
                      ),
                    }]} />

                    <Divider style={{ margin: '10px 0' }} />
                    <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>
                      当前打印: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{ptLabel}</span>
                      {' | '}SKU: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{selectedOrder.styleNo}-{selectedColor}-{selectedSize}</span>
                      {selectedOrder.price ? ` | ${formatMoney(selectedOrder.price)}` : ''}
                    </div>
                  </Col>
                </Row>

                <Divider style={{ margin: '14px 0' }} />

                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{ptLabel}预览（实时更新）</div>
                  <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg-base)' }}>
                    <iframe srcDoc={previewHtml} style={{ width: '100%', height: 350, border: 'none' }} title="打印预览" />
                  </div>
                </div>
              </Card>
            ) : orders.length > 0 ? (
              <Card>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>搜索到 {orders.length} 个订单，请选择</div>
                <Space orientation="vertical" style={{ width: '100%' }}>
                  {orders.map(o => (
                    <Card key={o.orderId} size="small" hoverable style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedOrder(o);
                        setSelectedColor(o.colors[0] || '');
                        setSelectedSize(o.sizes[0] || '');
                      }}>
                      <div style={{ fontWeight: 600 }}>{o.styleName || o.styleNo}</div>
                      <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>订单号: {o.orderNo} | {o.colors.join('/')} | {o.sizes.join('/')}</div>
                    </Card>
                  ))}
                </Space>
              </Card>
            ) : (
              <Card style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 14 }}>请输入订单号或款号搜索</div>
              </Card>
            )}
          </Spin>
        </Col>
      </Row>
      <Modal
        title="保存为模板"
        open={saveTemplateOpen}
        onOk={() => void handleSaveTemplate()}
        onCancel={() => { setSaveTemplateOpen(false); setSaveTemplateName(''); }}
        okText="保存"
        destroyOnHidden
      >
        <Input
          value={saveTemplateName}
          onChange={e => setSaveTemplateName(e.target.value)}
          placeholder="请输入模板名称"
          maxLength={50}
          autoFocus
          onPressEnter={() => void handleSaveTemplate()}
        />
      </Modal>
    </div>
  );
};

export default LabelPrint;
