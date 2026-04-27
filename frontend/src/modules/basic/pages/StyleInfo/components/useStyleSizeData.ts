import { useState, useEffect, useMemo, useRef } from 'react';
import { App } from 'antd';
import { StyleSize, TemplateLibrary } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import {
  MatrixCell, MatrixRow,
  splitSizeNames, normalizeSizeList, resolveGroupName,
  normalizeChunkImageAssignments,
  parseGradingRule,
} from './styleSize/shared';

export const useStyleSizeData = (
  styleId: string | number,
  linkedSizes: string[],
) => {
  const [loading, setLoading] = useState(false);
  const [sizeColumns, setSizeColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [sizeTemplates, setSizeTemplates] = useState<TemplateLibrary[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [sizeOptions, setSizeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const originalRef = useRef<StyleSize[]>([]);
  const combinedSizeIdsRef = useRef<Array<string | number>>([]);

  const { message } = App.useApp();
  const linkedSizeColumns = useMemo(() => normalizeSizeList(linkedSizes), [linkedSizes]);

  const fetchSizeTemplates = async (sourceStyleNo?: string) => {
    const sn = String(sourceStyleNo ?? '').trim();
    setTemplateLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: any[]; total: number } | any[] }>('/template-library/list', {
        params: { page: 1, pageSize: 200, templateType: 'size', keyword: '', sourceStyleNo: sn },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const data = result.data as { records?: any[] } | any[];
        const records = Array.isArray(data) ? data : ((data as { records?: any[] })?.records || []);
        setSizeTemplates(Array.isArray(records) ? records as TemplateLibrary[] : []);
        return;
      }
    } catch {
    } finally {
      setTemplateLoading(false);
    }
    try {
      const res = await api.get<{ code: number; data: any[] }>('/template-library/type/size');
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setSizeTemplates(Array.isArray(result.data) ? result.data : []);
      }
    } catch {
    }
  };

  const fetchSizeDictOptions = async () => {
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
    }
  };

  const fetchSize = async () => {
    setLoading(true);
    try {
      const res = await api.get<StyleSize[]>(`/style/size/list?styleId=${styleId}`);
      const result = res as any;
      if (result.code === 200) {
        const rawList: StyleSize[] = result.data || [];
        const combinedIds: Array<string | number> = [];
        const normalizedList: StyleSize[] = [];
        rawList.forEach((it) => {
          const parts = splitSizeNames((it as any)?.sizeName as string);
          if (parts.length > 1 && it?.id != null && String(it.id).trim() !== '') {
            combinedIds.push(it.id);
          }
          const atomic = parts.length ? parts : [];
          atomic.forEach((sn) => {
            const next: any = { ...it, sizeName: sn };
            if (parts.length > 1) {
              delete next.id;
            }
            normalizedList.push(next as StyleSize);
          });
        });

        combinedSizeIdsRef.current = Array.from(new Set(combinedIds.map((x) => (typeof x === 'string' ? x : x))));
        originalRef.current = normalizedList;

        const sizesFromRows = normalizeSizeList(
          normalizedList
            .flatMap((x) => splitSizeNames((x as any)?.sizeName as string))
            .map((x) => String(x || '').trim())
            .filter(Boolean),
        );
        const sizes = linkedSizeColumns.length
          ? normalizeSizeList([...linkedSizeColumns, ...sizesFromRows])
          : sizesFromRows;

        const byPart = new Map<string, StyleSize[]>();
        normalizedList.forEach((it) => {
          const part = String(it.partName || '').trim();
          const groupName = resolveGroupName((it as any)?.groupName as string, part);
          const mapKey = `${groupName}::${part}`;
          if (!byPart.has(mapKey)) byPart.set(mapKey, []);
          byPart.get(mapKey)!.push(it);
        });

        const nextRows: MatrixRow[] = Array.from(byPart.entries())
          .map(([mapKey, items]) => {
            const partName = String(items[0]?.partName || '').trim();
            const groupName = resolveGroupName((items[0] as any)?.groupName as string, partName);
            const key = items.map((x) => String(x.id || '')).filter(Boolean)[0] || mapKey || `tmp-${Date.now()}-${Math.random()}`;
            const measureMethod = items.length ? String((items[0] as Record<string, unknown>).measureMethod || '') : '';
            const gradingMeta = parseGradingRule((items[0] as any)?.gradingRule, sizes);
            const tolerance = items.length ? String((items[0] as Record<string, unknown>).tolerance ?? '') : '';
            const sort = Math.min(...items.map((x) => toNumberSafe((x as Record<string, unknown>).sort)), 0);
            const cells: Record<string, MatrixCell> = {};
            sizes.forEach((sn) => {
              const cell = items.find((x) => String(x.sizeName || '').trim() === sn);
              cells[sn] = {
                id: cell?.id,
                value: cell?.standardValue != null ? toNumberSafe(cell.standardValue) : 0,
              };
            });
            const rawImageUrls = (items[0] as any)?.imageUrls;
            let imageUrls: string[] | undefined;
            try { imageUrls = rawImageUrls ? JSON.parse(rawImageUrls) : undefined; } catch { imageUrls = undefined; }
            return {
              key, groupName, partName, measureMethod,
              baseSize: String((items[0] as any)?.baseSize || gradingMeta.baseSize || ''),
              gradingZones: gradingMeta.gradingZones,
              tolerance, sort, cells, imageUrls,
            };
          })
          .sort((a, b) => (toNumberSafe(a.sort) || 0) - (toNumberSafe(b.sort) || 0));

        setSizeColumns(sizes);
        setRows(normalizeChunkImageAssignments(nextRows));
        setDeletedIds([]);
      }
    } catch (error) {
      message.error('获取尺寸表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSizeTemplates('');
  }, []);

  useEffect(() => {
    fetchSize();
  }, [styleId]);

  return {
    loading, sizeColumns, rows, sizeTemplates, templateLoading, sizeOptions, setSizeOptions,
    deletedIds, setDeletedIds, originalRef, combinedSizeIdsRef,
    linkedSizeColumns, setSizeColumns, setRows,
    fetchSize, fetchSizeTemplates, fetchSizeDictOptions,
  };
};
