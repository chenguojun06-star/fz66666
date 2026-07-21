import { App, type FormInstance } from 'antd';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { StyleBom } from '@/types/style';
import api from '@/utils/api';
import {
  calcTotalPrice as calcTotalPriceHelper,
  mapDbTypeToBomType as mapDbTypeToBomTypeHelper,
  sortBomRows as sortBomRowsHelper,
} from '../styleBom/helpers';

export interface UseBomMaterialFillOptions {
  form: FormInstance;
  setData: Dispatch<SetStateAction<StyleBom[]>>;
  message: ReturnType<typeof App.useApp>['message'];
  buildSizeSpecMap: (specification?: string, existing?: string) => string;
}

const useBomMaterialFill = ({
  form,
  setData,
  message,
  buildSizeSpecMap,
}: UseBomMaterialFillOptions) => {
  const fillRowFromMaterial = useCallback(
    async (rid: string, material: Record<string, unknown>) => {
      const rowId = String(rid || '').trim();
      if (!rowId) return;
      const m = material || {};
      const patch: Record<string, unknown> = {
        materialCode: String(m.materialCode || '').trim(),
        materialName: String(m.materialName || '').trim(),
        fabricComposition: String(m.fabricComposition || '').trim(),
        fabricWeight: String(m.fabricWeight || '').trim(),
        unit: String(m.unit || '').trim(),
        patternUnit: String(m.patternUnit || m.unit || '').trim(),
        conversionRate: Number(m.conversionRate ?? 1) || 1,
        supplier: String(m.supplierName || '').trim(),
        specification: String(m.specifications ?? m.specification ?? '').trim(),
        unitPrice: Number(m.unitPrice) || 0,
        materialType: mapDbTypeToBomTypeHelper(m.materialType),
        // 自动从面辅料资料带出图片（面辅料资料 image 字段，包装成 JSON 数组）
        imageUrls: m.image ? JSON.stringify([String(m.image).trim()]) : undefined,
      };
      const materialColor = String(m.color ?? m.materialColor ?? '').trim();
      if (materialColor) {
        patch.color = materialColor;
      }
      patch.sizeSpecMap = buildSizeSpecMap(String(patch.specification || ''), m.sizeSpecMap as string | undefined);
      const current = (form.getFieldValue(rowId) || {}) as Record<string, unknown>;
      const merged = { ...current, ...patch };
      merged.totalPrice = calcTotalPriceHelper(merged as Partial<StyleBom>);
      form.setFieldsValue({ [rowId]: merged });
      setData((prev) =>
        sortBomRowsHelper(
          (Array.isArray(prev) ? prev : []).map((it: StyleBom) => {
            if (String(it?.id) !== rowId) return it;
            return { ...it, ...merged } as StyleBom;
          })
        )
      );

      // 自动检查该物料的库存状态
      try {
        const materialCode = String(m.materialCode || '').trim();
        const color = String(merged.color || '').trim();

        if (materialCode) {
          // 使用MaterialStockService查询库存（与后端StyleBomService相同逻辑）
          const res = await api.get<{ code: number; data: { records: any[] } }>(
            '/production/material/stock/list',
            { params: {
              materialCode,
              color: color || undefined,  // 如果颜色为空，不传参数
              page: 1,
              pageSize: 1
            } }
          );

          if (res.code === 200 && res.data?.records?.length > 0) {
            const stock = res.data.records[0];
            const availableQty = Number(stock.quantity || 0) - Number(stock.lockedQuantity || 0);
            const usageAmount = Number(merged.usageAmount || 0);
            const requiredQty = Math.ceil(usageAmount);

            const stockStatus = availableQty >= requiredQty ? 'sufficient' : availableQty > 0 ? 'insufficient' : 'none';
            const requiredPurchase = Math.max(0, requiredQty - availableQty);

            // 更新data数组中的对应行
            setData(prev => sortBomRowsHelper(
              prev.map(item =>
                String(item.id) === rowId ? {
                  ...item,
                  ...merged,
                  stockStatus,
                  availableStock: availableQty,
                  requiredPurchase,
                } as StyleBom : item
              )
            ));

            const statusText = stockStatus === 'sufficient' ? '库存充足' : stockStatus === 'insufficient' ? '库存不足' : '无库存';
            message.success(`${materialCode} 库存检查完成：${statusText}（可用：${availableQty}）`);
          } else {
            // 无库存记录
            const usageAmount = Number(merged.usageAmount || 0);
            const requiredQty = Math.ceil(usageAmount);

            setData(prev => sortBomRowsHelper(
              prev.map(item =>
                String(item.id) === rowId ? {
                  ...item,
                  ...merged,
                  stockStatus: 'none',
                  availableStock: 0,
                  requiredPurchase: requiredQty,
                } as StyleBom : item
              )
            ));

            message.warning(`${materialCode} 无库存记录`);
          }
        }
      } catch {
        message.error('库存检查失败，请稍后重试');
      }
    },
    [buildSizeSpecMap, form, message, setData]
  );

  return { fillRowFromMaterial };
};

export default useBomMaterialFill;
