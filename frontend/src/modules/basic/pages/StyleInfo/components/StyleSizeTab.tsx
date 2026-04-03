import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Dropdown, Input, InputNumber, Space, Select, Modal, Upload, Image, Tag, Popover, Table } from 'antd';
import { DeleteOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons';
import { StyleSize, TemplateLibrary } from '@/types/style';
import api, { sortSizeNames, toNumberSafe } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import StyleStageControlBar from './StyleStageControlBar';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
  linkedSizes?: string[];
  simpleView?: boolean; // 简化视图：隐藏领取人信息、操作按钮、提示信息
  onRefresh?: () => void;
}

type MatrixCell = {
  id?: string | number;
  value: number;
};

type GradingZone = {
  key: string;
  label: string;
  sizes: string[];
  step: number;
  partKeys?: string[];
  frontSizes?: string[];
  frontStep?: number;
  backSizes?: string[];
  backStep?: number;
};

type MatrixRow = {
  key: string;
  groupName: string;
  partName: string;
  measureMethod: string;
  baseSize: string;
  gradingZones: GradingZone[];
  tolerance: number;
  sort: number;
  cells: Record<string, MatrixCell>;
  /** 部位参考图片 URLs（JSON 字符串数组反序列化后） */
  imageUrls?: string[];
};

type GroupToneMeta = {
  key: 'upper' | 'lower' | 'other';
  tint: string;
  tagBg: string;
  tagColor: string;
};

type DisplayRow = MatrixRow & {
  resolvedGroupName: string;
  groupToneMeta: GroupToneMeta;
  isGroupStart: boolean;
  isGroupChunkStart: boolean;
  groupChunkSpan: number;
  isImageChunkStart: boolean;
  imageChunkSpan: number;
  chunkImageUrls: string[];
  chunkRowKeys: string[];
};

const splitSizeNames = (name: string) => {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[\n,，、;；]+/g)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!parts.length) return [];
  return parts;
};

