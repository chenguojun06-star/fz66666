import { App } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { type ApiResult } from '@/utils/api';
import type { StyleAttachment, StyleBom } from '@/types/style';
import { parseNumberMap, resolvePatternUnit, type PatternMaterialRow, type SizeColorConfigInput } from '../stylePattern/helpers';

export interface UseStylePatternTabDataOptions {
  styleId: string | number;
  patternStatus?: string;
  readOnly?: boolean;
  sizeColorConfig?: SizeColorConfigInput;
}

export interface UseStylePatternTabDataResult {
  // 纸样文件
  patternFiles: StyleAttachment[];
  setPatternFiles: React.Dispatch<React.SetStateAction<StyleAttachment[]>>;
  patternCheckResult: { complete: boolean; missingItems: string[] } | null;

  // BOM 各码用量
  bomList: StyleBom[];
  bomLoading: boolean;
  usageEdits: Record<string | number, Record<string, number | null>>;
  lossEdits: Record<string | number, number | null>;
  savingUsage: boolean;
  setUsageEdits: React.Dispatch<React.SetStateAction<Record<string | number, Record<string, number | null>>>>;
  setLossEdits: React.Dispatch<React.SetStateAction<Record<string | number, number | null>>>;

  // 尺码
  extraSizes: string[];
  setExtraSizes: React.Dispatch<React.SetStateAction<string[]>>;
  sizeOptions: Array<{ value: string; label: string }>;
  setSizeOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>;
  sizeSearchTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;

  // 派生
  locked: boolean;
  childReadOnly: boolean;
  activeSizes: string[];
  allSizes: string[];
  patternRows: PatternMaterialRow[];

  // 事件
  handleUsageChange: (bomId: string | number, size: string, val: number | null) => void;
  handleLossChange: (bomId: string | number, val: number | null) => void;
  handleAddSizes: (values: string[]) => void;
  handleSaveUsage: () => Promise<void>;
  fetchBomList: () => Promise<void>;
}

