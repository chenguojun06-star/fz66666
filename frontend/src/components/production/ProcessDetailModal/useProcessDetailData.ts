import { useState, useEffect, useMemo, useCallback } from 'react';
import api, { type ApiResult } from '@/utils/api';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { compareSizeAsc } from '@/utils/api/size';
import type { CuttingBundle, ProcessDetailModalProps } from './types';

interface TemplateNode {
  name: string;
  processCode?: string;
  progressStage?: string;
  description?: string;
}

export interface ProcessDetailData {
  cuttingBundles: CuttingBundle[];
  warehousingSkuRows: Array<{ color: string; size: string; quantity: number }>;
  templatePriceMap: Map<string, number>;
  styleProcessDescriptionMap: Map<string, string>;
  secondaryProcessDescriptionMap: Map<string, string>;
  templateNodesList: TemplateNode[];
  cuttingSizeItems: Array<{ size: string; quantity: number }>;
}

export const useProcessDetailData = (
  visible: boolean,
  record: ProcessDetailModalProps['record'],
  processType: string,
) => {
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [warehousingSkuRows, setWarehousingSkuRows] = useState<Array<{ color: string; size: string; quantity: number }>>([]);
  const [templatePriceMap, setTemplatePriceMap] = useState<Map<string, number>>(new Map());
  const [styleProcessDescriptionMap, setStyleProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const [secondaryProcessDescriptionMap, setSecondaryProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const [templateNodesList, setTemplateNodesList] = useState<TemplateNode[]>([]);

  useEffect(() => {
    if (!visible || !record) return;
    const styleNo = String((record as any)?.styleNo || '').trim();
    if (!styleNo) {
      setTemplateNodesList([]);
      return;
    }
    (async () => {
      try {
        const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
        const rows: any[] = Array.isArray(res?.data) ? res.data : [];
        const pm = new Map<string, number>();
        const nl: TemplateNode[] = [];
        rows.forEach((n: any) => {
          const name = String(n?.name || '').trim();
          if (!name) return;
          const price = Number(n?.unitPrice);
          if (Number.isFinite(price) && price > 0) pm.set(name, price);
          nl.push({
            name,
            processCode: String(n?.id || n?.processCode || name).trim(),
            progressStage: String(n?.progressStage || '').trim(),
            description: String(n?.description || '').trim(),
          });
        });
        setTemplatePriceMap(pm);
        setTemplateNodesList(nl);
      } catch {
        setTemplateNodesList([]);
      }
    })();
  }, [visible, record]);

  useEffect(() => {
    if (!visible || !record?.styleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    const styleId = String(record.styleId).trim();
    if (!styleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    (async () => {
      try {
        const [processRes, secondaryRes] = await Promise.all([
          api.get(`/style/process/list?styleId=${styleId}`),
          api.get(`/style/secondary-process/list?styleId=${styleId}`),
        ]);
        const processRows = Array.isArray(processRes?.data) ? processRes.data : [];
        const secondaryRows = Array.isArray(secondaryRes?.data) ? secondaryRes.data : [];
        const nextProcessMap = new Map<string, string>();
        const nextSecondaryMap = new Map<string, string>();
        processRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextProcessMap.set(name, description);
        });
        secondaryRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextSecondaryMap.set(name, description);
        });
        setStyleProcessDescriptionMap(nextProcessMap);
        setSecondaryProcessDescriptionMap(nextSecondaryMap);
      } catch {
        setStyleProcessDescriptionMap(new Map());
        setSecondaryProcessDescriptionMap(new Map());
      }
    })();
  }, [visible, record?.styleId]);

  const loadCuttingData = useCallback(async () => {
    if (!record?.id) return;
    try {
      const res = await api.get('/production/cutting/list', {
        params: {
          productionOrderId: record.id,
          productionOrderNo: record.orderNo,
          page: 1,
          pageSize: 999,
        },
      });
      let records: CuttingBundle[] = [];
      if (res.code === 200 && res.data?.records) {
        records = res.data.records;
      } else if (Array.isArray(res.data)) {
        records = res.data;
      } else if (Array.isArray(res)) {
        records = res;
      }
      const orderNo = record.orderNo || '';
      const filtered = orderNo
        ? records.filter((b: any) => {
            const qrCode = String(b.qrCode || b.bundleNo || '').trim();
            return qrCode.startsWith(orderNo);
          })
        : records;
      setCuttingBundles(filtered || []);
    } catch (error) {
      console.error('加载裁剪数据失败:', error);
      setCuttingBundles([]);
    }
  }, [record?.id, record?.orderNo]);

  useEffect(() => {
    if (visible && record?.id) {
      loadCuttingData();
    }
  }, [visible, record?.id, loadCuttingData]);

  useEffect(() => {
    if (!visible || processType !== 'warehousing' || !record?.orderNo) {
      setWarehousingSkuRows([]);
      return;
    }
    (async () => {
      try {
        const res = await api.get<ApiResult<any[]>>('/production/scan/sku/query', {
          params: { type: 'list', orderNo: record.orderNo },
        });
        const rows: any[] = Array.isArray(res) ? res : (res?.data ?? []);
        setWarehousingSkuRows(
          rows.map((r: any) => ({
            color: String(r.color || '-'),
            size: String(r.size || '-'),
            quantity: Number(r.quantity) || 0,
          })),
        );
      } catch {
        setWarehousingSkuRows([]);
      }
    })();
  }, [visible, processType, record?.orderNo]);

  const cuttingSizeItems = useMemo(() => {
    if (cuttingBundles.length === 0) return [];
    const sizeMap: Record<string, number> = {};
    cuttingBundles.forEach((bundle) => {
      const size = (bundle.size || '').toUpperCase().trim();
      if (size) {
        sizeMap[size] = (sizeMap[size] || 0) + (bundle.quantity || 0);
      }
    });
    return Object.entries(sizeMap)
      .filter(([_, qty]) => qty > 0)
      .map(([size, quantity]) => ({ size, quantity }))
      .sort((a, b) => compareSizeAsc(a.size, b.size));
  }, [cuttingBundles]);

  return {
    cuttingBundles,
    warehousingSkuRows,
    templatePriceMap,
    styleProcessDescriptionMap,
    secondaryProcessDescriptionMap,
    templateNodesList,
    cuttingSizeItems,
  };
};
