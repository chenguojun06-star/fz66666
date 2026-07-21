import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { App } from 'antd';
import api, { toNumberSafe } from '@/utils/api';
import { buildOrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import type { OrderLine } from '@/types/production';

export interface UseSkuMatrixEditArgs {
  order: any;
  orderLines: OrderLine[];
  editing: boolean;
  fetchFlow: () => void;
}

export function useSkuMatrixEdit({ order, orderLines, editing, fetchFlow }: UseSkuMatrixEditArgs) {
  const { message } = App.useApp();

  const [skuEditMap, setSkuEditMap] = useState<Record<string, string>>({});
  const [savingMatrix, setSavingMatrix] = useState(false);

  // 构建颜色尺码矩阵
  const colorSizeMatrixModel = useMemo(() => {
    const items = orderLines.map(l => ({ color: l.color, size: l.size, quantity: l.quantity }));
    return buildOrderColorSizeMatrixModel({
      items: items as any,
      fallbackColor: (order as any)?.color,
      fallbackSize: (order as any)?.size,
      fallbackQuantity: toNumberSafe((order as any)?.orderQuantity),
    });
  }, [orderLines, order]);

  // 初始化/重置SKU编辑映射
  useEffect(() => {
    if (editing) {
      const map: Record<string, string> = {};
      orderLines.forEach(l => {
        const key = `${l.color || ''}|${l.size || ''}`;
        map[key] = l.skuNo || '';
      });
      setSkuEditMap(map);
    }
  }, [editing, orderLines]);

  // 保存颜色尺码矩阵（更新 orderDetails JSON）
  const handleMatrixSave = useCallback(async () => {
    const orderId = (order as any)?.id;
    if (!orderId) { message.error('订单ID不存在'); return; }

    // 唯一性校验：同一订单内 SKU 不能重复
    const skuValues = Object.values(skuEditMap).map(s => (s || '').trim()).filter(Boolean);
    const dupes = skuValues.filter((v, i, arr) => arr.indexOf(v) !== i);
    if (dupes.length > 0) {
      message.error(`SKU 重复：${Array.from(new Set(dupes)).join('、')}，请保证唯一性`);
      return;
    }

    setSavingMatrix(true);
    try {
      const updatedLines = orderLines.map(l => {
        const key = `${l.color || ''}|${l.size || ''}`;
        const newSku = skuEditMap[key] !== undefined ? skuEditMap[key] : (l.skuNo || '');
        return { ...l, skuNo: newSku };
      });
      const res: any = await api.put('/production/order/update-basic-info', {
        id: orderId,
        field: 'orderLines',
        value: JSON.stringify(updatedLines),
        operationRemark: `修改颜色尺码明细（SKU）`,
      });
      if (res?.code === 200) {
        message.success('颜色尺码明细已更新');
        fetchFlow();
      } else {
        message.error(res?.message || '更新失败');
      }
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    } finally {
      setSavingMatrix(false);
    }
  }, [order, orderLines, skuEditMap, message, fetchFlow]);

  // 用户主动清空所有 SKU
  const handleMatrixClearAll = useCallback(() => {
    const map: Record<string, string> = {};
    orderLines.forEach(l => { map[`${l.color || ''}|${l.size || ''}`] = ''; });
    setSkuEditMap(map);
  }, [orderLines]);

  // 用户主动按统一规则生成 SKU（款号 + 颜色 + 尺码 + 顺序号；不加 SKU- 前缀）
  const handleMatrixAutoGen = useCallback(() => {
    const styleNo = String((order as any)?.styleNo || '').trim() || 'STYLE';
    const map: Record<string, string> = {};
    orderLines.forEach((l, idx) => {
      const key = `${l.color || ''}|${l.size || ''}`;
      const c = String(l.color || '').trim();
      const s = String(l.size || '').trim();
      const seq = String(idx + 1).padStart(2, '0');
      const generated = c && s ? `${styleNo}${c}${s}${seq}` : `${styleNo}-${seq}`;
      map[key] = generated;
    });
    setSkuEditMap(map);
    message.success('已按 "款号+颜色+尺码+顺序" 规则生成 SKU（未加前缀），请按需调整');
  }, [order, orderLines, message]);

  // 切换"自动生成 SKU"全局开关（保存到订单）
  const handleSkuAutoToggle = useCallback(async (checked: boolean) => {
    const orderId = (order as any)?.id;
    if (!orderId) return;
    try {
      const res: any = await api.put('/production/order/update-basic-info', {
        id: orderId,
        field: 'skuAutoGenerate',
        value: checked ? 'true' : 'false',
        operationRemark: checked ? '开启自动生成 SKU' : '关闭自动生成 SKU',
      });
      if (res?.code === 200) {
        message.success(checked ? '已开启自动生成 SKU' : '已关闭自动生成 SKU');
        fetchFlow();
      } else {
        message.error(res?.message || '切换失败');
      }
    } catch (e: any) {
      message.error(e?.message || '切换失败');
    }
  }, [order, message, fetchFlow]);

  return {
    skuEditMap,
    setSkuEditMap,
    savingMatrix,
    colorSizeMatrixModel,
    handleMatrixSave,
    handleMatrixClearAll,
    handleMatrixAutoGen,
    handleSkuAutoToggle,
  };
}
