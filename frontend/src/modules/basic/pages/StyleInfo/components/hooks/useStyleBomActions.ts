import { App } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { StyleBom } from '@/types/style';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import { usePurchaseCartActions } from '@/hooks/usePurchaseCart';

interface UseStyleBomActionsOptions {
  locked: boolean;
  styleId: string | number;
  currentStyleNo: string;
  data: StyleBom[];
  tableEditable: boolean;
  user: any;
  form: FormInstance;
  setLoading: (loading: boolean) => void;
  setCheckingStock: (loading: boolean) => void;
  setData: Dispatch<SetStateAction<StyleBom[]>>;
  fetchBom: () => Promise<StyleBom[]>;
  isTempId: (id: unknown) => boolean;
  sortBomRows: (rows: StyleBom[]) => StyleBom[];
}

const useStyleBomActions = ({
  locked,
  styleId,
  currentStyleNo,
  data,
  tableEditable,
  user,
  form,
  setLoading,
  setCheckingStock,
  setData,
  fetchBom,
  isTempId,
  sortBomRows,
}: UseStyleBomActionsOptions) => {
  const { message } = App.useApp();
  const { batchAddItems } = usePurchaseCartActions();

  const debugValue = useCallback((value: unknown) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, []);

  const handleGeneratePurchase = useCallback(async () => {
    if (!data.length) {
      message.error('请先配置BOM物料');
      return;
    }

    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    const doGenerate = async (force: boolean) => {
      setLoading(true);
      try {
        const result = await api.post<{ code: number; message: string; data: number }>('/style/bom/generate-purchase', {
          styleId: sid,
          force,
        });
        if (result.code === 200) {
          const count = Number(result.data) || 0;
          message.success(`成功生成 ${count} 条物料采购记录`);
          return;
        }

        const errorMessage = String(result.message || '生成失败');
        if (errorMessage.includes('已生成过') && !force) {
          confirmAction('已存在样衣采购记录', '该款式已生成过样衣采购记录。是否删除旧的【待采购】记录并重新生成？（已领取/已完成的记录不会被删除）', () => doGenerate(true), { okText: '重新生成', danger: true });
          return;
        }

        message.error(errorMessage);
      } catch (error: unknown) {
        message.error(`生成失败：${error instanceof Error ? error.message : '请求失败'}`);
      } finally {
        setLoading(false);
      }
    };

    confirmAction('确认生成采购单', `将根据当前BOM配置（${data.length}个物料）及款式颜色数量生成物料采购记录，是否继续？`, () => doGenerate(false));
  }, [data, message, setLoading, styleId]);

  const handleCheckStock = useCallback(async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    const tempRows = data.filter((item) => isTempId(item.id));
    const savedRows = data.filter((item) => !isTempId(item.id));
    if (savedRows.length === 0) {
      message.warning('暂无已保存的BOM数据，请先保存后再检查库存');
      return;
    }

    setCheckingStock(true);
    try {
      const result = await api.post<{ code: number; message: string; data: StyleBom[] }>(`/style/bom/check-stock/${sid}`);
      if (result.code === 200) {
        const checkedBomList = result.data as StyleBom[];
        setData(sortBomRows([...checkedBomList, ...tempRows]));
        const stats = { sufficient: 0, insufficient: 0, none: 0, unchecked: 0 };
        checkedBomList.forEach((bom) => {
          const status = bom.stockStatus || 'unchecked';
          stats[status as keyof typeof stats] = (stats[status as keyof typeof stats] || 0) + 1;
        });
        message.success(`库存检查完成：充足 ${stats.sufficient} | 不足 ${stats.insufficient} | 无库存 ${stats.none}`);
        return;
      }
      message.error(String(result.message || '检查失败'));
    } catch (error: unknown) {
      message.error(`检查失败：${error instanceof Error ? error.message : '请求失败'}`);
    } finally {
      setCheckingStock(false);
    }
  }, [data, isTempId, message, setCheckingStock, setData, sortBomRows, styleId]);

  const handleApplyPickup = useCallback((record: StyleBom) => {
    const pickupQty = record.devUsageAmount ?? record.usageAmount;
    confirmAction('申请领取', `确认申请领取「${record.materialCode || ''} ${record.materialName || ''}」，数量：${pickupQty ?? ''}${record.unit || ''}？`, async () => {
      try {
        await api.post('/production/picking/pending', {
          picking: {
            styleId: String(styleId || ''),
            styleNo: currentStyleNo,
            pickerId: String(user?.id || ''),
            pickerName: String(user?.name || user?.username || ''),
            pickupType: 'INTERNAL',
            usageType: 'SAMPLE',
            remark: 'BOM_PICK',
          },
          items: [{
            materialId: record.materialId,
            materialCode: record.materialCode,
            materialName: record.materialName,
            color: record.color ?? '',
            size: '',
            quantity: pickupQty != null ? Number(pickupQty) : 1,
            unit: record.unit ?? '',
          }],
        });
        message.success('申请领取成功，将在「面辅料出入库 → 待出库领料」中显示');
      } catch (error: unknown) {
        message.error(`申请失败：${error instanceof Error ? error.message : '请求错误'}`);
      }
    }, { okText: '确认申请' });
  }, [currentStyleNo, message, styleId, user]);

  const handleDelete = useCallback(async (id: string | number) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    try {
      const deletingId = String(id);
      if (isTempId(id)) {
        setData((prev) => prev.filter((item) => String(item.id) !== deletingId));
        try {
          form.resetFields([deletingId]);
        } catch {
          // 忽略错误
        }
        message.success('删除成功');
        return;
      }

      const result = await api.delete(`/style/bom/${encodeURIComponent(deletingId)}`) as Record<string, unknown>;
      if (result.code === 200 && result.data === true) {
        message.success('删除成功');
        if (tableEditable) {
          setData((prev) => sortBomRows(prev.filter((item) => String(item.id) !== deletingId)));
          try {
            form.resetFields([deletingId]);
          } catch {
            // 忽略错误
          }
        } else {
          void fetchBom();
        }
        return;
      }

      const detail = `code:${debugValue(result?.code)}, data:${debugValue(result?.data)}`;
      message.error(`${result?.message || '删除失败'}（${detail}）`);
    } catch (error: unknown) {
      message.error(`删除失败（${error instanceof Error ? error.message : '请求失败'}）`);
    }
  }, [debugValue, fetchBom, form, isTempId, locked, message, setData, sortBomRows, tableEditable]);

  const handleAddToPurchaseCart = useCallback(async () => {
    if (!data.length) {
      message.error('请先配置BOM物料');
      return;
    }

    const itemsToAdd = data
      .filter((item) => {
        const qty = Number(item.devUsageAmount ?? item.usageAmount);
        return qty > 0 && String(item.materialCode || '').trim();
      })
      .map((item) => ({
        materialCode: String(item.materialCode || '').trim(),
        materialName: String(item.materialName || '').trim(),
        materialType: (String(item.materialType || '').toUpperCase() as any) || 'ACCESSORY',
        specifications: String(item.specification || item.specifications || '').trim() || undefined,
        unit: String(item.unit || '').trim() || '-',
        quantity: Number(item.devUsageAmount ?? item.usageAmount) || 0,
        supplierId: String(item.supplierId || '').trim() || undefined,
        supplierName: String(item.supplier || item.supplierName || '').trim() || undefined,
        unitPrice: Number(item.unitPrice) || undefined,
        sourceType: 'SAMPLE' as const,
        sourceId: String(styleId || '').trim() || undefined,
        sourceNo: String(currentStyleNo || '').trim() || undefined,
        sourceQuantity: Number(item.devUsageAmount ?? item.usageAmount) || 0,
        color: String(item.color || '').trim() || undefined,
        fabricComposition: String(item.fabricComposition || '').trim() || undefined,
        fabricWidth: String(item.fabricWidth || '').trim() || undefined,
        fabricWeight: String(item.fabricWeight || '').trim() || undefined,
        remark: `来自BOM：${currentStyleNo || ''}`,
      }));

    if (!itemsToAdd.length) {
      message.error('没有有效的物料数据');
      return;
    }

    try {
      const result = await batchAddItems(itemsToAdd);
      if (result) {
        const success = Number(result.successCount || 0);
        const merged = Number(result.mergedCount || 0);
        message.success(`已添加 ${success} 个物料到采购车（${merged} 个已合并）`);
      }
    } catch (error: unknown) {
      message.error(`添加失败：${error instanceof Error ? error.message : '请求失败'}`);
    }
  }, [batchAddItems, data, message, currentStyleNo, styleId]);

  return {
    handleGeneratePurchase,
    handleCheckStock,
    handleApplyPickup,
    handleDelete,
    handleAddToPurchaseCart,
  };
};

export default useStyleBomActions;
