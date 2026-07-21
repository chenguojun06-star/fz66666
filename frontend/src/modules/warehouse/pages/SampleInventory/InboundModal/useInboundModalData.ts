import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FormInstance } from 'antd';
import type { InputRef } from 'antd';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';
import api, { type ApiResult, isApiSuccess } from '@/utils/api';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { message } from '@/utils/antdStatic';
import type { ExistingStockRow, InboundModalProps, StyleSnapshot } from './types';
import {
  buildInboundSeedFromStyle,
  buildStyleSnapshot,
  isNotFoundError,
  normalizeText,
} from './helpers';

export interface UseInboundModalDataResult {
  loading: boolean;
  smartError: SmartErrorInfo | null;
  prefillLoading: boolean;
  styleSnapshot: StyleSnapshot | null;
  showSmartErrorNotice: boolean;
  styleNoRef: MutableRefObject<InputRef | null>;
  sampleWarehouseOptions: ReturnType<typeof useWarehouseAreaOptions>['selectOptions'];
  sampleLocationOptions: ReturnType<typeof useWarehouseLocationByArea>['selectOptions'];
  sampleLocationLoading: boolean;
  sampleSelectedAreaId: string;
  setSampleSelectedAreaId: (areaId: string) => void;
  hydrateStyleFields: (source?: string, overwrite?: boolean) => Promise<void>;
  handleOk: () => Promise<void>;
  reportSmartError: (title: string, reason?: string, code?: string) => void;
}

