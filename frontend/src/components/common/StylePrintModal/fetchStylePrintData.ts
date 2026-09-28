/**
 * 样式打印数据装载服务（D-611）
 *
 * 从 useStylePrintData 的 loadData 抽出：单一打印预览与批量打印共用同一数据源，
 * 保证批量打印的每张单与单独打印拿到的数据完全一致。
 * 请求集合、容错口径（单接口失败仅 console.warn 不中断）与原实现逐项对齐，勿单方面增减。
 */
import api from '@/utils/api';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { PrintData } from './types';

export type StylePrintMode = 'sample' | 'order' | 'production';

export interface StylePrintFetchParams {
  styleId?: string | number;
  styleNo?: string;
  /** 款名（二维码内容用到） */
  styleName?: string;
  mode: StylePrintMode;
  orderId?: string;
  /** 订单号（大货/下单模式主二维码内容用到） */
  orderNo?: string;
  /** 列表行已带的封面图（有则不再兜底查询） */
  cover?: string;
  /** 调用方已知的样衣生产记录ID；样衣模式下未传时服务会自动按 styleId 精确查询 */
  patternProductionId?: string | number | null;
}

export interface StylePrintDataBundle {
  data: PrintData;
  resolvedCover: string | null;
  orderCreatorName: string;
  /** 样衣模式自动匹配到的样衣生产记录ID（无则 null） */
  patternId: string | null;
  /** 样衣模式全部色码生产记录（标签打印按颜色匹配独立二维码） */
  patternRecords: Array<{ id: string; color?: string; size?: string }>;
  /** 扫码二维码内容（与单一打印 qrValue 同一算法） */
  qrValue: string;
}

const emptyData = (): PrintData => ({ sizes: [], bom: [], process: [], attachments: [], productionSheet: null });

/**
 * 主单二维码内容。
 * 样衣模式优先用 patternId（type:'pattern'，手机端样衣扫码页只认这个格式），
 * 否则退化为 style/order 信息码。
 */
export function buildQrValue(
  mode: StylePrintMode,
  info: { styleNo?: string; styleName?: string; orderId?: string; orderNo?: string; patternId?: string | null; isPattern?: boolean },
): string {
  const isPatternPrint = info.isPattern === true || (mode === 'sample' && !!info.patternId);
  return isPatternPrint && info.patternId
    ? JSON.stringify({ type: 'pattern', id: info.patternId })
    : JSON.stringify({ type: mode === 'production' ? 'order' : 'style', styleNo: info.styleNo, styleName: info.styleName, orderId: info.orderId, orderNo: info.orderNo || '' });
}

export async function fetchStylePrintData(params: StylePrintFetchParams): Promise<StylePrintDataBundle> {
  const { styleId, styleNo, styleName, mode, orderId, orderNo, cover, patternProductionId } = params;
  const data = emptyData();

  // 样衣模式自动查询样衣生产记录ID（用于二维码扫码识别）
  // ★ 与 useStylePrintData 原实现同源：必须按 styleId 精确查单条（/by-style/{id}），
  //   不能退回 /production/pattern/list + keyword 模糊查——记录超 20 条时目标不在首页，
  //   会退化为 styleNo 信息码，手机端报「无法识别」。
  const patternTask = (async () => {
    if (mode !== 'sample' || patternProductionId || !styleId) {
      return {
        patternId: patternProductionId ? String(patternProductionId) : null,
        patternRecords: [] as Array<{ id: string; color?: string; size?: string }>,
      };
    }
    try {
      const res = await api.get(`/production/pattern/by-style/${encodeURIComponent(String(styleId))}`);
      const d = res?.data;
      const list = Array.isArray(d) ? d : (d && typeof d === 'object' ? [d] : []);
      const records = list
        .filter((item: any) => item?.id)
        .map((item: any) => ({
          id: String(item.id),
          color: item.color ? String(item.color) : undefined,
          size: item.size ? String(item.size) : undefined,
        }));
      return { patternId: records.length > 0 ? records[0].id : null, patternRecords: records };
    } catch (err: any) {
      console.warn('[StylePrint] 款式花型匹配失败:', err?.message || err);
      return { patternId: null, patternRecords: [] as Array<{ id: string; color?: string; size?: string }> };
    }
  })();

  const loadTask = (async () => {
    const promises: Promise<any>[] = [];
    promises.push(getStyleInfoByRef(styleId, styleNo).then((styleInfo) => { if (styleInfo) data.productionSheet = styleInfo; }).catch((err) => { console.warn('[StylePrint] 款式信息加载失败:', err?.message || err); }));
    promises.push(api.get('/style/size/list', { params: { styleId } }).then(res => { if (res.code === 200) data.sizes = res.data || []; }).catch((err) => { console.warn('[StylePrint] 尺码数据加载失败:', err?.message || err); }));
    promises.push(api.get('/style/bom/list', { params: { styleId } }).then(res => { if (res.code === 200) data.bom = res.data || []; }).catch((err) => { console.warn('[StylePrint] BOM数据加载失败:', err?.message || err); }));
    promises.push(api.get('/style/process/list', { params: { styleId } }).then(res => { if (res.code === 200) data.process = res.data || []; }).catch((err) => { console.warn('[StylePrint] 工序数据加载失败:', err?.message || err); }));
    promises.push(api.get('/style/attachment/list', { params: { styleId } }).then(res => {
      if (res.code === 200) {
        data.attachments = (res.data || []).filter((item: any) => {
          const bizType = String(item.bizType || '');
          return bizType.startsWith('pattern') || bizType === 'size_table' || bizType === 'production_sheet';
        });
      }
    }).catch((err) => { console.warn('[StylePrint] 附件列表加载失败:', err?.message || err); }));
    await Promise.all(promises);
  })();

  const [pattern] = await Promise.all([patternTask, loadTask]);

  // 大货/下单模式：查询订单创建人（与原实现同口径：优先 orderId 详情，退化 styleId 列表）
  let orderCreatorName = '';
  if (mode !== 'sample' && styleId) {
    try {
      if (orderId) {
        const orderRes = await api.get(`/production/order/detail/${orderId}`);
        if (orderRes.code === 200 && orderRes.data) {
          orderCreatorName = orderRes.data.createdByName || '';
        }
      } else {
        const orderRes = await api.get('/production/order/list', { params: { styleId, page: 1, pageSize: 1 } });
        if (orderRes.code === 200 && orderRes.data?.records?.length > 0) {
          orderCreatorName = orderRes.data.records[0].createdByName || '';
        }
      }
    } catch { /* ignore */ }
  }

  // 封面兜底链：入参 cover → 款式信息 cover → 附件首张图片（与原实现一致）
  let resolvedCover: string | null = cover || null;
  if (!resolvedCover) {
    const styleData = data.productionSheet as any;
    if (styleData?.cover) {
      resolvedCover = styleData.cover;
    } else {
      try {
        const attachRes = await api.get<{ code: number; data: any[] }>('/style/attachment/list', { params: { styleId } });
        if (attachRes.code === 200) {
          const images = (attachRes.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (images.length > 0) { resolvedCover = (images[0] as any)?.fileUrl || null; }
        }
      } catch { /* ignore */ }
    }
  }

  return {
    data,
    resolvedCover,
    orderCreatorName,
    patternId: pattern.patternId,
    patternRecords: pattern.patternRecords,
    qrValue: buildQrValue(mode, { styleNo, styleName, orderId, orderNo, patternId: pattern.patternId }),
  };
}
