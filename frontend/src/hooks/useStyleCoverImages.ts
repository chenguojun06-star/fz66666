/**
 * useStyleCoverImages — 通用「款号/SKU → 图片」反查 Hook
 *
 * 用途：电商各列表的「款式图」「款号」列，把一行商品数据反查成
 * 款号 + 颜色 + 尺码 + 图片。
 *
 * ⚠️ 关键约定（踩过的坑，别改回去）
 * 真实 SKU 编码是「**款号直接拼颜色尺码、没有分隔符**」，
 * 例如 `BR24XQ0098E草绿色L(170/84A)`（款号 `BR24XQ0098E`）。
 * 因此**绝不能**在前端用 `skuCode.split('-')[0]` / `indexOf('-')` 猜款号 ——
 * 那样得到的"款号"是整串编码，拿去查款图必然查不到，
 * 表现就是「款号列显示一大串编码、款式图列永远是灰块」。
 * 正确做法：把 skuCode 交给后端 `POST /style/sku/brief`，
 * 由 `t_product_sku`（权威口径）解析出款号与颜色图（缺则退回款图）。
 *
 * 用法：
 *   const { imageMap, briefBySku, fetchBySkuCodes } = useStyleCoverImages();
 *   useEffect(() => { fetchBySkuCodes(records.map(r => r.skuCode)); }, [records]);
 *   // 渲染
 *   <StyleImageCell skuCode={r.skuCode} imageMap={imageMap} />
 *   // 「款号」列：briefBySku[r.skuCode]?.styleNo
 */
import { useState, useCallback, useRef } from 'react';
import api from '@/utils/api';

/**
 * 款号/SKU → 图片 URL 映射。
 *
 * 键既可能是 `styleNo`（款级封面，来自 fetchByStyleNos），
 * 也可能是原始 `skuCode`（来自 fetchBySkuCodes，颜色图优先）。
 * `StyleImageCell` 会先按 styleNo 查、查不到再按 skuCode 查。
 */
export type StyleImageMap = Record<string, string>;

/**
 * SKU 摘要的"入参"形态：只要带 skuCode，其余字段都可缺省。
 *
 * 用于 `seedBriefs()` —— 后端接口（如调价建议）自带的摘要字段可能不全，
 * 或类型上是可空字段，这里放宽以便直接注入。
 */
export interface SkuBriefInput {
  skuCode?: string | null;
  skuId?: number | null;
  styleId?: number | null;
  styleNo?: string | null;
  color?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  salesPrice?: number | null;
  costPrice?: number | null;
}

/** 单个 SKU 的权威摘要（后端按 t_product_sku 解析） */
export interface SkuBrief extends SkuBriefInput {
  skuCode: string;
}

/** skuCode → SKU 摘要 */
export type SkuBriefMap = Record<string, SkuBrief>;

/** orderNo → SKU 摘要（订单级列表用：物流异常 / 平台账单只有订单号） */
export type OrderBriefMap = Record<string, SkuBrief>;

export interface UseStyleCoverImagesReturn {
  /** styleNo / skuCode → 图片 URL */
  imageMap: StyleImageMap;
  /** skuCode → 款号/颜色/尺码/图片 摘要（用于「款号」列与颜色尺码展示） */
  briefBySku: SkuBriefMap;
  /** orderNo → 图片 URL（订单级列表专用） */
  orderImageMap: StyleImageMap;
  /** orderNo → SKU 摘要（订单级列表专用） */
  briefByOrderNo: OrderBriefMap;
  /** 按 skuCode 数组批量反查（走后端权威解析，**不做字符串切分**） */
  fetchBySkuCodes: (skuCodes: Array<string | null | undefined>) => Promise<void>;
  /** 按内部订单号 / 平台订单号批量反查（物流异常、平台账单等只有订单号的列表） */
  fetchByOrderNos: (
    orderNos?: Array<string | null | undefined>,
    platformOrderNos?: Array<string | null | undefined>,
  ) => Promise<void>;
  /** 注入后端已解析好的摘要（接口本身返回了款号/图片时用，省一次请求） */
  seedBriefs: (briefs: Array<SkuBriefInput | null | undefined>) => void;
  /** 按 styleNo 数组批量反查款级封面 */
  fetchByStyleNos: (styleNos: Array<string | null | undefined>) => Promise<void>;
  /** 手动设置映射（用于已有数据的合并） */
  setImageMap: React.Dispatch<React.SetStateAction<StyleImageMap>>;
  /** 是否正在加载 */
  loading: boolean;
}

