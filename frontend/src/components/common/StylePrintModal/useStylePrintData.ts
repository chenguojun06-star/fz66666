/**
 * StylePrintModal 业务逻辑 Hook
 * 提取自 index.tsx，承载所有 useState/useEffect/useCallback/handlers
 * 返回 { state, actions, derived } 三类对象
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import QRCodeLib from 'qrcode';

import api from '@/utils/api';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { message } from '@/utils/antdStatic';
import { useUser } from '@/utils/AuthContext';

import { buildPrintHtml } from './printTemplate';
import { safePrint } from '@/utils/safePrint';
import { LABEL_SIZE_MAP, parseSizeColorMatrix, resolveLabelItems } from './printDataTransform';
import { getModePageTitle } from './helpers';
import {
  DEFAULT_PRINT_OPTIONS,
  LabelSize,
  PrintData,
  PrintOptions,
  StylePrintModalProps,
} from './types';

/** Hook 入参（与组件 props 同形，便于未来扩展） */
export type UseStylePrintDataParams = Required<
  Pick<
    StylePrintModalProps,
    'visible' | 'onClose' | 'mode' | 'styleNo' | 'styleName'
  >
> &
  Pick<
    StylePrintModalProps,
    | 'styleId'
    | 'orderId'
    | 'orderNo'
    | 'cover'
    | 'color'
    | 'quantity'
    | 'category'
    | 'season'
    | 'extraInfo'
    | 'sizeDetails'
    | 'patternProductionId'
    | 'sizeColorConfig'
  >;

export function useStylePrintData(params: UseStylePrintDataParams) {
  const {
    visible, styleId, orderId, orderNo,
    styleNo, styleName, cover, color, quantity,
    category, season, mode, patternProductionId: propPatternId, extraInfo = {},
    sizeDetails = [], sizeColorConfig,
  } = params;

  const { user } = useUser();

  // ───── 状态 ─────
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  // 注：basicInfoFields 状态当前未被读取，保留以维持原组件行为（不删功能）
  const [, setBasicInfoFields] = useState<Set<string>>(new Set([
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
  const [orderCreatorName, setOrderCreatorName] = useState<string>('');
  // 注：tenantLogo 当前未被 JSX 直接读取，保留以维持原组件行为
  const [, setTenantLogo] = useState<string>('');

  const resolvedPatternId = propPatternId ? String(propPatternId) : autoPatternId;

  // ───── 派生数据 ─────
  const sizeColorMatrix = useMemo(() => {
    return parseSizeColorMatrix(sizeColorConfig || (extraInfo as any)?.sizeColorConfig);
  }, [sizeColorConfig, extraInfo]);

  const labelItems = useMemo(() => {
    return resolveLabelItems(sizeDetails, data.productionSheet, color ?? '', quantity ?? 0);
  }, [sizeDetails, data.productionSheet, color, quantity]);

  const isPatternPrint = extraInfo?.isPattern === true || (mode === 'sample' && !!resolvedPatternId);
  const qrValue = isPatternPrint && resolvedPatternId
    ? JSON.stringify({ type: 'pattern', id: resolvedPatternId })
    : JSON.stringify({ type: mode === 'production' ? 'order' : 'style', styleNo, styleName, orderId, orderNo: orderNo || '' });

  // ───── 副作用：封面图同步 ─────
  useEffect(() => { setResolvedCover(cover || null); }, [cover]);

  // ───── 副作用：打开时加载所有数据 ─────
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

        // 大货/下单模式：查询订单创建人
        if (mode !== 'sample' && styleId) {
          try {
            // 优先用 orderId 查详情，否则用 styleId 查列表
            if (orderId) {
              const orderRes = await api.get(`/production/order/detail/${orderId}`);
              if (orderRes.code === 200 && orderRes.data) {
                setOrderCreatorName(orderRes.data.createdByName || '');
              }
            } else {
              const orderRes = await api.get('/production/order/list', { params: { styleId, page: 1, pageSize: 1 } });
              if (orderRes.code === 200 && orderRes.data?.records?.length > 0) {
                setOrderCreatorName(orderRes.data.records[0].createdByName || '');
              }
            }
          } catch { /* ignore */ }
        } else {
          setOrderCreatorName('');
        }

        // 获取租户Logo
        setTenantLogo((user as any)?.tenantLogo || (user as any)?.logo || '');

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

  // ───── 副作用：异步生成主二维码 PNG dataURL ─────
  useEffect(() => {
    let cancelled = false;
    QRCodeLib.toDataURL(qrValue, { width: 480, margin: 0, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setQrPngDataUrl(url); })
      .catch(() => { if (!cancelled) setQrPngDataUrl(''); });
    return () => { cancelled = true; };
  }, [qrValue]);

  // ───── 动作：打印主单 ─────
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
      const printDate = new Date().toLocaleString('zh-CN');
      const printerInfo = printerAccount ? `打印人: ${printerName} (${printerAccount})` : `打印人: ${printerName}`;
      const htmlContent = buildPrintHtml({
        headerInfo: '', printerInfo, printDate, styleNo, bodyHtml: printContent.innerHTML,
        tenantName: user?.tenantName,
        pageTitle: getModePageTitle(mode),
      });
      safePrint(htmlContent, `打印预览-${styleNo}`);
    } finally { setPrintLoading(false); }
  };

  // ───── 动作：标签打印（自动识别全部颜色×码数） ─────
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
html,body{width:${w}mm;min-height:${h}mm;color:#000!important;background:var(--color-bg-base)!important}
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

  return {
    // 状态
    options,
    loading,
    resolvedCover,
    data,
    labelPrintMode,
    labelSize,
    labelCount,
    labelPrinting,
    printLoading,
    qrPngDataUrl,
    orderCreatorName,
    resolvedPatternId,
    qrValue,
    // 派生
    sizeColorMatrix,
    labelItems,
    isPatternPrint,
    // 动作
    setOptions,
    setLabelPrintMode,
    setLabelSize,
    setLabelCount,
    handlePrint,
    handleLabelPrint,
    // 用户上下文
    user,
    // 注入 setBasicInfoFields（保留原行为，未实际使用）
    setBasicInfoFields,
  };
}
