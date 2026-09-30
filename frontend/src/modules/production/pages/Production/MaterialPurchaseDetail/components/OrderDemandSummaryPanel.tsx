import React, { useEffect, useState } from 'react';
import api from '@/utils/api';
import MaterialDemandSummary from '@/components/common/MaterialDemandSummary';
import type { MaterialDemandItem } from '@/components/common/MaterialDemandSummary';

/**
 * D-660：订单维度物料需求一览（需求/库存/在途/缺口）。
 * 数据与智能采购推荐同口径（/demand/preview，BOM 含损耗，按同款同日合并单聚合），
 * 视觉与下单页「单价与面辅料分析」同一套语言。样衣采购无订单上下文不显示。
 */
const OrderDemandSummaryPanel: React.FC<{ orderId?: string; orderNo?: string }> = ({ orderId, orderNo }) => {
  const [items, setItems] = useState<MaterialDemandItem[]>([]);

  useEffect(() => {
    let alive = true;
    const id = (orderId || '').trim();
    const no = (orderNo || '').trim();
    if (!id && !no) {
      setItems([]);
      return;
    }
    api.get('/production/material-purchase/demand/preview', { params: id ? { orderId: id } : { orderNo: no } })
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        const byKey = new Map<string, MaterialDemandItem>();
        for (const r of list) {
          const code = String(r?.materialCode || '').trim();
          if (!code) continue;
          const key = `${code}|${String(r?.color || '').trim()}`;
          const qty = Number(r?.purchaseQuantity) || 0;
          const prev = byKey.get(key);
          if (prev) {
            prev.requiredQty = (Number(prev.requiredQty) || 0) + qty;
          } else {
            byKey.set(key, {
              key,
              label: String(r?.materialName || code),
              requiredQty: qty,
              unit: String(r?.unit || ''),
            });
          }
        }
        setItems([...byKey.values()]);
      })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [orderId, orderNo]);

  if (items.length === 0) return null;
  return <MaterialDemandSummary items={items} />;
};

export default OrderDemandSummaryPanel;