export function useStyleCoverImages(): UseStyleCoverImagesReturn {
  const [imageMap, setImageMap] = useState<StyleImageMap>({});
  const [briefBySku, setBriefBySku] = useState<SkuBriefMap>({});
  const [orderImageMap, setOrderImageMap] = useState<StyleImageMap>({});
  const [briefByOrderNo, setBriefByOrderNo] = useState<OrderBriefMap>({});
  const [loading, setLoading] = useState(false);
  // 已查询过的键，避免重复请求
  const fetchedSkuRef = useRef<Set<string>>(new Set());
  const fetchedStyleRef = useRef<Set<string>>(new Set());
  const fetchedOrderRef = useRef<Set<string>>(new Set());

  const fetchByStyleNos = useCallback(async (styleNos: Array<string | null | undefined>) => {
    const unique = Array.from(new Set(
      styleNos
        .map(s => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
    )).filter(sn => !fetchedStyleRef.current.has(sn));

    if (unique.length === 0) return;

    setLoading(true);
    try {
      const results = await Promise.allSettled(
        unique.map(sn =>
          api.get('/style/info/list', { params: { styleNo: sn, pageSize: 5 } })
        )
      );
      const map: StyleImageMap = {};
      results.forEach((res, i) => {
        const sn = unique[i];
        fetchedStyleRef.current.add(sn);
        if (res.status === 'fulfilled') {
          const records: Array<{ styleNo: string; cover?: string }> =
            (res.value as any)?.data?.records ?? [];
          const exact = records.find(s => s.styleNo === sn);
          if (exact?.cover) map[sn] = exact.cover;
        }
      });
      if (Object.keys(map).length > 0) {
        setImageMap(prev => ({ ...prev, ...map }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 批量解析 skuCode → 款号/颜色/尺码/图片。
   *
   * 走后端 `POST /style/sku/brief`：后端按 `t_product_sku` 精确匹配 skuCode
   * （真实编码无分隔符，前端无法自行拆解），颜色图优先、款图兜底。
   */
  const fetchBySkuCodes = useCallback(async (skuCodes: Array<string | null | undefined>) => {
    const unique = Array.from(new Set(
      skuCodes
        .map(s => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
    )).filter(code => !fetchedSkuRef.current.has(code));

    if (unique.length === 0) return;

    setLoading(true);
    try {
      // 后端单次上限 500，超出分批请求
      const BATCH = 500;
      const map: StyleImageMap = {};
      const briefs: SkuBriefMap = {};
      for (let i = 0; i < unique.length; i += BATCH) {
        const chunk = unique.slice(i, i + BATCH);
        const res = await api.post<{ data?: SkuBriefMap }>('/style/sku/brief', { skuCodes: chunk });
        const data: SkuBriefMap = (res as any)?.data ?? {};
        chunk.forEach(code => fetchedSkuRef.current.add(code));
        Object.values(data).forEach(brief => {
          if (!brief?.skuCode) return;
          briefs[brief.skuCode] = brief;
          if (brief.imageUrl) {
            // skuCode 键：颜色图，最精确
            map[brief.skuCode] = brief.imageUrl;
            // styleNo 键：该款还没图时才补，避免盖掉已加载的款级封面
            if (brief.styleNo && !map[brief.styleNo]) {
              map[brief.styleNo] = brief.imageUrl;
            }
          }
        });
      }
      if (Object.keys(map).length > 0) {
        setImageMap(prev => {
          const merged: StyleImageMap = {};
          Object.keys(map).forEach(k => { if (!prev[k]) merged[k] = map[k]; });
          return { ...prev, ...merged };
        });
      }
      if (Object.keys(briefs).length > 0) {
        setBriefBySku(prev => ({ ...prev, ...briefs }));
      }
    } catch {
      // 图片是锦上添花，失败不打断主流程（列表仍能显示文字信息）
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 注入后端已经解析好的摘要。
   *
   * 适用场景：接口响应里已经带了 skuCode/styleNo/imageUrl（例如调价建议），
   * 此时不必再调一次 /style/sku/brief。会同时标记为"已查询过"，避免后续重复请求。
   */
  const seedBriefs = useCallback((briefs: Array<SkuBriefInput | null | undefined>) => {
    const list = (briefs || []).filter((b): b is SkuBrief => !!b?.skuCode);
    if (list.length === 0) return;
    const map: StyleImageMap = {};
    const next: SkuBriefMap = {};
    list.forEach(b => {
      next[b.skuCode] = b;
      fetchedSkuRef.current.add(b.skuCode);
      if (b.imageUrl) {
        map[b.skuCode] = b.imageUrl;
        if (b.styleNo && !map[b.styleNo]) map[b.styleNo] = b.imageUrl;
      }
    });
    setImageMap(prev => {
      const merged: StyleImageMap = {};
      Object.keys(map).forEach(k => { if (!prev[k]) merged[k] = map[k]; });
      return { ...prev, ...merged };
    });
    setBriefBySku(prev => ({ ...prev, ...next }));
  }, []);

  /**
   * 按**订单号**批量解析商品摘要（订单级列表用）。
   *
   * 物流异常、平台账单这类列表只有订单号，没有 skuCode。后端
   * `POST /ecommerce/orders/brief` 会回查 `t_ecommerce_order` 再解析，
   * 返回 `订单号 -> brief`（按传入的原样字符串作键）。
   *
   * @param orderNos        内部订单号（物流异常表的 orderNo）
   * @param platformOrderNos 平台订单号（账单表的 platformOrderNo）
   */
  const fetchByOrderNos = useCallback(async (
    orderNos: Array<string | null | undefined> = [],
    platformOrderNos: Array<string | null | undefined> = [],
  ) => {
    const clean = (arr: Array<string | null | undefined>) => Array.from(new Set(
      arr.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
    ));
    const inner = clean(orderNos);
    const outer = clean(platformOrderNos);
    if (inner.length === 0 && outer.length === 0) return;

    setLoading(true);
    try {
      const BATCH = 500;
      const orderBriefs: OrderBriefMap = {};
      const orderImgs: StyleImageMap = {};
      const skuBriefs: SkuBriefMap = {};
      const skuImgs: StyleImageMap = {};
      const merge = (data: OrderBriefMap) => {
        Object.entries(data).forEach(([key, brief]) => {
          if (!brief?.skuCode) return;
          orderBriefs[key] = brief;
          if (brief.imageUrl) orderImgs[key] = brief.imageUrl;
          skuBriefs[brief.skuCode] = brief;
          if (brief.imageUrl) {
            skuImgs[brief.skuCode] = brief.imageUrl;
            if (brief.styleNo && !skuImgs[brief.styleNo]) skuImgs[brief.styleNo] = brief.imageUrl;
          }
        });
      };
      const total = Math.max(inner.length, outer.length);
      for (let i = 0; i < total; i += BATCH) {
        const chunkIn = inner.slice(i, i + BATCH);
        const chunkOut = outer.slice(i, i + BATCH);
        if (chunkIn.length === 0 && chunkOut.length === 0) continue;
        const res = await api.post<{ data?: OrderBriefMap }>('/ecommerce/orders/brief', {
          orderNos: chunkIn,
          platformOrderNos: chunkOut,
        });
        merge((res as any)?.data ?? {});
        chunkIn.forEach(k => fetchedOrderRef.current.add(k));
        chunkOut.forEach(k => fetchedOrderRef.current.add(k));
      }
      if (Object.keys(orderImgs).length > 0) {
        setOrderImageMap(prev => ({ ...prev, ...orderImgs }));
      }
      if (Object.keys(skuImgs).length > 0) {
        setImageMap(prev => {
          const merged: StyleImageMap = {};
          Object.keys(skuImgs).forEach(k => { if (!prev[k]) merged[k] = skuImgs[k]; });
          return { ...prev, ...merged };
        });
      }
      if (Object.keys(orderBriefs).length > 0) {
        setBriefByOrderNo(prev => ({ ...prev, ...orderBriefs }));
      }
      if (Object.keys(skuBriefs).length > 0) {
        setBriefBySku(prev => ({ ...prev, ...skuBriefs }));
      }
    } catch {
      // 图片是锦上添花，失败不打断主流程
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    imageMap,
    briefBySku,
    orderImageMap,
    briefByOrderNo,
    fetchBySkuCodes,
    fetchByOrderNos,
    seedBriefs,
    fetchByStyleNos,
    setImageMap,
    loading,
  };
}

export default useStyleCoverImages;
