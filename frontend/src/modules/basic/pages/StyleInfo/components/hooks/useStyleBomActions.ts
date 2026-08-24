import { App } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { StyleBom } from '@/types/style';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import { usePurchaseCartActions } from '@/hooks/usePurchaseCart';
import type { MaterialPickupRecord } from '@/components/common/MaterialPickupModal';

export interface SamplePurchaseStatus {
  generated: boolean;
  count: number;
  pendingCount: number;
  latestTime?: string | null;
}

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
  user: _user,
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

  // 样衣采购生成状态：已生成→按钮变"重新生成"，防止用户误以为可无限生成
  const [purchaseStatus, setPurchaseStatus] = useState<SamplePurchaseStatus>({ generated: false, count: 0, pendingCount: 0 });

  const fetchPurchaseStatus = useCallback(async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) return;
    try {
      const res = await api.get<{ code: number; data: SamplePurchaseStatus }>(`/style/bom/purchase-status/${sid}`);
      if (res.code === 200 && res.data) {
        setPurchaseStatus({
          generated: Boolean(res.data.generated),
          count: Number(res.data.count) || 0,
          pendingCount: Number(res.data.pendingCount) || 0,
          latestTime: res.data.latestTime ?? null,
        });
      }
    } catch {
      // 状态查询失败不阻塞页面，仅按钮保持默认态
    }
  }, [styleId]);

  useEffect(() => {
    void fetchPurchaseStatus();
  }, [fetchPurchaseStatus]);

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
      message.error('请先配置物料清单');
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
          // 立即联动：按钮状态更新 + 通知采购列表等页面实时刷新（无需手动刷新）
          void fetchPurchaseStatus();
          try {
            window.dispatchEvent(new Event('data:changed'));
          } catch {
            // 事件派发失败不影响业务
          }
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

    if (purchaseStatus.generated) {
      confirmAction('重新生成采购单', `该款式已生成过 ${purchaseStatus.count} 条样衣采购记录（待采购 ${purchaseStatus.pendingCount} 条）。\n\n重新生成将删除旧的【待采购】记录后重建；已领取/已完成的记录不会被删除。`, () => doGenerate(true), { okText: '重新生成', danger: true });
      return;
    }

    confirmAction('确认生成采购单', `将根据当前物料清单（${data.length}个物料）及款式颜色数量生成采购记录。\n\n提示：建议先「检查库存」——库存充足的物料可在表格内直接领取，无需采购。`, () => doGenerate(false));
  }, [data, message, setLoading, styleId, purchaseStatus, fetchPurchaseStatus]);

  const handleCheckStock = useCallback(async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    const tempRows = data.filter((item) => isTempId(item.id));
    const savedRows = data.filter((item) => !isTempId(item.id));
    if (savedRows.length === 0) {
      message.warning('暂无已保存的物料清单数据，请先保存后再检查库存');
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

  /** 将 StyleBom 转为领取弹窗所需的 record（仅组装数据，不直接调 API） */
  const buildPickupRecord = useCallback((record: StyleBom): MaterialPickupRecord => {
    return {
      materialId: record.materialId,
      materialCode: record.materialCode,
      materialName: record.materialName,
      color: record.color,
      size: '',
      unit: record.unit,
      defaultQuantity: record.devUsageAmount ?? record.usageAmount,
      availableStock: record.availableStock,
      stockStatus: record.stockStatus,
    };
  }, []);

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
      message.error('请先配置物料清单');
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
    buildPickupRecord,
    handleDelete,
    handleAddToPurchaseCart,
    purchaseStatus,
    fetchPurchaseStatus,
  };
};

export default useStyleBomActions;