const useStylePatternTabData = ({
  styleId,
  patternStatus,
  readOnly,
  sizeColorConfig,
}: UseStylePatternTabDataOptions): UseStylePatternTabDataResult => {
  const { message } = App.useApp();
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);
  const [patternCheckResult, setPatternCheckResult] = useState<{ complete: boolean; missingItems: string[] } | null>(null);

  // 各码用量状态
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  /** { [bomId]: { [size]: value } } */
  const [usageEdits, setUsageEdits] = useState<Record<string | number, Record<string, number | null>>>({});
  /** { [bomId]: lossRate } */
  const [lossEdits, setLossEdits] = useState<Record<string | number, number | null>>({});
  const [savingUsage, setSavingUsage] = useState(false);
  const [extraSizes, setExtraSizes] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const sizeSearchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 检查纸样是否齐全
  const checkPatternComplete = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { complete: boolean; missingItems: string[] } }>('/style/attachment/pattern/check', { params: { styleId } });
      if (res.code === 200) {
        setPatternCheckResult(res.data);
      }
    } catch {
      // 忽略错误
    }
  }, [styleId]);

  useEffect(() => {
    return () => { if (sizeSearchTimerRef.current) clearTimeout(sizeSearchTimerRef.current); };
  }, []);

  useEffect(() => {
    checkPatternComplete();
  }, [checkPatternComplete, patternFiles]);

  // 获取 BOM 列表（与 BOM 清单保持一致顺序，纸样实际用量直接按 BOM 行录入）
  const fetchBomList = useCallback(async () => {
    if (!styleId) return;
    setBomLoading(true);
    try {
      const res = await api.get<ApiResult<StyleBom[]>>(`/style/bom/list?styleId=${styleId}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      const patternBoms = list.filter((b: StyleBom) => Boolean(String(b.materialName || b.materialCode || '').trim()));
      setBomList(patternBoms);
      // 从已保存的 sizeUsageMap 和 lossRate 初始化编辑状态
      const initEdits: Record<string | number, Record<string, number | null>> = {};
      const initLoss: Record<string | number, number | null> = {};
      for (const b of patternBoms) {
        if (!b.id) continue;
        const parsed: Record<string, number | null> = {};
        const sourceMap = parseNumberMap(b.patternSizeUsageMap || b.sizeUsageMap);
        for (const [k, v] of Object.entries(sourceMap)) {
          parsed[k] = typeof v === 'number' ? v : null;
        }
        initEdits[b.id] = parsed;
        initLoss[b.id] = b.lossRate != null ? Number(b.lossRate) : 0;
      }
      setUsageEdits(initEdits);
      setLossEdits(initLoss);
    } catch {
      // ignore – BOM list optional for pattern tab
    } finally {
      setBomLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    fetchBomList();
  }, [fetchBomList]);

  const locked = useMemo(() => String(patternStatus || '').trim().toUpperCase() === 'COMPLETED', [patternStatus]);
  const childReadOnly = useMemo(() => Boolean(readOnly) || locked, [readOnly, locked]);

  // 当前有效的码数列表：优先用已选码数，兜底用常用码数
  const activeSizes = useMemo<string[]>(() => {
    if (sizeColorConfig?.sizes) {
      return sizeColorConfig.sizes.filter(Boolean);
    }
    if (sizeColorConfig?.commonSizes?.length) {
      return sizeColorConfig.commonSizes.filter(Boolean);
    }
    return [];
  }, [sizeColorConfig]);

  const allSizes = useMemo<string[]>(
    () => [...activeSizes, ...extraSizes.filter(s => !activeSizes.includes(s))],
    [activeSizes, extraSizes],
  );

  // 从已保存的 patternSizeUsageMap 中恢复 extraSizes，确保页面刷新后用户手动添加的尺码持久化
  // 用 styleId 作为 key，每次切换款式或首次加载只恢复一次，避免覆盖用户正在编辑的状态
  const extraSizesRestoredForRef = useRef<number | string | null>(null);
  useEffect(() => {
    if (!styleId || bomList.length === 0) return;
    if (extraSizesRestoredForRef.current === styleId) return;
    const savedKeys = new Set<string>();
    for (const b of bomList) {
      const m = parseNumberMap(b.patternSizeUsageMap || b.sizeUsageMap);
      Object.keys(m).forEach(k => savedKeys.add(k));
    }
    const restored = [...savedKeys].filter(s => !activeSizes.includes(s));
    setExtraSizes(restored);
    extraSizesRestoredForRef.current = styleId;
  }, [bomList, activeSizes, styleId]);

  const handleUsageChange = useCallback((bomId: string | number, size: string, val: number | null) => {
    setUsageEdits((prev) => ({
      ...prev,
      [bomId]: { ...(prev[bomId] ?? {}), [size]: val },
    }));
  }, []);

  const handleLossChange = useCallback((bomId: string | number, val: number | null) => {
    setLossEdits((prev) => ({ ...prev, [bomId]: val }));
  }, []);

  const handleAddSizes = useCallback((values: string[]) => {
    if (!values.length) return;
    setExtraSizes(prev => [...prev, ...values.filter(v => !prev.includes(v) && !activeSizes.includes(v))]);
  }, [activeSizes]);

  const fetchSizeDictOptions = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { records: any[] } | any[] }>('/system/dict/list', {
        params: { dictType: 'size', page: 1, pageSize: 200 },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const data = result.data as { records?: any[] } | any[];
        const records = Array.isArray(data) ? data : ((data as { records?: any[] })?.records || []);
        const options = (Array.isArray(records) ? records : [])
          .filter((item: any) => item.dictLabel)
          .map((item: any) => ({ value: item.dictLabel, label: item.dictLabel }));
        setSizeOptions(options);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSizeDictOptions();
  }, [fetchSizeDictOptions]);

  const patternRows = useMemo<PatternMaterialRow[]>(
    () => bomList.map((bom) => ({ id: `${bom.id}-usage`, bomId: String(bom.id || ''), bom })),
    [bomList],
  );

  const handleSaveUsage = useCallback(async () => {
    if (bomList.length === 0) return;
    setSavingUsage(true);
    try {
      const promises: Promise<unknown>[] = [];
      for (const bom of bomList) {
        if (!bom.id) continue;
        const edits = usageEdits[bom.id] ?? {};
        const conversionRate = Number(bom.conversionRate ?? 1) || 1;
        const mapObj: Record<string, number> = {};
        for (const [size, val] of Object.entries(edits)) {
          if (val !== null && val !== undefined && val > 0) {
            mapObj[size] = val;
          }
        }
        const rawMapJson = Object.keys(mapObj).length > 0 ? JSON.stringify(mapObj) : '';
        const newMapJson = rawMapJson;
        const currentMap = bom.sizeUsageMap ?? '';
        const currentRawMap = bom.patternSizeUsageMap ?? '';
        const newLoss = lossEdits[bom.id] ?? Number(bom.lossRate ?? 0);
        const lossChanged = Number(newLoss) !== Number(bom.lossRate ?? 0);
        const sizeVals = Object.values(mapObj).filter(v => v > 0);
        const avgUsage = sizeVals.length > 0
          ? Math.round((sizeVals.reduce((a, b) => a + b, 0) / sizeVals.length) * 100) / 100
          : null;
        const usageChanged = avgUsage !== null && Number(avgUsage) !== Number(bom.usageAmount ?? 0);
        if (newMapJson !== currentMap || rawMapJson !== currentRawMap || lossChanged || usageChanged) {
          promises.push(
            api.put('/style/bom', {
              ...bom,
              sizeUsageMap: newMapJson || null,
              patternSizeUsageMap: rawMapJson || null,
              patternUnit: resolvePatternUnit(bom) || null,
              conversionRate,
              lossRate: newLoss,
              ...(avgUsage !== null ? { usageAmount: avgUsage } : {}),
            })
          );
        }
      }
      if (promises.length === 0) {
        message.info('请先填写各码用量（或修改损耗率）后点击保存');
        return;
      }
      await Promise.all(promises);
      message.success('各码用量已保存');
      fetchBomList();
    } catch (e: unknown) {
      const errMsg = (e as any)?.response?.data?.message ?? (e as any)?.message ?? '保存失败';
      message.error(errMsg);
    } finally {
      setSavingUsage(false);
    }
  }, [bomList, usageEdits, lossEdits, message, fetchBomList]);

  return {
    patternFiles,
    setPatternFiles,
    patternCheckResult,
    bomList,
    bomLoading,
    usageEdits,
    lossEdits,
    savingUsage,
    setUsageEdits,
    setLossEdits,
    extraSizes,
    setExtraSizes,
    sizeOptions,
    setSizeOptions,
    sizeSearchTimerRef,
    locked,
    childReadOnly,
    activeSizes,
    allSizes,
    patternRows,
    handleUsageChange,
    handleLossChange,
    handleAddSizes,
    handleSaveUsage,
    fetchBomList,
  };
};

export default useStylePatternTabData;
