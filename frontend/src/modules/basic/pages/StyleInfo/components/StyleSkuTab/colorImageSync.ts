import api, { unwrapApiData, type ApiResult } from '@/utils/api';
import { parseColorImageBizType } from '../../hooks/utils';
import type { StyleAttachment } from '@/types/style';

/**
 * 颜色图片同步数据源（纯函数层，不含 UI 状态）
 *
 * 两套存储彼此独立：
 * - 源（开发样衣颜色上传图片）：t_style_attachment.biz_type = 'color_image::<颜色>'
 * - 目标（商品编码行图片）：t_product_sku.sku_color_image
 *
 * 后端 /style/attachment/list 普通分支不排序，这里自行按 createTime 倒序取「每个颜色最新一张」。
 */

/** 读取开发样衣颜色图片，返回 颜色 -> 图片URL */
export async function fetchColorImageSourceMap(
  styleId: string,
  styleNo: string,
): Promise<Record<string, string>> {
  if (!styleId && !styleNo) return {};
  const res = await api.get<ApiResult<StyleAttachment[]>>('/style/attachment/list', {
    params: styleId ? { styleId } : { styleNo },
  });
  const list = unwrapApiData<StyleAttachment[]>(res, '读取开发样衣颜色图片失败');
  const sorted = [...(Array.isArray(list) ? list : [])].sort((a, b) =>
    String(b?.createTime || '').localeCompare(String(a?.createTime || '')),
  );
  const map: Record<string, string> = {};
  sorted.forEach((item) => {
    const color = String(parseColorImageBizType(item?.bizType) || '').trim();
    if (color && item?.fileUrl && !map[color]) {
      map[color] = String(item.fileUrl);
    }
  });
  return map;
}

/** 读取商品编码当前的颜色图片（按款号），返回 颜色 -> 图片URL */
export async function fetchSkuColorImageMap(styleNo: string): Promise<Record<string, string>> {
  if (!styleNo) return {};
  const res = await api.get<ApiResult<Record<string, string>>>(
    `/style/sku/color-images/${encodeURIComponent(styleNo)}`,
  );
  const map = unwrapApiData<Record<string, string>>(res, '读取商品编码颜色图片失败');
  if (!map || typeof map !== 'object') return {};
  // 颜色键统一去空格（后端写入时按 color.trim() 匹配，避免同色不同键导致同步不生效）
  const normalized: Record<string, string> = {};
  Object.entries(map).forEach(([color, url]) => {
    const key = String(color || '').trim();
    if (key && url) normalized[key] = String(url);
  });
  return normalized;
}

/** 写入商品编码颜色图片（后端按 styleId + 租户 + 颜色 精确匹配同色所有 SKU 行） */
export async function writeSkuColorImages(
  styleId: string,
  map: Record<string, string>,
): Promise<void> {
  if (!styleId || !Object.keys(map).length) return;
  await api.put(`/style/sku/color-images/${styleId}`, map);
}

/**
 * 计算需要同步的差异：源有图且 SKU 缺失/不一致才写。
 * 源没有图的 SKU 保留原值（同步只做「补齐/更新」，不做「清空」）。
 */
export function diffColorImages(
  source: Record<string, string>,
  sku: Record<string, string>,
): Record<string, string> {
  const diff: Record<string, string> = {};
  Object.entries(source).forEach(([color, url]) => {
    if (!color || !url) return;
    if (sku[color] !== url) diff[color] = url;
  });
  return diff;
}
