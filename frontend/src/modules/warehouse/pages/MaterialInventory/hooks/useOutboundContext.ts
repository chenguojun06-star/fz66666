import { useState, useCallback } from 'react';
import { Form } from 'antd';
import { useModal } from '@/hooks';
import { factoryApi } from '@/services/system/factoryApi';
import { message } from '@/utils/antdStatic';
import {
  fetchOrderOptions,
  matchOutboundContext,
} from './outboundMatchHelper';
import type { OutboundFactoryOption, OutboundOrderOption } from './outboundMatchHelper';
import type { MaterialInventory } from '../types';

export type { OutboundFactoryOption, OutboundOrderOption } from './outboundMatchHelper';

export function useOutboundContext() {
  const [outboundForm] = Form.useForm();
  const [factoryOptions, setFactoryOptions] = useState<OutboundFactoryOption[]>([]);
  const [outboundOrderOptions, setOutboundOrderOptions] = useState<OutboundOrderOption[]>([]);

  const loadFactories = useCallback(async () => {
    try {
      const res = await factoryApi.list({ page: 1, pageSize: 200 });
      const records = (res as any)?.data?.records || (res as any)?.records || [];
      const opts: OutboundFactoryOption[] = (records as any[]).map((item) => ({
        value: item.id ? String(item.id) : String(item.factoryId || item.name || ''),
        label: item.factoryName || item.name || '',
        factoryId: item.id ? String(item.id) : String(item.factoryId || ''),
        factoryName: item.factoryName || item.name || '',
        factoryType: item.factoryType ? String(item.factoryType).toUpperCase() : undefined,
      })).filter((f: OutboundFactoryOption) => f.factoryName);
      setFactoryOptions(opts);
    } catch {
      message.error('加载工厂列表失败');
    }
  }, []);

  const searchOutboundOrders = useCallback(async (
    factoryName?: string, factoryType?: string, keyword?: string,
  ): Promise<OutboundOrderOption[]> => {
    if (!factoryName && !keyword) { setOutboundOrderOptions([]); return []; }
    try {
      const options = await fetchOrderOptions(factoryName, factoryType, keyword);
      setOutboundOrderOptions(options);
      return options;
    } catch {
      setOutboundOrderOptions([]);
      return [];
    }
  }, []);

  const handleOutboundFactoryInput = useCallback(async (factoryId: string, factoryType?: string) => {
    const selected = factoryOptions.find((f) => f.factoryId === factoryId || f.value === factoryId);
    const factoryName = selected?.factoryName || '';
    const resolvedType = (selected?.factoryType || factoryType || '').toUpperCase();
    outboundForm.setFieldsValue({ factoryName, factoryType: resolvedType, factoryId });
    setOutboundOrderOptions([]);
    if (factoryName) { await searchOutboundOrders(factoryName, resolvedType); }
  }, [factoryOptions, outboundForm, searchOutboundOrders]);

  const handleOutboundOrderInput = useCallback(async (keyword: string) => {
    const factoryName = outboundForm.getFieldValue('factoryName') || '';
    const factoryType = outboundForm.getFieldValue('factoryType') || '';
    await searchOutboundOrders(factoryName, factoryType, keyword);
  }, [outboundForm, searchOutboundOrders]);

  const handleOutboundOrderSelect = useCallback((orderNo: string) => {
    const option = outboundOrderOptions.find((o) => o.orderNo === orderNo || o.value === orderNo);
    if (!option) return;
    outboundForm.setFieldsValue({
      orderNo: option.orderNo, styleNo: option.styleNo,
      factoryId: option.factoryId || outboundForm.getFieldValue('factoryId'),
      factoryName: option.factoryName || outboundForm.getFieldValue('factoryName'),
      factoryType: option.factoryType || outboundForm.getFieldValue('factoryType'),
    });
  }, [outboundForm, outboundOrderOptions]);

  const autoMatchOutboundContext = useCallback(async (
    record: MaterialInventory,
    extra?: { receiverId?: string; receiverName?: string; factoryName?: string; factoryType?: string; },
  ) => {
    const result = await matchOutboundContext(
      record, outboundForm,
      { factoryOptions, searchOrdersFn: searchOutboundOrders },
      extra,
    );
    if (result) { outboundForm.setFieldsValue(result); }
  }, [factoryOptions, outboundForm, searchOutboundOrders]);

  return {
    outboundForm, factoryOptions, outboundOrderOptions, setOutboundOrderOptions,
    loadFactories, searchOutboundOrders, autoMatchOutboundContext,
    handleOutboundFactoryInput, handleOutboundOrderInput, handleOutboundOrderSelect,
  };
}
