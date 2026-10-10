import type { ShopSkuSummary } from '@/services/shop/shopApi';

/** 列表行：款式 + 店铺状态 + SKU 聚合 */
export type ListingRow = {
  id: number;
  styleNo?: string;
  styleName?: string;
  cover?: string | null;
  remark?: string | null;
  shopListed?: number;
  shopListingTime?: string | null;
  /** 款级售价（未维护 SKU 时的兜底展示） */
  salesPrice?: number | null;
};

export type { ShopSkuSummary };

/** 抽屉里可编辑的 SKU 行（本地态，保存时只提交 dirty 行） */
export type EditableSku = {
  skuId: number;
  skuCode?: string;
  color: string;
  size: string;
  image?: string | null;
  salesPrice: number | null;
  stockQuantity: number | null;
  /** 用户改过才提交，避免把并发改动覆盖回去 */
  dirty?: boolean;
};

export type ListingFilter = 'all' | 'listed' | 'unlisted';

/**
 * 详情页模块内容（D-782 落库字段）。
 *
 * <p>D-785 起由各模块自己的编辑器维护（见 DetailModuleContent），
 * 声明放在这里，避免组件之间互相 import 类型形成环。
 */
export type ListingContent = {
  gallery: string[];
  videoUrl: string | null;
  brand: string | null;
  /** 手工尺码表；留空则按 SKU 矩阵自动生成 */
  sizeChart: string | null;
  points: string[];
  faq: Array<{ q: string; a: string }>;
  priceNote: string | null;
};
