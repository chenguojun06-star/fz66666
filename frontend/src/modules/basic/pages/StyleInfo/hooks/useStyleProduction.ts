import { useState, useEffect } from 'react';
import { App } from 'antd';
import api from '@/utils/api';

interface UseStyleProductionOptions {
  currentStyle: any;
  fetchDetail: (id: string) => Promise<unknown>;
  styleIdParam?: string;
  reportSmartError: (title: string, reason?: string, code?: string) => void;
}

export function useStyleProduction({ currentStyle, fetchDetail, styleIdParam: _styleIdParam, reportSmartError }: UseStyleProductionOptions) {
  const { message } = App.useApp();

  const productionReqRowCount = 100;
  const [productionReqRows, setProductionReqRows] = useState<string[]>(() =>
    Array.from({ length: productionReqRowCount }).map(() => '')
  );
  const [productionSaving, setProductionSaving] = useState(false);
  const [productionRollbackSaving, setProductionRollbackSaving] = useState(false);
  const productionReqEditable = true;

  const updateProductionReqRow = (index: number, value: string) => {
    setProductionReqRows((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const parseProductionReqRows = (value: unknown) => {
    const raw = String(value ?? '');
    const out = Array.from({ length: productionReqRowCount }).map(() => '');
    out[0] = raw;
    return out;
  };

  const _serializeProductionReqRows = (rows: string[]) => {
    return String((Array.isArray(rows) ? rows[0] : '') ?? '');
  };

  const handleSaveProduction = async () => {
    if (!currentStyle?.id) {
      message.warning('请先保存款式基本信息');
      return;
    }
    setProductionSaving(true);
    try {
      const content = _serializeProductionReqRows(productionReqRows);
      await api.put('/style/info', {
        id: currentStyle.id,
        styleNo: currentStyle.styleNo,
        styleName: currentStyle.styleName,
        category: currentStyle.category,
        description: content,
      });
      message.success('生产制单保存成功');
      fetchDetail(String(currentStyle.id));
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '服务返回异常，请稍后重试';
      reportSmartError('生产制单保存失败', errMsg, 'STYLE_PRODUCTION_SAVE_FAILED');
      message.error(errMsg);
    } finally {
      setProductionSaving(false);
    }
  };

  const resetProductionReqFromCurrent = () => {
    const src = (currentStyle as any)?.productionRequirements || (currentStyle as any)?.description;
    if (src) {
      setProductionReqRows(parseProductionReqRows(src));
    }
  };

  useEffect(() => {
    if (!currentStyle) return;
    const src = (currentStyle as any)?.productionRequirements || (currentStyle as any)?.description;
    if (src) {
      setProductionReqRows(parseProductionReqRows(src));
    } else {
      setProductionReqRows(Array.from({ length: productionReqRowCount }).map(() => ''));
    }
  }, [currentStyle, productionReqRowCount]);

  const handleRollbackProductionReq = async () => {
    if (!currentStyle?.id) {
      message.warning('请先保存款式基本信息');
      return;
    }
    setProductionRollbackSaving(true);
    try {
      await api.post(`/style/info/${currentStyle.id}/production-requirements/rollback`);
      message.success('已回退到上一版本');
      fetchDetail(String(currentStyle.id));
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '服务返回异常，请稍后重试';
      reportSmartError('生产制单回退失败', errMsg, 'STYLE_PRODUCTION_ROLLBACK_FAILED');
      message.error(errMsg);
    } finally {
      setProductionRollbackSaving(false);
    }
  };

  return {
    productionReqRowCount,
    productionReqRows,
    productionSaving,
    productionRollbackSaving,
    productionReqEditable,
    updateProductionReqRow,
    handleSaveProduction,
    resetProductionReqFromCurrent,
    handleRollbackProductionReq,
  };
}
