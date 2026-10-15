import { useCallback, useState } from 'react';
import { message } from '@/utils/antdStatic';
import shopAdminApi, { shopProductApi } from '@/services/shop/shopApi';
import type { BatchSaveSkuResult, ShopStyleInfoRow, ShopStyleSku } from '@/services/shop/shopApi';
import { unwrap } from '../unwrap';
import type { EditableSku, ListingRow } from '../types';

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * 店铺商品编辑抽屉的数据与保存编排（D-768）。
 * 打开时并行拉 SKU / 颜色图 / 款式详情；保存时依次提交 款式字段 → 颜色图 → SKU 售价库存。
 * ⚠️ 库存提交的是「目标值」，增减量换算与留痕都在后端 `batchSaveSku` 内完成。
 */
export function useListingEditor(onSaved: (styleId: number) => void) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<ListingRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skus, setSkus] = useState<EditableSku[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  /** D-800：主图组（最多 5 张，第 1 张即 cover） */
  const [coverGroup, setCoverGroup] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  // 顾客端详情页「商品参数 / 洗涤说明 / 款式详情」三块的内容（此前上架页无入口）
  const [fabric, setFabric] = useState('');
  const [wash, setWash] = useState('');
  const [desc, setDesc] = useState('');
  // 商品分类：库里是自由文本，上架页用词表下拉统一口径（否则平台首页会继续中英混杂）
  const [category, setCategory] = useState('');
  const [colorImages, setColorImages] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState({
    cover: null as string | null,
    coverGroup: [] as string[],
    remark: '',
    fabric: '',
    wash: '',
    desc: '',
    category: '',
    colorImages: {} as Record<string, string>,
  });

  const openFor = useCallback(async (r: ListingRow) => {
    setOpen(true);
    setRow(r);
    setLoading(true);
    setSkus([]);
    setColorImages({});
    try {
      const [skuRaw, imgRaw, styleRaw] = await Promise.all([
        shopProductApi.searchSkus(r.id),
        r.styleNo ? shopProductApi.listColorImages(r.styleNo).catch(() => null) : Promise.resolve(null),
        shopProductApi.getStyle(r.id).catch(() => null),
      ]);
      const skuList = unwrap<ShopStyleSku[] | null>(skuRaw) ?? [];
      setSkus(
        (Array.isArray(skuList) ? skuList : []).map((s) => ({
          skuId: s.id,
          skuCode: s.skuCode,
          color: s.color || '默认',
          size: s.size || '',
          image: s.skuColorImage ?? null,
          salesPrice: s.salesPrice ?? null,
          stockQuantity: s.stockQuantity ?? 0,
        })),
      );
      const imgs = unwrap<Record<string, string> | null>(imgRaw) ?? {};
      setColorImages(imgs);
      const detail = unwrap<ShopStyleInfoRow | null>(styleRaw);
      const c = detail?.cover ?? r.cover ?? null;
      // D-800：主图组。历史数据 cover_group 为空时回退为 [cover]，保证老款式零影响。
      const cg2 = (() => {
        try {
          const raw = detail?.coverGroup;
          if (!raw) return c ? [c] : [];
          const arr = JSON.parse(raw);
          return Array.isArray(arr) ? (arr.filter(Boolean) as string[]) : (c ? [c] : []);
        } catch {
          return c ? [c] : [];
        }
      })();
      const rm = detail?.remark ?? r.remark ?? '';
      const fb = detail?.fabricComposition ?? '';
      const ws = detail?.washInstructions ?? '';
      const ds = detail?.description ?? '';
      const cg = detail?.category ?? '';
      setCover(c);
      setRemark(rm);
      setFabric(fb);
      setWash(ws);
      setDesc(ds);
      setCategory(cg);
      setCoverGroup(cg2);
      setBaseline({ cover: c, coverGroup: cg2, remark: rm, fabric: fb, wash: ws, desc: ds, category: cg, colorImages: imgs });
    } catch (e: unknown) {
      message.error(errText(e, '商品详情加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setRow(null);
  }, []);

  const save = useCallback(async () => {
    if (!row) return;
    setSaving(true);
    try {
      // 只提交真正改动过的字段：后端 PUT /style/info 是局部更新，
      // 把没动过的字段一起提交等于用"页面上的旧值"覆盖库里的新值。
      const stylePatch: {
        id: number | string;
        cover?: string | null;
        coverGroup?: string | null;
        remark?: string | null;
        fabricComposition?: string | null;
        washInstructions?: string | null;
        description?: string | null;
        category?: string | null;
      } = { id: row.id };
      if (cover !== baseline.cover) stylePatch.cover = cover;
      // D-800：主图组有变化才提交，避免无谓写库
      if (JSON.stringify(coverGroup) !== JSON.stringify(baseline.coverGroup)) {
        stylePatch.coverGroup = JSON.stringify(coverGroup);
      }
      if (remark !== baseline.remark) stylePatch.remark = remark;
      if (fabric !== baseline.fabric) stylePatch.fabricComposition = fabric.trim() || null;
      if (wash !== baseline.wash) stylePatch.washInstructions = wash.trim() || null;
      if (desc !== baseline.desc) stylePatch.description = desc.trim() || null;
      if (category !== baseline.category) stylePatch.category = category.trim() || null;
      if (Object.keys(stylePatch).length > 1) {
        await shopProductApi.updateStyle(stylePatch);
      }
      const changedImgs: Record<string, string> = {};
      Object.keys(colorImages).forEach((c) => {
        if (colorImages[c] !== baseline.colorImages[c]) changedImgs[c] = colorImages[c];
      });
      if (Object.keys(changedImgs).length) {
        await shopProductApi.saveColorImages(row.id, changedImgs);
      }

      const dirty = skus.filter((s) => s.dirty);
      if (dirty.length) {
        const res = await shopAdminApi.batchSaveSku(
          row.id,
          dirty.map((s) => ({ skuId: s.skuId, salesPrice: s.salesPrice, stockQuantity: s.stockQuantity })),
        );
        const body = unwrap<BatchSaveSkuResult>(res);
        const after: Record<string, number> = body?.stockAfter ?? {};
        // 回读真实库存：库存走 GREATEST(0,…) 增减，可能被钳制，不能沿用用户输入值
        setSkus((prev) =>
          prev.map((s) => (after[String(s.skuId)] == null ? s : { ...s, stockQuantity: after[String(s.skuId)], dirty: false })),
        );
        message.success(`已保存：改价 ${body?.priceChanged ?? 0} 项，改库存 ${body?.stockChanged ?? 0} 项`);
      } else {
        message.success('已保存');
      }
      setSkus((prev) => prev.map((s) => ({ ...s, dirty: false })));
      setBaseline({ cover, coverGroup, remark, fabric, wash, desc, category, colorImages });
      onSaved(row.id);
    } catch (e: unknown) {
      message.error(errText(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  }, [row, cover, coverGroup, remark, fabric, wash, desc, category, colorImages, skus, baseline, onSaved]);

  return {
    open, row, loading, saving, skus, setSkus, cover, setCover, coverGroup, setCoverGroup, remark, setRemark,
    fabric, setFabric, wash, setWash, desc, setDesc, category, setCategory,
    colorImages, setColorImages, openFor, close, save,
  };
}