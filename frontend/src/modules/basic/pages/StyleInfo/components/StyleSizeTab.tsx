import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Dropdown, Input, Space, Select, Modal, Table, Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { StyleSize, TemplateLibrary } from '@/types/style';
import api, { sortSizeNames, toNumberSafe } from '@/utils/api';
import {
  MatrixCell, GradingZone, MatrixRow, DisplayRow,
  splitSizeNames, normalizeSizeList, resolveGroupName,
  resolveGroupToneMeta, normalizeRowSorts, normalizeChunkImageAssignments,
  createGradingZone, normalizeGradingZones, parseGradingRule, serializeGradingRule,
} from './styleSizeTabUtils';

import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';

import StyleStageControlBar from './StyleStageControlBar';
import StyleSizeGradingConfigModal from './styleSize/StyleSizeGradingConfigModal';
import { useStyleSizeColumns } from './useStyleSizeColumns';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
  linkedSizes?: string[];
  simpleView?: boolean; // 简化视图：隐藏领取人信息、操作按钮、提示信息
  hideStageControl?: boolean;
  onRefresh?: () => void;
}

const StyleSizeTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
  linkedSizes = [],
  simpleView = false,
  hideStageControl = false,
  onRefresh,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sizeColumns, setSizeColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const originalRef = useRef<StyleSize[]>([]);
  const combinedSizeIdsRef = useRef<Array<string | number>>([]);
  const snapshotRef = useRef<{ sizeColumns: string[]; rows: MatrixRow[] } | null>(null);

  const [addSizeOpen, setAddSizeOpen] = useState(false);
  const [gradingConfigOpen, setGradingConfigOpen] = useState(false);
  const [gradingTargetRowKey, setGradingTargetRowKey] = useState('');
  const [gradingDraftBaseSize, setGradingDraftBaseSize] = useState('');
  const [gradingDraftZones, setGradingDraftZones] = useState<GradingZone[]>([]);
  const [newSizeName, setNewSizeName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [sizeTemplateKey, setSizeTemplateKey] = useState<string | undefined>(undefined);
  const [sizeTemplates, setSizeTemplates] = useState<TemplateLibrary[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [sizeOptions, setSizeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const { message } = App.useApp();
  const linkedSizeColumns = useMemo(() => normalizeSizeList(linkedSizes), [linkedSizes]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    const sortedRows = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const sortDiff = toNumberSafe(a.row.sort) - toNumberSafe(b.row.sort);
        return sortDiff !== 0 ? sortDiff : a.index - b.index;
      })
      .map((item) => item.row);

    const groupOrder: string[] = [];
    const grouped = new Map<string, MatrixRow[]>();
    sortedRows.forEach((row) => {
      const groupName = resolveGroupName(row.groupName, row.partName);
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
        groupOrder.push(groupName);
      }
      grouped.get(groupName)!.push(row);
    });

    const flatRows: DisplayRow[] = [];
    groupOrder.forEach((groupName) => {
      const groupRows = grouped.get(groupName) || [];
      const groupToneMeta = resolveGroupToneMeta(groupName);
      const groupChunkImageUrls = Array.isArray(groupRows[0]?.imageUrls) ? groupRows[0].imageUrls : [];
      const groupRowKeys = groupRows.map((item) => item.key);
      groupRows.forEach((row, localIndex) => {
        flatRows.push({
          ...row,
          resolvedGroupName: groupName,
          groupToneMeta,
          isGroupStart: localIndex === 0,
          isGroupChunkStart: localIndex === 0,
          groupChunkSpan: localIndex === 0 ? groupRows.length : 0,
          isImageChunkStart: localIndex === 0,
          imageChunkSpan: localIndex === 0 ? groupRows.length : 0,
          chunkImageUrls: groupChunkImageUrls.slice(0, 2),
          chunkRowKeys: groupRowKeys,
        });
      });
    });

    return flatRows;
  }, [rows]);

  const groupNameOptions = useMemo(() => {
    const optionSet = new Set<string>(['上装区', '下装区', '其他区']);
    rows.forEach((row) => {
      const groupName = resolveGroupName(row.groupName, row.partName);
      if (groupName) {
        optionSet.add(groupName);
      }
    });
    return Array.from(optionSet).map((groupName) => ({ value: groupName, label: groupName }));
  }, [rows]);

  const fetchSizeTemplates = async (sourceStyleNo?: string) => {
    const sn = String(sourceStyleNo ?? '').trim();
    setTemplateLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: any[]; total: number } | any[] }>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 200,
          templateType: 'size',
          keyword: '',
          sourceStyleNo: sn,
        },
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

  useEffect(() => {
    fetchSizeTemplates('');
  }, []);


  // 获取数据
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
              key,
              groupName,
              partName,
              measureMethod,
              baseSize: String((items[0] as any)?.baseSize || gradingMeta.baseSize || ''),
              gradingZones: gradingMeta.gradingZones,
              tolerance,
              sort,
              cells,
              imageUrls,
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
    fetchSize();
  }, [styleId]);

  useEffect(() => {
    if (editMode || !linkedSizeColumns.length) return;
    setSizeColumns((prev) => {
      // 合并：已有尺码保留，新增关联尺码追加，避免异步加载覆盖已存库数据
      const next = normalizeSizeList([...prev, ...linkedSizeColumns]);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    setRows((prev) => normalizeChunkImageAssignments(prev.map((row) => {
      const nextCells: Record<string, MatrixCell> = { ...row.cells };
      // 仅为新增的关联尺码补空格，已有尺码的数据保持不变
      linkedSizeColumns.forEach((sizeName) => {
        if (!nextCells[sizeName]) {
          nextCells[sizeName] = { value: 0 };
        }
      });
      return {
        ...row,
        cells: nextCells,
      };
    })));
  }, [editMode, linkedSizeColumns]);

  useEffect(() => {
    if (!readOnly) return;
    setEditMode(false);
    setDeletedIds([]);
    snapshotRef.current = null;
  }, [readOnly]);

  const enterEdit = () => {
    if (readOnly) return;
    snapshotRef.current = {
      sizeColumns: [...sizeColumns],
      rows: JSON.parse(JSON.stringify(rows)) as MatrixRow[],
    };
    setEditMode(true);
  };

  const exitEdit = () => {
    const snap = snapshotRef.current;
    if (snap) {
      setSizeColumns(snap.sizeColumns);
      setRows(snap.rows);
      setDeletedIds([]);
    }
    setEditMode(false);
    snapshotRef.current = null;
  };

  const updatePartName = (rowKey: string, partName: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, partName } : r)));
  };

  const updateChunkGroupName = (chunkRowKeys: string[], groupName: string) => {
    const normalizedGroupName = String(groupName || '').trim() || '其他区';
    if (!chunkRowKeys.length) return;

    const rowKeySet = new Set(chunkRowKeys);
    setRows((prev) => {
      let changed = false;
      const nextRows = prev.map((row) => {
        if (!rowKeySet.has(row.key)) return row;

        const currentResolvedGroup = resolveGroupName(row.groupName, row.partName);
        if (currentResolvedGroup === normalizedGroupName && String(row.groupName || '').trim() === normalizedGroupName) {
          return row;
        }

        changed = true;
        return {
          ...row,
          groupName: normalizedGroupName,
        };
      });

      return changed ? normalizeRowSorts(nextRows) : prev;
    });
  };

  const updateMeasureMethod = (rowKey: string, measureMethod: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, measureMethod } : r)));
  };

  const updateTolerance = (rowKey: string, tolerance: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, tolerance } : r)));
  };

  const applyGradingToRow = (row: MatrixRow) => {
    if (!sizeColumns.length) return row;
    const baseSize = sizeColumns.includes(String(row.baseSize || '').trim())
      ? String(row.baseSize).trim()
      : '';
    const baseIndex = sizeColumns.indexOf(baseSize);
    if (baseIndex < 0) return { ...row, baseSize };
    const zones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
    if (!zones.length) {
      return { ...row, baseSize, gradingZones: [] };
    }
    const baseValue = toNumberSafe(row.cells[baseSize]?.value);
    const getStepForSize = (sizeName: string): number => {
      for (const zone of zones) {
        if ((zone.frontSizes || []).includes(sizeName)) {
          return toNumberSafe(zone.frontStep);
        }
        if ((zone.backSizes || []).includes(sizeName)) {
          return toNumberSafe(zone.backStep);
        }
        for (const col of zone.sizeStepColumns || []) {
          if ((col.sizes || []).includes(sizeName)) {
            return toNumberSafe(col.step);
          }
        }
      }
      return 0;
    };
    const nextCells = { ...row.cells };
    nextCells[baseSize] = { ...(nextCells[baseSize] || { value: 0 }), value: baseValue };
    for (let index = 0; index < sizeColumns.length; index += 1) {
      if (index === baseIndex) continue;
      const currentSize = sizeColumns[index];
      const step = getStepForSize(currentSize);
      const distance = Math.abs(index - baseIndex);
      let value: number;
      if (index < baseIndex) {
        value = baseValue - step * distance;
      } else {
        value = baseValue + step * distance;
      }
      nextCells[currentSize] = {
        ...(nextCells[currentSize] || { value: 0 }),
        value: Number(value.toFixed(2)),
      };
    }
    return { ...row, baseSize, gradingZones: zones, cells: nextCells };
  };

  const updateBaseSize = (rowKey: string, baseSize: string) => {
    setRows((prev) => prev.map((row) => (
      row.key === rowKey ? applyGradingToRow({ ...row, baseSize: String(baseSize || '').trim() }) : row
    )));
  };

  const openGradingConfig = (row: MatrixRow) => {
    setGradingTargetRowKey(row.key);
    const baseSize = row.baseSize || '';
    setGradingDraftBaseSize(baseSize);
    const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
    const defaultFrontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
    const defaultBackSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
    const existingZones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
    if (existingZones.length > 0) {
      setGradingDraftZones(existingZones.map((z) => ({
        ...z,
        frontSizes: (z.frontSizes || []).length > 0 ? z.frontSizes : defaultFrontSizes,
        backSizes: (z.backSizes || []).length > 0 ? z.backSizes : defaultBackSizes,
        partKeys: [row.key],
      })));
    } else {
      setGradingDraftZones([
        createGradingZone([], '1', [row.key], defaultFrontSizes, defaultBackSizes),
      ]);
    }
    setGradingConfigOpen(true);
  };

  const openBatchGradingConfig = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要配置的部位');
      return;
    }
    setGradingTargetRowKey('batch');
    const firstSelectedRow = rows.find((r) => selectedRowKeys.includes(r.key));
    const baseSize = firstSelectedRow?.baseSize || '';
    setGradingDraftBaseSize(baseSize);
    const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
    const frontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
    const backSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
    setGradingDraftZones([
      createGradingZone([], '1', selectedRowKeys.map(String), frontSizes, backSizes),
    ]);
    setGradingConfigOpen(true);
  };

  const applyGradingDraft = () => {
    const targetKey = gradingTargetRowKey;
    if (!targetKey) return;
    if (!gradingDraftBaseSize || !sizeColumns.includes(gradingDraftBaseSize)) {
      message.error('请先选择样版码');
      return;
    }
    if (targetKey === 'batch') {
      setRows((prev) => prev.map((row) => {
        const matchingZones = gradingDraftZones.filter((zone) => (zone.partKeys || []).includes(row.key));
        if (matchingZones.length === 0) return row;
        return applyGradingToRow({
          ...row,
          baseSize: gradingDraftBaseSize,
          gradingZones: matchingZones.map((z) => ({
            key: z.key,
            label: z.label,
            sizes: z.sizes || [],
            step: z.step || 0,
            frontSizes: z.frontSizes || [],
            frontStep: z.frontStep || 0,
            backSizes: z.backSizes || [],
            backStep: z.backStep || 0,
            sizeStepColumns: z.sizeStepColumns || [],
          })),
        });
      }));
      setSelectedRowKeys([]);
    } else {
      setRows((prev) => prev.map((row) => (
        row.key === targetKey
          ? applyGradingToRow({
              ...row,
              baseSize: gradingDraftBaseSize,
              gradingZones: normalizeGradingZones(gradingDraftZones, sizeColumns),
            })
          : row
      )));
    }
    setGradingConfigOpen(false);
    setGradingTargetRowKey('');
  };

  const updateCellValue = (rowKey: string, sizeName: string, value: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? {
            ...r,
            cells: {
              ...r.cells,
              [sizeName]: { ...(r.cells[sizeName] || { value: 0 }), value: toNumberSafe(value) },
            },
          }
          : r,
      ),
    );
  };

  const setChunkImageUrls = (chunkRowKeys: string[], nextImages: string[]) => {
    const ownerRowKey = String(chunkRowKeys[0] || '');
    const rowKeySet = new Set(chunkRowKeys);
    const sanitized = nextImages.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2);
    setRows((prev) =>
      prev.map((row) => {
        if (!rowKeySet.has(row.key)) return row;
        return {
          ...row,
          imageUrls: String(row.key) === ownerRowKey && sanitized.length ? sanitized : undefined,
        };
      }),
    );
  };

  const handleAddPartInGroup = (groupName: string) => {
    if (readOnly) return;
    const key = `tmp-part-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => {
      cells[sn] = { value: 0 };
    });
    setRows((prev) => {
      const groupRowIndices: number[] = [];
      prev.forEach((r, i) => {
        if (resolveGroupName(r.groupName, r.partName) === groupName) groupRowIndices.push(i);
      });
      const insertAt = groupRowIndices.length ? groupRowIndices[groupRowIndices.length - 1] + 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, {
        key,
        groupName,
        partName: '',
        measureMethod: '',
        baseSize: '',
        gradingZones: [],
        tolerance: '',
        sort: 0,
        cells,
      });
      return normalizeRowSorts(next);
    });
    if (!editMode) enterEdit();
  };

  const confirmAddGroup = () => {
    if (readOnly) return;
    const groupName = String(newGroupName || '').trim();
    if (!groupName) {
      message.error('请输入分组名称');
      return;
    }

    const key = `tmp-group-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => {
      cells[sn] = { value: 0 };
    });

    setRows((prev) => normalizeRowSorts([
      ...prev,
      {
        key,
        groupName,
        partName: '',
        measureMethod: '',
        baseSize: '',
        gradingZones: [],
        tolerance: '',
        sort: prev.length ? Math.max(...prev.map((r) => toNumberSafe(r.sort))) + 1 : 1,
        cells,
      },
    ]));
    setNewGroupName('');
    if (!editMode) enterEdit();
  };

  const confirmAddSize = () => {
    if (readOnly) return;
    const raw = String(newSizeName || '').trim();
    if (!raw) {
      message.error('请输入尺码');
      return;
    }

    const parts = raw
      .split(/[\n,，、;；]+/g)
      .map((x) => String(x || '').trim())
      .filter(Boolean);

    if (!parts.length) {
      message.error('请输入尺码');
      return;
    }

    const nextToAdd: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      if (sizeColumns.includes(p)) {
        message.error(`尺码已存在：${p}`);
        return;
      }
      if (seen.has(p)) {
        continue;
      }
      seen.add(p);
      nextToAdd.push(p);
    }

    if (!nextToAdd.length) {
      message.error('请输入尺码');
      return;
    }

    const merged = sortSizeNames([...sizeColumns, ...nextToAdd]);
    setSizeColumns(merged);
    setRows((prev) =>
      prev.map((r) => {
        const nextCells = { ...r.cells };
        nextToAdd.forEach((sn) => {
          nextCells[sn] = { value: 0 };
        });
        return {
          ...r,
          baseSize: merged.includes(r.baseSize) ? r.baseSize : '',
          gradingZones: normalizeGradingZones(r.gradingZones || [], merged),
          cells: nextCells,
        };
      }),
    );
    setAddSizeOpen(false);
    setNewSizeName('');
    if (!editMode) enterEdit();
  };

  const applySizeTemplate = async (templateId: string, mode: 'merge' | 'overwrite' = 'overwrite') => {
    if (readOnly) return;
    if (editMode) {
      message.error('请先保存或退出编辑再导入模板');
      return;
    }
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('styleId不合法');
      return;
    }
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', {
        templateId,
        targetStyleId: sid,
        mode,
      });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message as any || '导入失败');
        return;
      }
      message.success(mode === 'merge' ? '已追加导入尺寸模板' : '已覆盖导入尺寸模板');
      setSizeTemplateKey(undefined);
      await fetchSize();
      setEditMode(true);
    } catch (e: unknown) {
      message.error((e as any)?.message || '导入失败');
    }
  };

  const handleDeletePart = (row: MatrixRow) => {
    if (readOnly) return;
    const ids = Object.values(row.cells)
      .map((c) => c.id)
      .filter((id): id is string | number => id != null && String(id).trim() !== '');
    setDeletedIds((prev) => [...prev, ...ids]);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  const handleDeleteSize = (sizeName: string) => {
    if (readOnly) return;
    const ids: Array<string | number> = [];
    rows.forEach((r) => {
      const id = r.cells[sizeName]?.id;
      if (id != null && String(id).trim() !== '') ids.push(id);
    });
    setDeletedIds((prev) => [...prev, ...ids]);
    setSizeColumns((prev) => prev.filter((s) => s !== sizeName));
    setRows((prev) =>
      prev.map((r) => {
        const nextCells = { ...r.cells };
        delete nextCells[sizeName];
        const nextSizes = sizeColumns.filter((s) => s !== sizeName);
        return {
          ...r,
          baseSize: nextSizes.includes(r.baseSize) ? r.baseSize : '',
          gradingZones: normalizeGradingZones(r.gradingZones || [], nextSizes),
          cells: nextCells,
        };
      }),
    );
  };

  const saveAll = async () => {
    if (readOnly) return;
    const normalizedRows = normalizeChunkImageAssignments(rows);
    const invalid = normalizedRows.some((r) => !String(r.partName || '').trim());
    if (invalid) {
      message.error('请先填写部位');
      return;
    }
    if (!sizeColumns.length) {
      message.error('请先添加尺码');
      return;
    }

    const originals = originalRef.current;
    const originalById = new Map<string, StyleSize>();
    originals.forEach((o) => {
      if (o.id != null) originalById.set(String(o.id), o);
    });
    const obsoleteOriginalIds = originals
      .filter((item) => item.id != null && !sizeColumns.includes(String(item.sizeName || '').trim()))
      .map((item) => String(item.id));

    setSaving(true);
    try {
      const combinedIds = combinedSizeIdsRef.current || [];
      const deleteTasks = Array.from(
        new Set([
          ...deletedIds.map((x) => String(x)),
          ...combinedIds.map((x) => String(x)),
          ...obsoleteOriginalIds,
        ].filter(Boolean)),
      ).map((id) => api.delete(`/style/size/${id}`));
      if (deleteTasks.length) {
        await Promise.all(deleteTasks);
      }

      const tasks: Array<Promise<any>> = [];
      normalizedRows.forEach((r) => {
        const groupName = resolveGroupName(r.groupName, r.partName);
        const imageUrlsJson = r.imageUrls && r.imageUrls.length > 0 ? JSON.stringify(r.imageUrls.slice(0, 2)) : null;
        const gradingRule = serializeGradingRule(r, sizeColumns);
        sizeColumns.forEach((sn) => {
          const cell = r.cells[sn];
          const id = cell?.id;
          const payload: any = {
            id: id != null ? id : undefined,
            styleId,
            sizeName: sn,
            partName: r.partName,
            groupName,
            measureMethod: r.measureMethod,
            baseSize: r.baseSize || '',
            standardValue: toNumberSafe(cell?.value),
            tolerance: r.tolerance,
            sort: toNumberSafe(r.sort),
            imageUrls: imageUrlsJson,
            gradingRule,
          };

          if (id != null && String(id).trim() !== '') {
            const old = originalById.get(String(id));
            const changed =
              !old ||
              String(old.sizeName || '').trim() !== sn ||
              String(old.partName || '').trim() !== String(r.partName || '').trim() ||
              String((old as Record<string, unknown>).groupName || '').trim() !== String(payload.groupName || '').trim() ||
              String((old as Record<string, unknown>).measureMethod || '').trim() !== String(r.measureMethod || '').trim() ||
              String((old as Record<string, unknown>).baseSize || '').trim() !== String(payload.baseSize || '').trim() ||
              toNumberSafe(old.standardValue) !== toNumberSafe(payload.standardValue) ||
              String(old.tolerance ?? '') !== String(payload.tolerance ?? '') ||
              toNumberSafe((old as Record<string, unknown>).sort) !== toNumberSafe(payload.sort) ||
              String((old as Record<string, unknown>).imageUrls || '') !== String(payload.imageUrls || '') ||
              String((old as Record<string, unknown>).gradingRule || '') !== String(payload.gradingRule || '');
            if (changed) {
              tasks.push(api.put('/style/size', payload));
            }
          } else {
            const createPayload = { ...payload };
            delete createPayload.id;
            tasks.push(api.post('/style/size', createPayload));
          }
        });
      });

      if (tasks.length) {
        const results = await Promise.all(tasks);
        const bad = results.find((r: Record<string, unknown>) => (r as any)?.code !== 200);
        if (bad) {
          message.error((bad as any)?.message || '保存失败');
          return;
        }
      }

      message.success('保存成功');
      setRows(normalizedRows);
      setEditMode(false);
      snapshotRef.current = null;
      await fetchSize();
    } catch (e: unknown) {
      message.error((e as any)?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = useStyleSizeColumns({
    editMode, readOnly, sizeColumns, displayRows, groupNameOptions, rows, message,
    updatePartName, updateChunkGroupName, updateMeasureMethod, updateTolerance, updateBaseSize,
    updateCellValue, setChunkImageUrls, handleAddPartInGroup, handleDeletePart, handleDeleteSize,
    openGradingConfig,
  });

  return (
    <div>
      <style>{`
        .style-size-table .ant-table-tbody > tr > td {
          vertical-align: top;
        }

        .style-size-table .ant-table-tbody > tr.style-size-group-start > td {
          border-top: 12px solid #f5f7fa;
        }

        .style-size-table .ant-table-tbody > tr.style-size-group-start > td {
          box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.03);
        }

        .style-size-table .ant-table-tbody > tr.style-size-group-upper > td {
          background: #f7fbff;
        }

        .style-size-table .ant-table-tbody > tr.style-size-group-lower > td {
          background: #fffaf2;
        }
      `}</style>
      {/* 统一状态控制栏 */}
      {!simpleView && !hideStageControl && (
        <StyleStageControlBar
          stageName="尺寸表"
          styleId={styleId}
          apiPath="size"
          status={sizeCompletedTime ? 'COMPLETED' : sizeStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
          assignee={sizeAssignee}
          startTime={sizeStartTime}
          completedTime={sizeCompletedTime}
          readOnly={readOnly}
          onRefresh={onRefresh}
          onBeforeComplete={async () => {
            if (!sizeColumns.length || !rows.length) {
              message.error('请先配置尺寸数据');
              return false;
            }
            return true;
          }}
        />
      )}
      {!simpleView && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {editMode && !readOnly && selectedRowKeys.length > 0 && (
              <Button type="primary" onClick={openBatchGradingConfig}>
                批量配置跳码区 ({selectedRowKeys.length})
              </Button>
            )}
            {editMode && !readOnly && selectedRowKeys.length > 0 && (
              <Button onClick={() => setSelectedRowKeys([])}>
                取消选择
              </Button>
            )}
          </div>
          <Space>
          {!editMode || readOnly ? (
            <Button type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly)}>
              编辑
            </Button>
          ) : (
            <>
              <Button type="primary" onClick={saveAll} loading={saving}>
                保存
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  Modal.confirm({
                    width: '30vw',
                    title: '放弃未保存的修改？',
                    onOk: exitEdit,
                  });
                }}
              >
                取消
              </Button>
            </>
          )}
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="导入尺寸模板"
            value={sizeTemplateKey}
            onChange={(v) => setSizeTemplateKey(v)}
            options={sizeTemplates.map((t) => ({
              value: String(t.id || ''),
              label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName,
            }))}
            disabled={loading || saving || Boolean(readOnly) || templateLoading}
          />
          <Dropdown
            disabled={loading || saving || Boolean(readOnly) || templateLoading}
            menu={{
              items: [
                { key: 'overwrite', label: '覆盖导入（清除现有数据）' },
                { key: 'merge', label: '追加导入（保留现有数据）' },
              ],
              onClick: ({ key }) => {
                if (!sizeTemplateKey) { message.error('请选择模板'); return; }
                void applySizeTemplate(sizeTemplateKey, key as 'merge' | 'overwrite');
              },
            }}
          >
            <Button disabled={loading || saving || Boolean(readOnly) || templateLoading}>
              导入模板 <DownOutlined />
            </Button>
          </Dropdown>
          <Popover
            trigger="click"
            placement="bottom"
            content={
              <Space.Compact style={{ width: 220 }}>
                <Input
                  placeholder="如：上装区 / 下装区"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onPressEnter={() => {
                    confirmAddGroup();
                  }}
                  style={{ width: 160 }}
                />
                <Button type="primary" onClick={confirmAddGroup}>
                  确定
                </Button>
              </Space.Compact>
            }
          >
            <Button disabled={loading || saving || Boolean(readOnly)}>
              新增分组
            </Button>
          </Popover>
          <Select
            mode="multiple"
            allowClear
            showSearch
            placeholder="新增尺码(多选)"
            style={{ minWidth: 160 }}
            disabled={loading || saving || Boolean(readOnly)}
            options={sizeOptions.filter(opt => !sizeColumns.includes(opt.value))}
            value={[]}
            onChange={(values) => {
              if (values.length === 0) return;
              const merged = sortSizeNames([...sizeColumns, ...values]);
              setSizeColumns(merged);
              setRows((prev) =>
                prev.map((r) => {
                  const nextCells = { ...r.cells };
                  values.forEach((sn) => {
                    nextCells[sn] = { value: 0 };
                  });
                  return {
                    ...r,
                    baseSize: merged.includes(r.baseSize) ? r.baseSize : '',
                    gradingZones: normalizeGradingZones(r.gradingZones || [], merged),
                    cells: nextCells,
                  };
                }),
              );
              if (!editMode) enterEdit();
            }}
            filterOption={(input, option) =>
              String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
          }
          onSearch={(value) => {
            if (value && value.trim() && !sizeOptions.some(opt => opt.value === value.trim()) && !sizeColumns.includes(value.trim())) {
              setSizeOptions(prev => [...prev, { value: value.trim(), label: value.trim() }]);
            }
          }}
          popupRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                <Input
                  placeholder="输入新码数后回车添加"
                  size="small"
                  onPressEnter={(e) => {
                    const input = e.target as HTMLInputElement;
                    const val = input.value.trim();
                    if (val && !sizeColumns.includes(val) && !sizeOptions.some(opt => opt.value === val)) {
                      const merged = sortSizeNames([...sizeColumns, val]);
                      setSizeColumns(merged);
                      setRows((prev) =>
                        prev.map((r) => {
                          const nextCells = { ...r.cells };
                          nextCells[val] = { value: 0 };
                          return {
                            ...r,
                            baseSize: merged.includes(r.baseSize) ? r.baseSize : '',
                            gradingZones: normalizeGradingZones(r.gradingZones || [], merged),
                            cells: nextCells,
                          };
                        }),
                      );
                      if (!editMode) enterEdit();
                      input.value = '';
                    }
                  }}
                />
              </div>
            </>
          )}
          onOpenChange={(open) => {
            if (open) fetchSizeDictOptions();
          }}
        />
        </Space>
      </div>
      )}

      <ResizableTable
        className="style-size-table"
        bordered
        dataSource={displayRows}
        columns={columns as any}
        pagination={false}
        loading={loading}
        rowKey="key"
        resizableColumns={false}
        rowClassName={(_record, rowIndex) => {
          const row = displayRows[rowIndex];
          if (!row) return '';
          const classes = [`style-size-group-${row.groupToneMeta.key}`];
          if (row.isGroupStart) {
            classes.push('style-size-group-start');
          }
          return classes.join(' ');
        }}
        rowSelection={
          editMode && !readOnly
            ? {
                selectedRowKeys,
                onChange: (newSelectedRowKeys: React.Key[]) => {
                  setSelectedRowKeys(newSelectedRowKeys);
                },
                selections: [
                  Table.SELECTION_ALL,
                  Table.SELECTION_INVERT,
                  Table.SELECTION_NONE,
                ],
              }
            : undefined
        }
      />

      <ResizableModal
        open={addSizeOpen}
        title="新增尺码(多码)"
        onCancel={() => {
          setAddSizeOpen(false);
          setNewSizeName('');
        }}
        onOk={confirmAddSize}
        okText="确定"
        cancelText="取消"
        confirmLoading={saving}
        width="30vw"
        minWidth={360}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.4 : 320}
        minHeight={220}
        autoFontSize={false}
        scaleWithViewport
      >
        <Input.TextArea
          value={newSizeName}
          placeholder="每行一个，或用逗号分隔：\nS\nM\n3-6M"
          rows={4}
          onChange={(e) => setNewSizeName(e.target.value)}
        />
      </ResizableModal>

      <StyleSizeGradingConfigModal
        open={gradingConfigOpen}
        gradingTargetRowKey={gradingTargetRowKey}
        selectedRowCount={selectedRowKeys.length}
        sizeColumns={sizeColumns}
        rows={rows}
        gradingDraftBaseSize={gradingDraftBaseSize}
        gradingDraftZones={gradingDraftZones}
        setGradingDraftBaseSize={setGradingDraftBaseSize}
        setGradingDraftZones={setGradingDraftZones}
        onCancel={() => {
          setGradingConfigOpen(false);
          setGradingTargetRowKey('');
        }}
        onSubmit={applyGradingDraft}
      />
    </div>
  );
};

export default StyleSizeTab;
