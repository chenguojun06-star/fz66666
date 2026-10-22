import type { ShopSkuSummary } from '@/services/shop/shopApi';

/** 列表行：款式 + 店铺状态 + SKU 聚合 */
export type ListingRow = {
  id: number;
  styleNo?: string;
  styleName?: string;
  cover?: string | null;
  /** D-800：主图组 JSON 字符串，最多 5 张，第 1 张即 cover；历史数据为空 */
  coverGroup?: string | null;
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
  /** D-837：实际仓库库存（只读，按入库明细合计；可售库存是手填虚拟库存，二者区分） */
  warehouseStock?: number;
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
/** D-808：详情描述内容块 —— 图与文按顺序交错（淘宝详情页的形态） */
export type DetailBlock =
  | { type: 'image'; url: string }
  | {
      type: 'text';
      content: string;
      /**
       * D-810：作为「上面那张图的说明」。
       * 淘宝详情页的说明文字是紧贴图片下方的，不是一个独立区块 ——
       * 不区分时，顾客看到的是「图 + 一个新段落」，观感割裂。
       */
      caption?: boolean;
    };

export type ListingContent = {
  gallery: string[];
  /**
   * D-808：图+文交错的内容块。有它时顾客端按它渲染，
   * 没有则回退用 gallery（老数据零影响）。
   */
  blocks?: DetailBlock[];
  videoUrl: string | null;
  brand: string | null;
  /** 手工尺码表；留空则按 SKU 矩阵自动生成 */
  sizeChart: string | null;
  points: string[];
  faq: Array<{ q: string; a: string }>;
  priceNote: string | null;
};
