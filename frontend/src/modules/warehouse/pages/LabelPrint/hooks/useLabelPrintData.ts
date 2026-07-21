import { useState, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { safePrint } from '@/utils/safePrint';
import api, { parseProductionOrderLines, sortSizeNames } from '@/utils/api';
import { printTemplateApi } from '@/services/system/printTemplateApi';
import type { OrderInfo, PrintType } from '../types';
import { defaultHang, defaultBar, defaultWash, loadSavedSettings, STORAGE_KEY, type HangSettings, type BarSettings, type WashSettings } from '../constants';
import { buildHangtagHtml, buildBarcodeHtml, buildWashlabelHtml } from '../printTemplates';

export const useLabelPrintData = () => {
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

  const saved = loadSavedSettings();

  const [hang, setHang] = useState<HangSettings>(saved.hang);
  const [bar, setBar] = useState<BarSettings>(saved.bar);
  const [wash, setWash] = useState<WashSettings>(saved.wash);

  // 保存设置到本地存储
  const saveSettings = useCallback((newHang?: HangSettings, newBar?: BarSettings, newWash?: WashSettings) => {
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
    return buildHangtagHtml(selectedOrder, selectedColor, selectedSize, hang, coverBase64, count);
  }, [selectedOrder, selectedColor, selectedSize, hang, coverBase64]);

  const generateBarcodeHtml = useCallback(async (count: number) => {
    if (!selectedOrder) return '';
    return buildBarcodeHtml(selectedOrder, selectedColor, selectedSize, bar, count);
  }, [selectedOrder, selectedColor, selectedSize, bar]);

  const generateWashlabelHtml = useCallback(async (count: number) => {
    if (!selectedOrder) return '';
    return buildWashlabelHtml(selectedOrder, wash, count);
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

  const handleSaveStyleInfo = useCallback(async () => {
    if (!selectedOrder) return;
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
  }, [selectedOrder, message]);

  const handleClear = useCallback(() => {
    setKeyword('');
    setOrders([]);
    setSelectedOrder(null);
    setCoverBase64('');
  }, []);

  return {
    // state
    keyword, setKeyword,
    loading,
    orders,
    selectedOrder, setSelectedOrder,
    selectedColor, setSelectedColor,
    selectedSize, setSelectedSize,
    printType, setPrintType,
    printCount, setPrintCount,
    printing,
    previewHtml,
    templates,
    saveTemplateOpen, setSaveTemplateOpen,
    saveTemplateName, setSaveTemplateName,
    coverBase64, setCoverBase64,
    hang, setHang,
    bar, setBar,
    wash, setWash,
    // methods
    resetSettings,
    loadTemplates,
    handleSaveTemplate,
    handleLoadTemplate,
    handleDeleteTemplate,
    handleSetDefaultTemplate,
    handleSearch,
    handlePrint,
    handleSaveStyleInfo,
    handleClear,
    // derived
    ptLabel,
  };
};
