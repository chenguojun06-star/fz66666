import api from '@/utils/api';
import { unwrapApiData } from '@/utils/api';

/**
 * 电子小票（电子开票）服务。
 *
 * 小票 = 销售单据的统一电子呈现层 + 扫码签收凭证：
 * POS 收银 / C端店铺订单 / 批发销售出库 三类来源各对应一张小票（幂等），
 * 数据实时聚合自源单据，不落库复制。
 */

/** 小票来源单据类型 */
export type TicketSourceBizType = 'POS_SALE' | 'SHOP_ORDER' | 'OUTSTOCK';

/** 小票状态 */
export type TicketStatus = 'UNSIGNED' | 'SIGNED' | 'VOID';

export interface TicketItem {
  skuId?: number | null;
  skuCode?: string | null;
  styleId?: string | null;
  styleNo?: string | null;
  styleName?: string | null;
  color?: string | null;
  size?: string | null;
  unitPrice?: number | null;
  quantity?: number | null;
  amount?: number | null;
  /** 款式图（SKU 颜色图优先，缺失回退款式封面，可为空） */
  imageUrl?: string | null;
}

/** 小票聚合数据（与后端 TicketData 一致；绝不含成本/利润字段） */
export interface TicketData {
  ticketNo: string;
  /** 签收 token（H5 免登录二维码用） */
  signToken: string;
  status: TicketStatus;
  signedTime?: string | null;
  signedBy?: string | null;
  sourceBizType: TicketSourceBizType;
  sourceBizNo: string;
  createTime?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** 店员/开单人 */
  serverName?: string | null;
  items?: TicketItem[] | null;
  /** 颜色 × 码数数量矩阵：[{color, sizes: {码: 数量}}] */
  matrix?: Array<{ color: string; sizes: Record<string, number> }> | null;
  itemCount?: number | null;
  goodsAmount?: number | null;
  discountAmount?: number | null;
  shippingFee?: number | null;
  totalAmount?: number | null;
  payMethod?: string | null;
  payStatus?: string | null;
  orderStatus?: string | null;
  paidTime?: string | null;
  receivableAmount?: number | null;
  receivableReceived?: number | null;
  remark?: string | null;
}

/** 小票列表行（与后端 SalesTicket 实体一致） */
export interface SalesTicketRow {
  id: number;
  ticketNo: string;
  sourceBizType: TicketSourceBizType;
  sourceBizId: string;
  sourceBizNo: string;
  status: TicketStatus;
  signedTime?: string | null;
  signedBy?: string | null;
  viewCount?: number | null;
  createTime?: string | null;
}

/** 免登录 H5 小票页地址（二维码内容） */
export const ticketH5Url = (signToken: string): string =>
  `${window.location.origin}/ticket/index.html?t=${encodeURIComponent(signToken)}`;

export const ticketApi = {
  /** 按来源单据取小票聚合数据（不存在则幂等补建，兼容历史单据入口） */
  getByBiz: async (
    sourceBizType: TicketSourceBizType,
    sourceBizId: string | number,
    sourceBizNo?: string,
  ): Promise<TicketData> =>
    unwrapApiData<TicketData>(
      await api.get('/ticket', {
        params: { sourceBizType, sourceBizId, sourceBizNo: sourceBizNo || undefined },
      }),
      '加载电子小票失败',
    ),

  /** 全部小票分页列表 */
  page: async (params: { pageNum?: number; pageSize?: number; keyword?: string }): Promise<{
    records: SalesTicketRow[];
    total: number;
  }> => {
    const res = unwrapApiData<{ records: SalesTicketRow[]; total: number; current?: number }>(
      await api.get('/ticket/page', { params }),
      '加载小票列表失败',
    );
    return { records: res?.records ?? [], total: Number(res?.total ?? 0) };
  },
};

export default ticketApi;
