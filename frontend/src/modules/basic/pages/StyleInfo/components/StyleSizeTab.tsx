import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Select, Modal, Upload, Image, Table } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { StyleSize, TemplateLibrary } from '@/types/style';
import api, { sortSizeNames, toNumberSafe } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import StyleStageControlBar from './StyleStageControlBar';
import StyleSizeToolbar from './styleSize/StyleSizeToolbar';
import StyleSizeGradingConfigModal from './styleSize/StyleSizeGradingConfigModal';
import {
  DisplayRow,
  GradingZone,
  MatrixCell,
  MatrixRow,
  buildEmptySizeCells,
  createGradingZone,
  normalizeChunkImageAssignments,
  normalizeGradingZones,
  normalizeRowSorts,
  normalizeSizeList,
  parseGradingRule,
  resolveGroupName,
  resolveGroupToneMeta,
  serializeGradingRule,
  splitSizeNames,
} from './styleSize/shared';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
  linkedSizes?: string[];
  simpleView?: boolean; // 简化视图：隐藏领取人信息、操作按钮、提示信息
  hideStageControl?: boolean; // 仅隐藏阶段控制栏（嵌入其他 Tab 时使用，编辑按钮仍保留）
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

  const [gradingConfigOpen, setGradingConfigOpen] = useState(false);
  const [gradingTargetRowKey, setGradingTargetRowKey] = useState('');
  const [gradingDraftBaseSize, setGradingDraftBaseSize] = useState('');
  const [gradingDraftZones, setGradingDraftZones] = useState<GradingZone[]>([]);
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
            const tolerance = items.length ? toNumberSafe((items[0] as Record<string, unknown>).tolerance) : 0;
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
      const next = normalizeSizeList(linkedSizeColumns);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    setRows((prev) => normalizeChunkImageAssignments(prev.map((row) => {
      const nextCells: Record<string, MatrixCell> = {};
      linkedSizeColumns.forEach((sizeName) => {
        const matched = row.cells[sizeName];
        nextCells[sizeName] = matched
          ? { ...matched, value: toNumberSafe(matched.value) }
          : { value: 0 };
      });
      return {
        ...row,
        baseSize: linkedSizeColumns.includes(String(row.baseSize || '').trim()) ? String(row.baseSize || '').trim() : '',
        gradingZones: normalizeGradingZones(row.gradingZones || [], linkedSizeColumns),
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

  const updateTolerance = (rowKey: string, tolerance: number) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, tolerance: toNumberSafe(tolerance) } : r)));
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
    const normalizedZones = gradingDraftZones.map((z) => ({
      key: z.key,
      label: z.label,
      sizes: z.sizes || [],
      step: z.step || 0,
      frontSizes: (z.frontSizes || []),
      frontStep: z.frontStep || 0,
      backSizes: (z.backSizes || []),
      backStep: z.backStep || 0,
      partKeys: z.partKeys || [],
    }));
    if (targetKey === 'batch') {
      setRows((prev) => prev.map((row) => {
        const matchingZones = normalizedZones.filter((zone) => (zone.partKeys || []).includes(row.key));
        if (matchingZones.length === 0) return row;
        return applyGradingToRow({
          ...row,
          baseSize: gradingDraftBaseSize,
          gradingZones: matchingZones,
        });
      }));
      setSelectedRowKeys([]);
    } else {
      setRows((prev) => prev.map((row) => (
        row.key === targetKey
          ? applyGradingToRow({
              ...row,
              baseSize: gradingDraftBaseSize,
              gradingZones: normalizedZones,
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
    const cells = buildEmptySizeCells(sizeColumns);
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
        tolerance: 0,
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
    const cells = buildEmptySizeCells(sizeColumns);

    setRows((prev) => normalizeRowSorts([
      ...prev,
      {
        key,
        groupName,
        partName: '',
        measureMethod: '',
        baseSize: '',
        gradingZones: [],
        tolerance: 0,
        sort: prev.length ? Math.max(...prev.map((r) => toNumberSafe(r.sort))) + 1 : 1,
        cells,
      },
    ]));
    setNewGroupName('');
    if (!editMode) enterEdit();
  };

  const appendSizes = (inputSizes: string[]) => {
    if (readOnly) return false;

    const nextToAdd = Array.from(
      new Set(
        inputSizes
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    );

    if (!nextToAdd.length) {
      message.error('请输入尺码');
      return false;
    }

    const duplicated = nextToAdd.find((sizeName) => sizeColumns.includes(sizeName));
    if (duplicated) {
      message.error(`尺码已存在：${duplicated}`);
      return false;
    }

    const merged = sortSizeNames([...sizeColumns, ...nextToAdd]);
    setSizeColumns(merged);
    setRows((prev) =>
      prev.map((row) => {
        const nextCells = { ...row.cells };
        nextToAdd.forEach((sizeName) => {
          nextCells[sizeName] = { value: 0 };
        });
        return {
          ...row,
          baseSize: merged.includes(row.baseSize) ? row.baseSize : '',
          gradingZones: normalizeGradingZones(row.gradingZones || [], merged),
          cells: nextCells,
        };
      }),
    );

    if (!editMode) enterEdit();
    return true;
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
            tolerance: toNumberSafe(r.tolerance),
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
              toNumberSafe(old.tolerance) !== toNumberSafe(payload.tolerance) ||
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

  const columns = useMemo(() => {
    const editableMode = editMode && !readOnly;
    const left = [
      {
        title: '参考图',
        key: 'groupImage',
        dataIndex: '__groupImage',
        width: 100,
        onCell: (record: DisplayRow) => {
          return {
            rowSpan: record.isImageChunkStart ? record.imageChunkSpan : 0,
            style: { verticalAlign: 'top' as const },
          };
        },
        render: (_: any, record: DisplayRow) => {
          if (!record.isImageChunkStart) return null;
          const imgs = record.chunkImageUrls || [];
          const blockHeight = imgs.length > 1 ? 108 : 220;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', justifyContent: 'flex-start', width: '100%', minHeight: 240, padding: '8px 0' }}>
              <Image.PreviewGroup>
                {imgs.map((url, i) => (
                  <div key={url} style={{ position: 'relative', width: '100%' }}>
                    <Image
                      src={getFullAuthedFileUrl(url)}
                      width="100%"
                      height={blockHeight}
                      style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', background: '#fff', padding: 6 }}
                      preview={{ src: getFullAuthedFileUrl(url) }}
                    />
                    {editableMode && (
                      <DeleteOutlined
                        onClick={() => setChunkImageUrls(record.chunkRowKeys, imgs.filter((_, ii) => ii !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '50%', padding: 2, fontSize: 10, cursor: 'pointer' }}
                      />
                    )}
                  </div>
                ))}
              </Image.PreviewGroup>
              {editableMode && imgs.length < 2 && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={async (file) => {
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      const res: any = await (api as any).post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                      if (res?.code === 200 && res?.data) {
                        setChunkImageUrls(record.chunkRowKeys, [...imgs, String(res.data)].slice(0, 2));
                      } else {
                        message.error('图片上传失败');
                      }
                    } catch {
                      message.error('图片上传失败');
                    }
                    return false;
                  }}
                >
                  <Button size="small" icon={<PlusOutlined />} style={{ width: '100%', height: imgs.length > 0 ? 84 : 220, borderRadius: 8, borderStyle: 'dashed' }} />
                </Upload>
              )}
            </div>
          );
        },
      },
      {
        title: '分组',
        dataIndex: 'groupName',
        width: 50,
        onCell: (record: DisplayRow) => {
          return {
            rowSpan: record.isGroupChunkStart ? record.groupChunkSpan : 0,
            style: { verticalAlign: 'top' as const },
          };
        },
        render: (_: any, record: DisplayRow) => {
          if (!record.isGroupChunkStart) return null;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', padding: '8px 0' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: 'stretch',
                  gap: 2,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: record.groupToneMeta.tagBg,
                  color: record.groupToneMeta.tagColor,
                  boxShadow: `inset 0 0 0 1px ${record.groupToneMeta.tagColor}22`,
                }}
              >
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, lineHeight: 1.5 }}>
                  {record.resolvedGroupName}
                </span>
              </div>
              {editableMode ? (
                <Select
                  value={String(record.groupName || record.resolvedGroupName || '其他区')}
                  placeholder="选择分组"
                  style={{ width: '100%' }}
                  options={groupNameOptions}
                  onChange={(value) => updateChunkGroupName(record.chunkRowKeys, String(value || '其他区'))}
                />
              ) : null}
              {editableMode && (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  type="dashed"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => handleAddPartInGroup(record.resolvedGroupName)}
                >
                  添加行
                </Button>
              )}
            </div>
          );
        },
      },
      {
        title: '部位',
        dataIndex: 'partName',
        width: 50,
        render: (_: any, record: DisplayRow) =>
          editableMode ? (
            <Input value={record.partName} placeholder="如：胸围" onChange={(e) => updatePartName(record.key, e.target.value)} />
          ) : (
            record.partName
          ),
      },
      {
        title: '度量方式',
        dataIndex: 'measureMethod',
        width: 80,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Input value={record.measureMethod} placeholder="如：平量" onChange={(e) => updateMeasureMethod(record.key, e.target.value)} />
          ) : (
            record.measureMethod
          ),
      },
      {
        title: '样版码',
        dataIndex: 'baseSize',
        width: 40,
        align: 'center' as const,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Select
              value={record.baseSize || undefined}
              allowClear
              style={{ width: '100%' }}
              options={sizeColumns.map((size) => ({ value: size, label: size }))}
              onChange={(value) => updateBaseSize(record.key, String(value || ''))}
            />
          ) : (
            record.baseSize || '-'
          ),
      },
      {
        title: '跳码区',
        dataIndex: 'gradingZones',
        width: 120,
        render: (_: any, record: MatrixRow) => {
          const zones = normalizeGradingZones(record.gradingZones || [], sizeColumns);
          const summary = zones.map((zone) => {
            const frontInfo = (zone.frontSizes || []).length > 0
              ? `前:${zone.frontSizes.join('/')}↓${toNumberSafe(zone.frontStep)}`
              : '';
            const backInfo = (zone.backSizes || []).length > 0
              ? `后:${zone.backSizes.join('/')}↑${toNumberSafe(zone.backStep)}`
              : '';
            return `${zone.label}(${[frontInfo, backInfo].filter(Boolean).join(' ')})`;
          }).join('；');
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-wrap' }}>{summary || '-'}</div>
              {editableMode ? (
                <Button size="small" onClick={() => openGradingConfig(record)}>
                  配置跳码区
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ];

    const sizeCols = sizeColumns.map((sn) => ({
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{sn}</span>
          {editableMode ? (
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              title={`删除尺码 ${sn}`}
              onClick={() => {
                Modal.confirm({
                  width: '30vw',
                  title: `确定删除尺码“${sn}”？`,
                  onOk: () => handleDeleteSize(sn),
                });
              }}
            />
          ) : null}
        </span>
      ),
      dataIndex: sn,
      width: 40,
      align: 'center' as const,
      render: (_: any, record: MatrixRow) => {
        const v = record.cells[sn]?.value;
        return editableMode ? (
          <InputNumber
            value={v}
            min={0}
            step={0.1}
            style={{ width: '100%' }}
            onChange={(val) => updateCellValue(record.key, sn, toNumberSafe(val))}
          />
        ) : (
          v
        );
      },
    }));

    const right = [
      {
        title: '公差',
        dataIndex: 'tolerance',
        width: 50,
        align: 'center' as const,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <InputNumber
              value={record.tolerance}
              min={0}
              step={0.1}
              style={{ width: '100%' }}
              onChange={(val) => updateTolerance(record.key, toNumberSafe(val))}
            />
          ) : (
            record.tolerance
          ),
      },
      {
        title: '操作',
        key: 'operation',
        width: 90,
        resizable: false,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <RowActions
              maxInline={1}
              actions={[
                {
                  key: 'delete',
                  label: '删除',
                  title: '删除',
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      width: '30vw',
                      title: '确定删除该部位？',
                      onOk: () => handleDeletePart(record),
                    });
                  },
                },
              ]}
            />
          ) : null,
      },
    ];

    // readOnly/只读模式下隐藏操作列（无任何可操作按钮，空列无意义）
    const filteredRight = editableMode ? right : right.filter(col => col.key !== 'operation');
    return [...left, ...sizeCols, ...filteredRight];
  }, [editMode, readOnly, sizeColumns, displayRows, groupNameOptions, rows]);

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
        <StyleSizeToolbar
          editMode={editMode}
          readOnly={readOnly}
          loading={loading}
          saving={saving}
          templateLoading={templateLoading}
          selectedRowCount={selectedRowKeys.length}
          sizeTemplateKey={sizeTemplateKey}
          sizeTemplates={sizeTemplates}
          newGroupName={newGroupName}
          sizeOptions={sizeOptions}
          sizeColumns={sizeColumns}
          onOpenBatchGradingConfig={openBatchGradingConfig}
          onClearSelection={() => setSelectedRowKeys([])}
          onEnterEdit={enterEdit}
          onSave={saveAll}
          onCancelEdit={() => {
            Modal.confirm({
              width: '30vw',
              title: '放弃未保存的修改？',
              onOk: exitEdit,
            });
          }}
          onSizeTemplateChange={setSizeTemplateKey}
          onImportTemplate={(mode) => {
            if (!sizeTemplateKey) {
              message.error('请选择模板');
              return;
            }
            void applySizeTemplate(sizeTemplateKey, mode);
          }}
          onGroupNameChange={setNewGroupName}
          onConfirmAddGroup={confirmAddGroup}
          onOpenSizeOptions={fetchSizeDictOptions}
          onSearchSizeOption={(value) => {
            const normalized = String(value || '').trim();
            if (!normalized || sizeColumns.includes(normalized) || sizeOptions.some((option) => option.value === normalized)) {
              return;
            }
            setSizeOptions((prev) => [...prev, { value: normalized, label: normalized }]);
          }}
          onAddSizes={(values) => {
            appendSizes(values);
          }}
          onAddCustomSize={(value) => appendSizes([value])}
        />
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
