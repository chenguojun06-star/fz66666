/** 季节英文→中文映射 */
export const toSeasonCn = (v: unknown): string => {
  const raw = String(v ?? '').trim();
  if (!raw) return '-';
  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    SPRING: '春季', SUMMER: '夏季', AUTUMN: '秋季', FALL: '秋季', WINTER: '冬季',
    SPRING_SUMMER: '春夏', AUTUMN_WINTER: '秋冬',
  };
  return map[upper] || raw;
};

// 打印选项类型
export interface PrintOptions {
  basicInfo: boolean;    // 基本信息
  sizeTable: boolean;    // 尺寸表
  bomTable: boolean;     // BOM表
  processTable: boolean; // 工序表
  productionSheet: boolean; // 生产制单
}

// 默认打印选项
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  basicInfo: true,
  sizeTable: true,
  bomTable: true,
  processTable: true,
  productionSheet: true,
};

// 组件属性
export interface StylePrintModalProps {
  visible: boolean;
  onClose: () => void;
  /** 样衣ID */
  styleId?: string | number;
  /** 订单ID（大货生产使用） */
  orderId?: string;
  /** 订单号（大货生产使用，如 PO20260211001） */
  orderNo?: string;
  /** 款号 */
  styleNo?: string;
  /** 款名 */
  styleName?: string;
  /** 封面图 */
  cover?: string;
  /** 颜色 */
  color?: string;
  /** 数量（样衣数量或订单数量） */
  quantity?: number;
  /** 分类 */
  category?: string;
  /** 季节 */
  season?: string;
  /** 打印模式：sample(样衣)、order(下单)、production(大货生产) */
  mode?: 'sample' | 'order' | 'production';
  /** 样衣生产记录ID（用于生成扫码二维码），不传时组件自动通过 styleNo 查询 */
  patternProductionId?: string | number;
  /** 额外的基本信息 */
  extraInfo?: Record<string, any>;
  /** 码数明细（大货生产使用） */
  sizeDetails?: Array<{ color: string; size: string; quantity: number }>;
}

// 打印数据类型
export interface PrintData {
  sizes: any[];
  bom: any[];
  process: any[];
  attachments: any[];
  productionSheet: any;
}