const normalizeSizeList = (sizes: string[] = []) => {
  return sortSizeNames(
    Array.from(
      new Set(
        sizes
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    ),
  );
};

const GROUP_TONE_METAS: Record<GroupToneMeta['key'], GroupToneMeta> = {
  upper: {
    key: 'upper',
    tint: '#f7fbff',
    tagBg: '#e8f3ff',
    tagColor: '#1677ff',
  },
  lower: {
    key: 'lower',
    tint: '#fffaf2',
    tagBg: '#fff1db',
    tagColor: '#d48806',
  },
  other: {
    key: 'other',
    tint: '#fafafa',
    tagBg: '#f0f0f0',
    tagColor: '#595959',
  },
};

const inferGroupNameFromPart = (partName: string): string => {
  const normalized = String(partName || '').replace(/\s+/g, '').toLowerCase();
  if (!normalized) return '其他区';

  const upperKeywords = [
    '衣长', '胸围', '肩宽', '袖长', '袖口', '袖肥', '领围', '领宽', '领深', '门襟', '胸宽', '摆围', '下摆', '前长', '后长', '前胸', '后背', '袖窿',
  ];
  const lowerKeywords = [
    '裤长', '腰围', '臀围', '前浪', '后浪', '脚口', '裤口', '腿围', '小腿围', '大腿围', '膝围', '坐围', '裆', '裙长', '裙摆',
  ];

  if (upperKeywords.some((keyword) => normalized.includes(keyword))) {
    return '上装区';
  }
  if (lowerKeywords.some((keyword) => normalized.includes(keyword))) {
    return '下装区';
  }
  return '其他区';
};

const resolveGroupName = (groupName?: string, partName?: string) => {
  const explicit = String(groupName || '').trim();
  if (explicit) return explicit;
  return inferGroupNameFromPart(String(partName || ''));
};

const resolveGroupToneMeta = (groupName: string): GroupToneMeta => {
  const normalized = String(groupName || '').replace(/\s+/g, '').toLowerCase();
  if (normalized.includes('上装')) {
    return GROUP_TONE_METAS.upper;
  }
  if (normalized.includes('下装') || normalized.includes('裤') || normalized.includes('裙')) {
    return GROUP_TONE_METAS.lower;
  }
  return GROUP_TONE_METAS.other;
};

const normalizeRowSorts = (list: MatrixRow[]) => {
  return list.map((row, index) => ({
    ...row,
    sort: index + 1,
  }));
};

const normalizeChunkImageAssignments = (list: MatrixRow[]) => {
  const sortedRows = normalizeRowSorts(list)
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

  const normalizedRows: MatrixRow[] = [];
  groupOrder.forEach((groupName) => {
    const groupRows = grouped.get(groupName) || [];
    const ownerImages = groupRows.find((row) => Array.isArray(row.imageUrls) && row.imageUrls.length > 0)?.imageUrls;
    groupRows.forEach((row, index) => {
      normalizedRows.push({
        ...row,
        imageUrls: index === 0 && ownerImages?.length ? ownerImages.slice(0, 2) : undefined,
      });
    });
  });

  return normalizedRows;
};

const createGradingZone = (
  sizes: string[] = [],
  label = '跳码区',
  partKeys: string[] = [],
  frontSizes: string[] = [],
  backSizes: string[] = [],
): GradingZone => ({
  key: `grading-zone-${Date.now()}-${Math.random()}`,
  label,
  sizes,
  step: 0,
  partKeys,
  frontSizes,
  frontStep: 0,
  backSizes,
  backStep: 0,
});

const normalizeGradingZones = (zones: GradingZone[], sizeColumns: string[]) => {
  const validSizes = new Set(sizeColumns);
  return zones
    .map((zone, index) => {
      let frontSizes = (zone.frontSizes || []).filter((size) => validSizes.has(size));
      let backSizes = (zone.backSizes || []).filter((size) => validSizes.has(size));
      if (frontSizes.length === 0 && backSizes.length === 0 && (zone.sizes || []).length > 0) {
        const allSizes = (zone.sizes || []).filter((size) => validSizes.has(size));
        backSizes = allSizes;
      }
      return {
        key: zone.key || `grading-zone-${index}`,
        label: String(zone.label || `跳码区${index + 1}`),
        sizes: zone.sizes || [],
        step: toNumberSafe(zone.step),
        frontSizes,
        frontStep: toNumberSafe(zone.frontStep || zone.step),
        backSizes,
        backStep: toNumberSafe(zone.backStep || zone.step),
      };
    })
    .filter((zone) => zone.frontSizes.length > 0 || zone.backSizes.length > 0);
};

const parseGradingRule = (rule: unknown, sizeColumns: string[]) => {
  try {
    const parsed = JSON.parse(String(rule || '{}'));
    const zones = normalizeGradingZones(
      Array.isArray(parsed?.zones) ? parsed.zones.map((zone: any, index: number) => ({
        key: String(zone?.key || `grading-zone-${index}`),
        label: String(zone?.label || `跳码区${index + 1}`),
        sizes: Array.isArray(zone?.sizes) ? zone.sizes.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
        step: toNumberSafe(zone?.step),
        frontSizes: Array.isArray(zone?.frontSizes) ? zone.frontSizes.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
        frontStep: toNumberSafe(zone?.frontStep),
        backSizes: Array.isArray(zone?.backSizes) ? zone.backSizes.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
        backStep: toNumberSafe(zone?.backStep),
      })) : [],
      sizeColumns
    );
    const baseSize = sizeColumns.includes(String(parsed?.baseSize || '').trim())
      ? String(parsed.baseSize).trim()
      : '';
    return { baseSize, gradingZones: zones };
  } catch {
    return {
      baseSize: '',
      gradingZones: [],
    };
  }
};

const serializeGradingRule = (row: MatrixRow, sizeColumns: string[]) => {
  const gradingZones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
  return JSON.stringify({
    baseSize: String(row.baseSize || '').trim(),
    zones: gradingZones.map((zone) => ({
      key: zone.key,
      label: zone.label,
      sizes: zone.sizes,
      step: toNumberSafe(zone.step),
      frontSizes: zone.frontSizes,
      frontStep: toNumberSafe(zone.frontStep),
      backSizes: zone.backSizes,
      backStep: toNumberSafe(zone.backStep),
    })),
  });
};

const StyleSizeTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
  linkedSizes = [],
  simpleView = false,
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

  const { message, modal } = App.useApp();
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
    const stepForSize = (sizeName: string, direction: 'front' | 'back') => {
      const zone = zones.find((item) => {
        if (direction === 'front') {
          return (item.frontSizes || []).includes(sizeName);
        }
        return (item.backSizes || []).includes(sizeName);
      });
      return toNumberSafe(direction === 'front' ? zone?.frontStep : zone?.backStep);
    };
    const nextCells = { ...row.cells };
    nextCells[baseSize] = { ...(nextCells[baseSize] || { value: 0 }), value: baseValue };
    for (let index = baseIndex + 1; index < sizeColumns.length; index += 1) {
      const currentSize = sizeColumns[index];
      const prevSize = sizeColumns[index - 1];
      const prevValue = toNumberSafe(nextCells[prevSize]?.value);
      const step = stepForSize(currentSize, 'back');
      nextCells[currentSize] = {
        ...(nextCells[currentSize] || { value: 0 }),
        value: Number((prevValue + step).toFixed(2)),
      };
    }
    for (let index = baseIndex - 1; index >= 0; index -= 1) {
      const currentSize = sizeColumns[index];
      const nextSize = sizeColumns[index + 1];
      const nextValue = toNumberSafe(nextCells[nextSize]?.value);
      const step = stepForSize(currentSize, 'front');
      nextCells[currentSize] = {
        ...(nextCells[currentSize] || { value: 0 }),
        value: Number((nextValue - step).toFixed(2)),
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
        tolerance: 0,
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
      {!simpleView && (
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

      <ResizableModal
        open={gradingConfigOpen}
        title={gradingTargetRowKey === 'batch' ? `批量配置跳码区 (${selectedRowKeys.length}个部位)` : '配置跳码区'}
        onCancel={() => {
          setGradingConfigOpen(false);
          setGradingTargetRowKey('');
        }}
        footer={null}
        width="60vw"
        minWidth={720}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.62 : 520}
        minHeight={420}
        autoFontSize={false}
        scaleWithViewport
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) auto', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>样版码</div>
            <Select
              value={gradingDraftBaseSize || undefined}
              allowClear
              options={sizeColumns.map((size) => ({ value: size, label: size }))}
              onChange={(value) => {
                const newBaseSize = String(value || '');
                setGradingDraftBaseSize(newBaseSize);
                const baseIndex = newBaseSize ? sizeColumns.indexOf(newBaseSize) : -1;
                const newFrontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
                const newBackSizes = baseIndex >= 0 ? sizeColumns.slice(baseIndex + 1) : [...sizeColumns];
                setGradingDraftZones((prev) => prev.map((zone) => ({
                  ...zone,
                  frontSizes: newFrontSizes,
                  backSizes: newBackSizes,
                })));
              }}
            />
            <Button type="primary" onClick={applyGradingDraft}>
              保存并带出
            </Button>
          </div>
          <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.7 }}>
            样版码为基准码，跳码值相对于样版码递增/递减。选择样版码后自动分割前后码数。
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 140px 1fr 120px 1fr 120px 40px', gap: 0, background: '#f8fafc', fontWeight: 600, fontSize: 13, alignItems: 'center' }}>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>跳码区</div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>部位</div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>码数(前)</div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>跳码</div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>码数(后)</div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>跳码</div>
              <div style={{ padding: '12px' }}>操作</div>
            </div>
            {gradingDraftZones.map((zone, index) => (
              <div key={zone.key} style={{ display: 'grid', gridTemplateColumns: '80px 140px 1fr 120px 1fr 120px 40px', gap: 0, borderTop: '1px solid #e2e8f0', background: '#fff', alignItems: 'center' }}>
                <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                  <Input
                    value={zone.label}
                    size="small"
                    placeholder={`${index + 1}`}
                    onChange={(e) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, label: e.target.value } : item)))}
                  />
                </div>
                <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>
                  <Select
                    mode="multiple"
                    size="small"
                    value={zone.partKeys || []}
                    onChange={(values) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, partKeys: values } : item)))}
                    options={rows.map((r) => ({ value: r.key, label: r.partName || '未命名' }))}
                    placeholder="部位"
                    style={{ width: '100%', height: 32 }}
                    maxTagCount="responsive"
                  />
                </div>
                <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {sizeColumns.map((size) => {
                    const checked = (zone.frontSizes || []).includes(size);
                    return (
                      <Tag
                        key={`front-${zone.key}-${size}`}
                        color={checked ? 'blue' : 'default'}
                        style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5 }}
                        onClick={() => setGradingDraftZones((prev) => prev.map((item) => {
                          if (item.key !== zone.key) return item;
                          const nextSizes = (item.frontSizes || []).includes(size)
                            ? (item.frontSizes || []).filter((s) => s !== size)
                            : [...(item.frontSizes || []), size];
                          return { ...item, frontSizes: nextSizes };
                        }))}
                      >
                        {size}
                      </Tag>
                    );
                  })}
                </div>
                <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                  <InputNumber
                    size="small"
                    value={zone.frontStep}
                    min={0}
                    step={0.1}
                    style={{ width: '100%', height: 32 }}
                    onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, frontStep: toNumberSafe(value) } : item)))}
                  />
                </div>
                <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {sizeColumns.map((size) => {
                    const checked = (zone.backSizes || []).includes(size);
                    return (
                      <Tag
                        key={`back-${zone.key}-${size}`}
                        color={checked ? 'blue' : 'default'}
                        style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5 }}
                        onClick={() => setGradingDraftZones((prev) => prev.map((item) => {
                          if (item.key !== zone.key) return item;
                          const nextSizes = (item.backSizes || []).includes(size)
                            ? (item.backSizes || []).filter((s) => s !== size)
                            : [...(item.backSizes || []), size];
                          return { ...item, backSizes: nextSizes };
                        }))}
                      >
                        {size}
                      </Tag>
                    );
                  })}
                </div>
                <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                  <InputNumber
                    size="small"
                    value={zone.backStep}
                    min={0}
                    step={0.1}
                    style={{ width: '100%', height: 32 }}
                    onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, backStep: toNumberSafe(value) } : item)))}
                  />
                </div>
                <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Button
                    size="small"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => setGradingDraftZones((prev) => prev.filter((item) => item.key !== zone.key))}
                    disabled={gradingDraftZones.length <= 1}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setGradingDraftZones((prev) => [...prev, createGradingZone([], `${prev.length + 1}`, [], [], [...sizeColumns])])}
          >
            新增跳码区
          </Button>
        </div>
      </ResizableModal>
    </div>
  );
};

export default StyleSizeTab;
