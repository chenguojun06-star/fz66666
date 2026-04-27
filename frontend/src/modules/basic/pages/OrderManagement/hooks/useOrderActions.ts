import { FormInstance } from 'antd';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import type { StyleBom } from '@/types/style';
import { OrderLine, ProgressNode, defaultProgressNodes } from '../types';
import { normalizeCategoryQuery } from '@/utils/styleCategory';
import { splitOptions, mergeDistinctOptions, parseSizeColorConfig } from '../utils/orderFormHelpers';
import { loadProgressNodesForStyle } from '../utils/progressWorkflowBuilder';
import type { SizePriceRecord } from '../utils/orderIntelligence';

interface Deps {
  form: FormInstance;
  setSelectedStyle: (s: StyleInfo | null) => void;
  setVisible: (v: boolean) => void;
  setActiveTabKey: (k: string) => void;
  setCreatedOrder: (o: any) => void;
  setProgressNodes: (n: ProgressNode[]) => void;
  setOrderLines: (l: OrderLine[]) => void;
  setBomList: (l: StyleBom[]) => void;
  setBomLoading: (v: boolean) => void;
  setSizePriceRows: (r: SizePriceRecord[]) => void;
  setSizePriceLoading: (v: boolean) => void;
  setSchedulingResult: (r: any) => void;
  setFactoryMode: (m: 'INTERNAL' | 'EXTERNAL') => void;
  setPricingModeTouched: (v: boolean) => void;
}

export function useOrderActions(deps: Deps) {
  const generateOrderNo = async () => {
    try {
      const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
      if (res.code === 200 && typeof res.data === 'string' && res.data) {
        deps.form.setFieldsValue({ orderNo: res.data });
      }
    } catch { /* ignore */ }
  };

  const fetchBom = async (styleId: string | number) => {
    deps.setBomLoading(true);
    try {
      const res = await api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?styleId=${styleId}`);
      deps.setBomList(res.code === 200 ? (res.data || []) : []);
    } catch {
      deps.setBomList([]);
    } finally {
      deps.setBomLoading(false);
    }
  };

  const fetchSizePrices = async (styleId: string | number) => {
    deps.setSizePriceLoading(true);
    try {
      const res = await api.get<{ code: number; data: SizePriceRecord[] }>('/style/size-price/list', { params: { styleId } });
      deps.setSizePriceRows(res.code === 200 && Array.isArray(res.data) ? res.data : []);
    } catch {
      deps.setSizePriceRows([]);
    } finally {
      deps.setSizePriceLoading(false);
    }
  };

  const initOrderLinesAndForm = (style: StyleInfo) => {
    const parsedConfig = parseSizeColorConfig((style as any)?.sizeColorConfig);
    const initColors = mergeDistinctOptions(splitOptions(style.color), parsedConfig.colors);
    const initSizes = mergeDistinctOptions(splitOptions(style.size), parsedConfig.sizes);
    if (initColors.length && initSizes.length) {
      deps.setOrderLines([]);
    } else {
      const initColor = splitOptions(style.color)[0] || style.color || parsedConfig.colors[0] || '';
      const initSize = splitOptions(style.size)[0] || style.size || parsedConfig.sizes[0] || '';
      deps.setOrderLines([{ id: String(Date.now()), color: initColor, size: initSize, quantity: 1 }]);
    }
    const today = dayjs();
    deps.form.setFieldsValue({
      orderNo: '',
      factoryId: undefined,
      plateType: undefined,
      merchandiser: style.orderType || undefined,
      company: style.customer || undefined,
      productCategory: normalizeCategoryQuery(style.category) || undefined,
      patternMaker: style.sampleSupplier || undefined,
      orderQuantity: 1,
      pricingMode: 'PROCESS',
      manualOrderUnitPrice: undefined,
      scatterPricingMode: 'FOLLOW_ORDER',
      manualScatterUnitPrice: undefined,
      plannedStartDate: today,
      plannedEndDate: today.add(7, 'day'),
    });
  };

  const openCreate = (style: StyleInfo) => {
    deps.setSelectedStyle(style);
    deps.setVisible(true);
    deps.setActiveTabKey('base');
    deps.setCreatedOrder(null);
    deps.setProgressNodes(defaultProgressNodes);
    void loadProgressNodesForStyle(String(style.styleNo || '').trim(), deps.setProgressNodes);
    if (style.id !== undefined && style.id !== null && String(style.id)) {
      fetchBom(style.id);
      fetchSizePrices(style.id);
    } else {
      deps.setBomList([]);
      deps.setSizePriceRows([]);
    }
    deps.setSchedulingResult(null);
    initOrderLinesAndForm(style);
    deps.setPricingModeTouched(false);
    generateOrderNo();
  };

  const closeDialog = () => {
    deps.setVisible(false);
    deps.setSelectedStyle(null);
    deps.setCreatedOrder(null);
    deps.setBomList([]);
    deps.setSizePriceRows([]);
    deps.setSchedulingResult(null);
    deps.setActiveTabKey('base');
    deps.setOrderLines([]);
    deps.setProgressNodes(defaultProgressNodes);
    deps.setFactoryMode('INTERNAL');
    deps.setPricingModeTouched(false);
    deps.form.resetFields();
  };

  return { generateOrderNo, openCreate, closeDialog };
}
