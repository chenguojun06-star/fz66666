import type { ShipDetailItem } from '@/services/production/factoryShipmentApi';

/** 空白发货明细行 */
export const EMPTY_SHIP_DETAIL: ShipDetailItem = { color: '', sizeName: '', quantity: 0 };

/** 初始空明细行列表 */
export const INITIAL_SHIP_DETAILS: ShipDetailItem[] = [{ ...EMPTY_SHIP_DETAIL }];

/**
 * 过滤出有效的发货明细（颜色、尺码、数量均不为空且数量大于 0）
 */
export function filterValidShipDetails(details: ShipDetailItem[]): ShipDetailItem[] {
  return details.filter(d => d.color && d.sizeName && d.quantity > 0);
}
