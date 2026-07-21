import { App, Modal, type FormInstance } from 'antd';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { StyleBom } from '@/types/style';
import api from '@/utils/api';
import { sortBomRows as sortBomRowsHelper } from '../styleBom/helpers';
import type { BomRecognizedItem } from './useStyleBomTabData';

export interface UseBomCompletionHandlersOptions {
  form: FormInstance;
  setData: Dispatch<SetStateAction<StyleBom[]>>;
  message: ReturnType<typeof App.useApp>['message'];
  data: StyleBom[];
  styleId: string | number;
  tableEditable: boolean;
  handleAddToPurchaseCart: () => Promise<void> | void;
  onCartAdded?: () => void;
}

const useBomCompletionHandlers = ({
  form,
  setData,
  message,
  data,
  styleId,
  tableEditable,
  handleAddToPurchaseCart,
  onCartAdded,
}: UseBomCompletionHandlersOptions) => {
  const handleAddCartWithCallback = useCallback(async () => {
    await handleAddToPurchaseCart();
    onCartAdded?.();
  }, [handleAddToPurchaseCart, onCartAdded]);

  const handleBomRecognized = useCallback((items: BomRecognizedItem[]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    items.forEach((it, idx) => {
      const rowId = `tmp_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`;
      // 部位兜底：AI未识别到部位时默认"整件"
      const partName = (it.partName || '').trim() || '整件';
      // 子部位：AI未识别到则为空字符串（表示主部位整件使用）
      const subPartName = (it.subPartName || '').trim();
      const patch: Partial<StyleBom> & Record<string, unknown> = {
        id: rowId,
        materialName: it.materialName,
        materialCode: it.materialCode,
        specification: it.specification,
        usageAmount: it.usageAmount,
        partName,
        subPartName,
      };
      form.setFieldsValue({ [rowId]: patch });
    });
    setData((prev) => {
      const next = [...(Array.isArray(prev) ? prev : [])];
      items.forEach((it, idx) => {
        const rowId = `tmp_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`;
        const partName = (it.partName || '').trim() || '整件';
        const subPartName = (it.subPartName || '').trim();
        next.push({
          id: rowId,
          materialName: it.materialName,
          materialCode: it.materialCode,
          specification: it.specification,
          usageAmount: it.usageAmount,
          partName,
          subPartName,
        } as StyleBom);
      });
      return sortBomRowsHelper(next);
    });
  }, [form, setData]);

  const onBeforeComplete = useCallback(async () => {
    if (!data || data.length === 0) {
      message.error('请先配置BOM物料');
      return false;
    }
    if (tableEditable) {
      message.error('请先点击"保存全部"保存单价数据，再完成BOM配置');
      return false;
    }
    const hasZeroPrices = data.some(item => !Number(item.unitPrice));
    if (hasZeroPrices) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          width: '30vw',
          title: '部分单价为0',
          content: '存在单价为0的BOM物料，确认仍然完成BOM配置？',
          okText: '确认完成',
          cancelText: '返回填写',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return false;
    }
    // 标记完成前自动同步BOM到物料数据库（尽力而为，重复自动过滤）
    try {
      await api.post(`/style/bom/${styleId}/sync-material-database`);
    } catch {
      // 尽力而为：同步失败不阻断完成操作
    }
    return true;
  }, [data, message, styleId, tableEditable]);

  return {
    handleAddCartWithCallback,
    handleBomRecognized,
    onBeforeComplete,
  };
};

export default useBomCompletionHandlers;
