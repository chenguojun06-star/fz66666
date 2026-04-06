import { useState } from 'react';
import { Form } from 'antd';
import api from '@/utils/api';
import { isSupervisorOrAbove, isAdmin as isAdminUser } from '@/utils/AuthContext';
import { message } from '@/utils/antdStatic';
import type { MaterialInventory } from '../types';
import type { MaterialStockAlertItem } from '../components/MaterialAlertRanking';

interface UseInstructionManagerParams {
  alertList: MaterialStockAlertItem[];
  user: any;
}

export function useInstructionManager({ alertList, user }: UseInstructionManagerParams) {
  const [dbMaterialOptions, setDbMaterialOptions] = useState<Array<{ label: string; value: string; dbRecord?: any }>>([]);
  const [dbSearchLoading, setDbSearchLoading] = useState(false);
  const [instructionVisible, setInstructionVisible] = useState(false);
  const [instructionSubmitting, setInstructionSubmitting] = useState(false);
  const [instructionTarget, setInstructionTarget] = useState<MaterialStockAlertItem | null>(null);
  const [receiverOptions, setReceiverOptions] = useState<Array<{ label: string; value: string; name: string; roleName?: string }>>([]);
  const [instructionForm] = Form.useForm();

  const searchMaterialFromDatabase = async (keyword: string) => {
    if (!keyword || keyword.length < 1) {
      setDbMaterialOptions([]);
      return;
    }
    setDbSearchLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword, pageSize: 20 },
      });
      const records: any[] = res?.data?.records || [];
      const opts = records.map((m: any) => {
        const isAlert = alertList.some((a) => a.materialCode === m.materialCode);
        const labelBase = `${m.materialName || ''}（${m.materialCode || ''}）`;
        return {
          label: isAlert ? `${labelBase} 库存不足` : labelBase,
          value: m.materialCode,
          dbRecord: m,
        };
      });
      setDbMaterialOptions(opts);
    } catch {
      setDbMaterialOptions([]);
    } finally {
      setDbSearchLoading(false);
    }
  };

  const loadReceivers = async () => {
    try {
      const res = await api.get('/system/user/list', { params: { page: 1, pageSize: 200 } });
      if (res?.code === 200 && res.data?.records) {
        const items = res.data.records.map((item: any) => {
          const name = String(item.name || item.username || item.id || '').trim();
          return { label: name, value: String(item.id || ''), name, roleName: String(item.roleName || '') };
        }).filter((item: any) => item.value);
        setReceiverOptions(items);
      }
    } catch (e) {
      message.error('加载接收人失败');
    }
  };

  const loadFactoryWorkers = async (factoryId: string) => {
    try {
      const res = await api.get('/factory-worker/list', { params: { factoryId, status: 'active' } });
      const records = res?.data || [];
      if (Array.isArray(records) && records.length > 0) {
        const items = records.map((item: any) => {
          const name = String(item.workerName || '').trim();
          return { label: name, value: String(item.id || ''), name, roleName: '工厂人员' };
        }).filter((item: any) => item.value && item.name);
        setReceiverOptions(items);
      } else {
        setReceiverOptions([]);
      }
    } catch {
      message.error('加载工厂人员失败');
    }
  };

  const openInstruction = (alert: MaterialStockAlertItem) => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    setInstructionTarget(alert);
    // 若预警记录缺少颜色，异步从物料资料库补充（进销存与资料库可能未完全同步）
    if (!alert.color && alert.materialCode) {
      api.get('/material/database/list', { params: { keyword: alert.materialCode, pageSize: 10 } })
        .then((res) => {
          const records: any[] = res?.data?.records || [];
          const dbMatch = records.find((r: any) => r.materialCode === alert.materialCode);
          if (dbMatch) {
            setInstructionTarget((prev) =>
              prev ? {
                ...prev,
                color: prev.color || dbMatch.color || '',
                supplierName: prev.supplierName || dbMatch.supplierName || '',
                fabricWidth: prev.fabricWidth || dbMatch.fabricWidth || '',
                fabricWeight: prev.fabricWeight || dbMatch.fabricWeight || '',
                fabricComposition: prev.fabricComposition || dbMatch.fabricComposition || '',
                specification: prev.specification || dbMatch.specification || '',
                unitPrice: prev.unitPrice ?? dbMatch.unitPrice ?? undefined,
              } : prev
            );
          }
        })
        .catch(() => {}); // 静默失败，不影响主流程
    }
    const suggested = Number(alert.suggestedSafetyStock ?? alert.safetyStock ?? 0);
    const current = Number(alert.quantity ?? 0);
    const shortage = Math.max(0, suggested - current);
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    const materialKey = `${alert.materialCode || ''}|${alert.color || ''}|${alert.size || ''}`;
    instructionForm.setFieldsValue({
      materialSelect: materialKey,
      purchaseQuantity: shortage > 0 ? shortage : 1,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      remark: '',
    });
    // 立即将当前用户插入 options，确保 Select 能显示名字（不等异步加载）
    if (receiverId) {
      const selfOption = { label: receiverName || receiverId, value: receiverId, name: receiverName || receiverId, roleName: String((user as any)?.roleName || '') };
      setReceiverOptions(prev => prev.some(o => o.value === receiverId) ? prev : [selfOption, ...prev]);
    }
    setInstructionVisible(true);
    loadReceivers();
  };

  const openInstructionEmpty = () => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    setInstructionTarget(null);
    // 自动回填当前登录用户为采购人
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    instructionForm.setFieldsValue({
      purchaseQuantity: 1,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      remark: '',
    });
    // 立即将当前用户插入 options，确保 Select 能显示名字（不等异步加载）
    if (receiverId) {
      const selfOption = { label: receiverName || receiverId, value: receiverId, name: receiverName || receiverId, roleName: String((user as any)?.roleName || '') };
      setReceiverOptions(prev => prev.some(o => o.value === receiverId) ? prev : [selfOption, ...prev]);
    }
    setInstructionVisible(true);
    loadReceivers();
  };

  const handleMaterialSelect = async (value: string) => {
    // value 为 materialCode（来自 DB 搜索结果）
    // 优先检查该物料是否有预警记录（有则自动填充缺口数量）
    const alertMatch = alertList.find((item) => item.materialCode === value) || null;
    if (alertMatch) {
      // 用 DB 搜索结果补全预警记录中可能为空的颜色/规格等字段
      const dbOpt0 = dbMaterialOptions.find((opt) => opt.value === value);
      const dbRec0 = dbOpt0?.dbRecord;
      setInstructionTarget({
        ...alertMatch,
        color: alertMatch.color || dbRec0?.color || '',
        size: alertMatch.size || dbRec0?.size || '',
        supplierName: alertMatch.supplierName || dbRec0?.supplierName || '',
        fabricWidth: alertMatch.fabricWidth || dbRec0?.fabricWidth || '',
        fabricWeight: alertMatch.fabricWeight || dbRec0?.fabricWeight || '',
        fabricComposition: alertMatch.fabricComposition || dbRec0?.fabricComposition || '',
        conversionRate: alertMatch.conversionRate || dbRec0?.conversionRate || undefined,
        specification: alertMatch.specification || dbRec0?.specification || '',
        unitPrice: alertMatch.unitPrice ?? dbRec0?.unitPrice ?? undefined,
      });
      const suggested = Number(alertMatch.suggestedSafetyStock ?? alertMatch.safetyStock ?? 0);
      const current = Number(alertMatch.quantity ?? 0);
      const shortage = Math.max(0, suggested - current);
      instructionForm.setFieldsValue({ purchaseQuantity: shortage > 0 ? shortage : 1 });
    } else {
      // 无预警记录，从 DB 搜索结果中构建 instructionTarget，并实时查询进销存库存
      const dbOpt = dbMaterialOptions.find((opt) => opt.value === value);
      const m = dbOpt?.dbRecord;
      if (m) {
        // 先设置基本信息（含颜色、尺码）
        setInstructionTarget({
          materialId: String(m.id || ''),
          materialCode: m.materialCode || '',
          materialName: m.materialName || '',
          materialType: m.materialType || '',
          unit: m.unit || '',
          color: m.color || '',
          size: m.size || '',
          supplierName: m.supplierName || '',
          fabricWidth: m.fabricWidth || '',
          fabricWeight: m.fabricWeight || '',
          fabricComposition: m.fabricComposition || '',
          conversionRate: m.conversionRate != null ? Number(m.conversionRate) : undefined,
          specification: m.specification || '',
          unitPrice: m.unitPrice != null ? Number(m.unitPrice) : undefined,
        });
        // 查询进销存获取真实库存，计算采购缺口
        try {
          const stockRes = await api.get('/production/material/stock/list', {
            params: { materialCode: value, page: 1, pageSize: 1 },
          });
          const stockRecord = stockRes?.data?.records?.[0];
          if (stockRecord) {
            const availableQty =
              Number(stockRecord.quantity || 0) - Number(stockRecord.lockedQuantity || 0);
            const safetyStock = Number(stockRecord.safetyStock || 0);
            const shortage = Math.max(0, safetyStock - availableQty);
            instructionForm.setFieldsValue({ purchaseQuantity: shortage > 0 ? shortage : 1 });
            // 同时更新 instructionTarget 中的库存字段，供提交时参考
            setInstructionTarget((prev) =>
              prev
                ? {
                    ...prev,
                    quantity: availableQty,
                    safetyStock,
                    lockedQuantity: Number(stockRecord.lockedQuantity || 0),
                    conversionRate: stockRecord.conversionRate != null ? Number(stockRecord.conversionRate) : prev.conversionRate,
                  }
                : prev,
            );
          } else {
            // 进销存中暂无记录（物料刚建档未入库），采购量默认 1
            instructionForm.setFieldsValue({ purchaseQuantity: 1 });
          }
        } catch {
          // 查询失败不影响选料，采购量默认 1
          instructionForm.setFieldsValue({ purchaseQuantity: 1 });
        }
      }
    }
  };

  const closeInstruction = () => {
    setInstructionVisible(false);
    setInstructionTarget(null);
    instructionForm.resetFields();
  };

  const handleSendInstruction = async () => {
    if (!instructionTarget) {
      message.error('请选择物料');
      return;
    }
    try {
      const values = await instructionForm.validateFields();
      const receiverId = String(values.receiverId || '').trim();
      const receiverName = String(values.receiverName || '').trim();
      if (!receiverId || !receiverName) {
        message.error('请选择采购人');
        return;
      }
      setInstructionSubmitting(true);
      const payload = {
        materialId: instructionTarget.materialId,
        materialCode: instructionTarget.materialCode,
        materialName: instructionTarget.materialName,
        materialType: instructionTarget.materialType,
        unit: instructionTarget.unit,
        conversionRate: instructionTarget.conversionRate,
        color: instructionTarget.color,
        size: instructionTarget.size,
        purchaseQuantity: values.purchaseQuantity,
        receiverId, receiverName,
        remark: values.remark || '',
        fabricComposition: instructionTarget.fabricComposition,
        fabricWeight: instructionTarget.fabricWeight,
        fabricWidth: instructionTarget.fabricWidth,
        specifications: instructionTarget.specification,
        unitPrice: instructionTarget.unitPrice,
        supplierId: instructionTarget.supplierId,
        supplierName: instructionTarget.supplierName,
      };
      const res = await api.post('/production/purchase/instruction', payload);
      if (res?.code === 200) {
        message.success('指令已下发');
        closeInstruction();
      } else {
        message.error(res?.message || '指令下发失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '指令下发失败');
    } finally {
      setInstructionSubmitting(false);
    }
  };

  const buildAlertFromRecord = (record: MaterialInventory): MaterialStockAlertItem => {
    const key = `${record.materialCode || ''}|${record.color || ''}|${record.size || ''}`;
    const matched = alertList.find((item) => {
      const itemKey = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      return itemKey === key;
    });
    if (matched) return matched;
    return {
      materialId: record.id,
      materialCode: record.materialCode,
      materialName: record.materialName,
      materialType: record.materialType,
      unit: record.unit,
      color: record.color,
      size: record.size,
      quantity: record.quantity,
      safetyStock: record.safetyStock,
      suggestedSafetyStock: record.safetyStock,
      supplierName: record.supplierName,
      fabricWidth: record.fabricWidth,
      fabricWeight: record.fabricWeight,
      fabricComposition: record.fabricComposition,
      specification: record.specification,
      unitPrice: record.unitPrice,
    };
  };

  const openInstructionFromRecord = (record: MaterialInventory) => {
    const alert = buildAlertFromRecord(record);
    openInstruction(alert);
  };

  return {
    // states
    dbMaterialOptions,
    dbSearchLoading,
    instructionVisible,
    instructionSubmitting,
    instructionTarget,
    receiverOptions,
    instructionForm,
    // actions
    searchMaterialFromDatabase,
    loadReceivers,
    loadFactoryWorkers,
    openInstruction,
    openInstructionEmpty,
    handleMaterialSelect,
    closeInstruction,
    handleSendInstruction,
    openInstructionFromRecord,
  };
}