export const useInboundModalData = (
  form: FormInstance<any>,
  { visible, onSuccess, initialValues }: InboundModalProps
): UseInboundModalDataResult => {
  const { selectOptions: sampleWarehouseOptions } = useWarehouseAreaOptions('SAMPLE');
  const [sampleSelectedAreaId, setSampleSelectedAreaId] = useState<string>('');
  const { selectOptions: sampleLocationOptions, loading: sampleLocationLoading } = useWarehouseLocationByArea('SAMPLE', sampleSelectedAreaId);
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [styleSnapshot, setStyleSnapshot] = useState<StyleSnapshot | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '重试提交' });
  }, [showSmartErrorNotice]);

  // Refs for focus management (better for scanner)
  const styleNoRef = useRef<InputRef>(null);
  const latestHydratedRef = useRef('');

  const applySeedValues = useCallback((seed?: Record<string, any>, overwrite = false) => {
    if (!seed) return;
    const current = form.getFieldsValue();
    const nextValues: Record<string, any> = {};
    Object.entries(seed).forEach(([key, value]) => {
      const normalizedCurrent = typeof current[key] === 'string' ? normalizeText(current[key]) : current[key];
      const normalizedValue = typeof value === 'string' ? normalizeText(value) : value;
      const shouldSet = overwrite
        || normalizedCurrent === undefined
        || normalizedCurrent === null
        || normalizedCurrent === ''
        || (key === 'quantity' && Number(normalizedCurrent || 0) <= 1 && Number(normalizedValue || 0) > 1);
      if (shouldSet && normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '') {
        nextValues[key] = normalizedValue;
      }
    });
    if (Object.keys(nextValues).length) {
      form.setFieldsValue(nextValues);
    }
  }, [form]);

  const hydrateStyleFields = useCallback(async (source?: string, overwrite = false) => {
    const styleKey = normalizeText(source);
    if (!styleKey || latestHydratedRef.current === styleKey) return;
    setPrefillLoading(true);
    try {
      const res = await api.get<ApiResult>(`/style/info/${encodeURIComponent(styleKey)}`);
      if (isApiSuccess(res) && res?.data) {
        const nextSnapshot = buildStyleSnapshot(res.data);
        applySeedValues(buildInboundSeedFromStyle(res.data), overwrite);
        setStyleSnapshot(nextSnapshot);
        latestHydratedRef.current = styleKey;
      }
    } catch {
      setStyleSnapshot(null);
    } finally {
      setPrefillLoading(false);
    }
  }, [applySeedValues]);

  useEffect(() => {
    if (visible) {
      latestHydratedRef.current = '';
      const nextSnapshot = buildStyleSnapshot(initialValues);
      setStyleSnapshot(nextSnapshot);
      form.resetFields();
      applySeedValues(initialValues, true);
      const styleKey = normalizeText(initialValues?.styleId) || normalizeText(initialValues?.styleNo);
      if (styleKey) {
        void hydrateStyleFields(styleKey, true);
      }
      // Auto focus on styleNo when modal opens
      setTimeout(() => styleNoRef.current?.focus(), 100);
    } else {
      setStyleSnapshot(null);
    }
  }, [applySeedValues, form, hydrateStyleFields, initialValues, visible]);

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validateFields();
      if (!styleSnapshot?.planRows?.length) {
        message.error('未识别到系统可入库明细，请先补齐样衣生产码数与数量');
        return;
      }
      setLoading(true);

      const payload = {
        styleId: styleSnapshot.styleId || values.styleId,
        styleNo: values.styleNo,
        styleName: values.styleName,
        sampleType: values.sampleType,
        location: values.warehouseLocation,
        warehouseAreaId: values.warehouseAreaId,
        remark: values.remark,
        imageUrl: styleSnapshot.cover,
        rows: styleSnapshot.planRows.map((row) => ({
          color: row.color,
          size: row.size,
          quantity: row.quantity,
        })),
      };
      let res: { code?: number; message?: string };
      try {
        res = await api.post('/stock/sample/inbound/batch', payload);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }

        const stockRes = await api.get('/stock/sample/list', {
          params: {
            page: 1,
            pageSize: 200,
            styleNo: payload.styleNo,
            sampleType: payload.sampleType,
            recordStatus: 'active',
          },
        }) as { code?: number; data?: { records?: ExistingStockRow[] } };
        const existingRows = Array.isArray(stockRes?.data?.records) ? stockRes.data.records : [];
        const duplicated = payload.rows.find((row) => existingRows.some((item) =>
          String(item?.inventoryStatus || 'active') !== 'destroyed'
          && String(item?.color || '').trim() === row.color
          && String(item?.size || '').trim() === row.size
        ));
        if (duplicated) {
          message.error(`库存已存在：${duplicated.color} / ${duplicated.size}，不能重复入库`);
          return;
        }

        for (const row of payload.rows) {
          const legacyRes = await api.post('/stock/sample/inbound', {
            styleId: payload.styleId,
            styleNo: payload.styleNo,
            styleName: payload.styleName,
            sampleType: payload.sampleType,
            location: payload.location,
            warehouseAreaId: payload.warehouseAreaId,
            remark: payload.remark,
            imageUrl: payload.imageUrl,
            color: row.color,
            size: row.size,
            quantity: row.quantity,
          });
          if ((legacyRes as { code?: number; message?: string })?.code !== 200) {
            throw new Error((legacyRes as { message?: string })?.message || '入库失败');
          }
        }
        res = { code: 200 };
      }
      if (res.code === 200) {
        message.success('入库成功');
        if (showSmartErrorNotice) setSmartError(null);
        onSuccess();
      } else {
        reportSmartError('样衣入库失败', res.message || '请检查输入后重试', 'SAMPLE_INBOUND_SUBMIT_FAILED');
        message.error(res.message || '入库失败');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in (error as Record<string, unknown>)) {
        return;
      }
      const errorMessage = (error as Error)?.message || '网络异常或服务不可用，请稍后重试';
      reportSmartError('样衣入库失败', errorMessage, 'SAMPLE_INBOUND_SUBMIT_EXCEPTION');
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [form, styleSnapshot, showSmartErrorNotice, onSuccess, reportSmartError]);

  return {
    loading,
    smartError,
    prefillLoading,
    styleSnapshot,
    showSmartErrorNotice,
    styleNoRef,
    sampleWarehouseOptions,
    sampleLocationOptions,
    sampleLocationLoading,
    sampleSelectedAreaId,
    setSampleSelectedAreaId,
    hydrateStyleFields,
    handleOk,
    reportSmartError,
  };
};
