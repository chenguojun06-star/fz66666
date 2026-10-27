import { useCallback, useMemo, useState } from 'react';
import { App } from 'antd';
import {
  fetchColorImageSourceMap,
  fetchSkuColorImageMap,
  diffColorImages,
  writeSkuColorImages,
} from './colorImageSync';

interface UseSkuColorImageSyncParams {
  styleId: string;
  styleNo: string;
  /** 同步成功后刷新 SKU 表格（刷新会清空编辑态，故编辑态禁止同步） */
  onRefresh?: () => void | Promise<unknown>;
}

/**
 * 颜色图片同步：把「开发样衣颜色上传图片」同步到「SKU 商品编码行图片」
 * 源：t_style_attachment.biz_type = 'color_image::<颜色>'
 * 目标：t_product_sku.sku_color_image
 */
export const useSkuColorImageSync = ({ styleId, styleNo, onRefresh }: UseSkuColorImageSyncParams) => {
  const { message } = App.useApp();
  const [syncing, setSyncing] = useState(false);
  const [syncingColor, setSyncingColor] = useState<string | null>(null);

  /** 全量同步所有颜色 */
  const syncAll = useCallback(async () => {
    if (!styleId || !styleNo) {
      message.warning('款式信息不完整，无法同步颜色图片');
      return;
    }
    setSyncing(true);
    try {
      const source = await fetchColorImageSourceMap(styleId, styleNo);
      const current = await fetchSkuColorImageMap(styleNo);
      const diff = diffColorImages(source, current);
      const colors = Object.keys(diff);
      if (!colors.length) {
        message.info('颜色图片已是最新，无需同步');
      } else {
        await writeSkuColorImages(styleId, diff);
        message.success(`已同步 ${colors.length} 个颜色图片：${colors.join('、')}`);
      }
      await onRefresh?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '同步颜色图片失败');
    } finally {
      setSyncing(false);
    }
  }, [styleId, styleNo, onRefresh, message]);

  /** 单个颜色同步 */
  const syncOne = useCallback(async (color: string) => {
    const key = String(color || '').trim();
    if (!styleId || !styleNo || !key) return;
    setSyncingColor(key);
    try {
      const source = await fetchColorImageSourceMap(styleId, styleNo);
      const url = source[key];
      if (!url) {
        message.warning(`开发样衣未上传「${key}」颜色图片，无法同步`);
        return;
      }
      const current = await fetchSkuColorImageMap(styleNo);
      if (current[key] === url) {
        message.info(`「${key}」颜色图片已是最新`);
        return;
      }
      await writeSkuColorImages(styleId, { [key]: url });
      message.success(`已同步「${key}」颜色图片`);
      await onRefresh?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '同步颜色图片失败');
    } finally {
      setSyncingColor(null);
    }
  }, [styleId, styleNo, onRefresh, message]);

  return useMemo(
    () => ({ syncing, syncingColor, syncAll, syncOne }),
    [syncing, syncingColor, syncAll, syncOne],
  );
};
