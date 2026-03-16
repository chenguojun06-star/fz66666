import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Space, Select, Modal, Upload, Image, } from 'antd';
import { message } from '@/utils/antdStatic';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
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
  simpleView?: boolean; // 简化视图：隐藏领取人信息、操作按钮、提示信息
  onRefresh?: () => void;
}

type MatrixCell = {
  id?: string | number;
  value: number;
};

type MatrixRow = {
  key: string;
  groupName: string;
  partName: string;
  measureMethod: string;
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

const StyleSizeTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
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
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  // 未开始时禁止编辑（需先点击「开始尺寸表」）
  const notStarted = !sizeStartTime && !sizeCompletedTime;
  const [newSizeName, setNewSizeName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [sizeTemplateKey, setSizeTemplateKey] = useState<string | undefined>(undefined);
  const [sizeTemplates, setSizeTemplates] = useState<TemplateLibrary[]>([]);
  const [templateSourceStyleNo, setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);
  const { message, modal } = App.useApp();

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

  const fetchStyleNoOptions = async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: any[]; total: number } }>('/style/info/list', {
        params: {
          page: 1,
          pageSize: 200,
          styleNo: String(keyword ?? '').trim(),
        },
      });
      const result = res as Record<string, unknown>;
      if (seq !== styleNoReqSeq.current) return;
      if (result.code !== 200) return;
      const records = ((result.data as any)?.records || []) as Array<any>;
      const next = (Array.isArray(records) ? records : [])
        .map((r) => String(r?.styleNo || '').trim())
        .filter(Boolean)
        .map((sn) => ({ value: sn, label: sn }));
      setStyleNoOptions(next);
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      if (seq === styleNoReqSeq.current) setStyleNoLoading(false);
    }
  };

  const scheduleFetchStyleNos = (keyword: string) => {
    if (styleNoTimerRef.current != null) {
      window.clearTimeout(styleNoTimerRef.current);
    }
    styleNoTimerRef.current = window.setTimeout(() => {
      fetchStyleNoOptions(keyword);
    }, 250);
  };

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
        // 兼容两种返回格式：分页格式 {records: [...]} 或 直接数组 [...]
        const data = result.data as { records?: any[] } | any[];
        const records = Array.isArray(data) ? data : ((data as { records?: any[] })?.records || []);
        setSizeTemplates(Array.isArray(records) ? records as TemplateLibrary[] : []);
        return;
      }
    } catch {
    // Intentionally empty
      // 忽略错误
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
    // Intentionally empty
      // 忽略错误
    }
  };

  useEffect(() => {
    fetchSizeTemplates('');
    fetchStyleNoOptions('');
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

        const sizes = sortSizeNames(
          Array.from(
            new Set(
              normalizedList
                .flatMap((x) => splitSizeNames((x as any)?.sizeName as string))
                .map((x) => String(x || '').trim())
                .filter(Boolean),
            ),
          ),
        );

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
            return { key, groupName, partName, measureMethod, tolerance, sort, cells, imageUrls };
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
      next.splice(insertAt, 0, { key, groupName, partName: '', measureMethod: '', tolerance: 0, sort: 0, cells });
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
      { key, groupName, partName: '', measureMethod: '', tolerance: 0, sort: prev.length ? Math.max(...prev.map((r) => toNumberSafe(r.sort))) + 1 : 1, cells },
    ]));
    setAddGroupOpen(false);
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
        return { ...r, cells: nextCells };
      }),
    );
    setAddSizeOpen(false);
    setNewSizeName('');
    if (!editMode) enterEdit();
  };

  const applySizeTemplate = (templateId: string) => {
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

    const doImport = async (mode: 'merge' | 'overwrite') => {
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
        fetchSize();
      } catch (e: unknown) {
        message.error((e as any)?.message || '导入失败');
      }
    };

    modal.confirm({
      title: '导入尺寸模板',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>请选择导入方式：</p>
          <p style={{ marginBottom: 4 }}>• <b>追加</b>：将模板部位行添加到现有数据后面（保留现有部位）</p>
          <p style={{ marginBottom: 0 }}>• <b>覆盖</b>：清除现有所有尺寸行，以模板数据替换</p>
        </div>
      ),
      okText: '追加导入',
      cancelText: '取消',
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button danger onClick={() => { Modal.destroyAll(); void doImport('overwrite'); }}>覆盖导入</Button>
          <OkBtn />
        </>
      ),
      onOk: () => doImport('merge'),
    });
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
        return { ...r, cells: nextCells };
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

    setSaving(true);
    try {
      const combinedIds = combinedSizeIdsRef.current || [];
      const deleteTasks = Array.from(
        new Set([...deletedIds.map((x) => String(x)), ...combinedIds.map((x) => String(x))].filter(Boolean)),
      ).map((id) => api.delete(`/style/size/${id}`));
      if (deleteTasks.length) {
        await Promise.all(deleteTasks);
      }

      const tasks: Array<Promise<any>> = [];
      normalizedRows.forEach((r) => {
        const groupName = resolveGroupName(r.groupName, r.partName);
        const imageUrlsJson = r.imageUrls && r.imageUrls.length > 0 ? JSON.stringify(r.imageUrls.slice(0, 2)) : null;
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
            standardValue: toNumberSafe(cell?.value),
            tolerance: toNumberSafe(r.tolerance),
            sort: toNumberSafe(r.sort),
            imageUrls: imageUrlsJson,
          };

          if (id != null && String(id).trim() !== '') {
            const old = originalById.get(String(id));
            const changed =
              !old ||
              String(old.sizeName || '').trim() !== sn ||
              String(old.partName || '').trim() !== String(r.partName || '').trim() ||
              String((old as Record<string, unknown>).groupName || '').trim() !== String(payload.groupName || '').trim() ||
              String((old as Record<string, unknown>).measureMethod || '').trim() !== String(r.measureMethod || '').trim() ||
              toNumberSafe(old.standardValue) !== toNumberSafe(payload.standardValue) ||
              toNumberSafe(old.tolerance) !== toNumberSafe(payload.tolerance) ||
              toNumberSafe((old as Record<string, unknown>).sort) !== toNumberSafe(payload.sort) ||
              String((old as Record<string, unknown>).imageUrls || '') !== String(payload.imageUrls || '');
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
        width: 180,
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
        width: 160,
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
        title: '部位(cm)',
        dataIndex: 'partName',
        width: 180,
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
        width: 160,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Input value={record.measureMethod} placeholder="如：平量" onChange={(e) => updateMeasureMethod(record.key, e.target.value)} />
          ) : (
            record.measureMethod
          ),
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
      width: 90,
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
        title: '公差(+/-)',
        dataIndex: 'tolerance',
        width: 110,
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

    return [...left, ...sizeCols, ...right];
  }, [editMode, readOnly, sizeColumns, displayRows, groupNameOptions]);

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
          <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
            💡 提示：相关文件请在“文件管理”标签页统一上传
          </div>
          <Space>
          <Select
            allowClear
            showSearch
            filterOption={false}
            loading={styleNoLoading}
            value={templateSourceStyleNo || undefined}
            placeholder="来源款号"
            style={{ width: 180 }}
            options={styleNoOptions}
            onSearch={scheduleFetchStyleNos}
            onChange={(v) => setTemplateSourceStyleNo(String(v || ''))}
            onOpenChange={(open) => {
              if (open && !styleNoOptions.length) fetchStyleNoOptions('');
            }}
            disabled={loading || saving || Boolean(readOnly) || notStarted || templateLoading}
          />

          <Button disabled={loading || saving || Boolean(readOnly) || notStarted || templateLoading} onClick={() => fetchSizeTemplates(templateSourceStyleNo)}>
            筛选
          </Button>

          <Button
            disabled={loading || saving || Boolean(readOnly) || notStarted || templateLoading}
            onClick={() => {
              setTemplateSourceStyleNo('');
              fetchSizeTemplates('');
            }}
          >
            全部
          </Button>

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
            disabled={loading || saving || Boolean(readOnly) || notStarted || templateLoading}
          />
          <Button
            onClick={() => {
              if (!sizeTemplateKey) {
                message.error('请选择模板');
                return;
              }
              applySizeTemplate(sizeTemplateKey);
            }}
            disabled={loading || saving || Boolean(readOnly) || notStarted || templateLoading}
          >
            导入模板
          </Button>
          <Button type="default" onClick={() => setAddGroupOpen(true)} disabled={loading || saving || Boolean(readOnly) || notStarted}>
            新增分组
          </Button>
          <Button type="default" onClick={() => setAddSizeOpen(true)} disabled={loading || saving || Boolean(readOnly) || notStarted}>
            新增尺码
          </Button>
          {!editMode || readOnly ? (
            <Button type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly) || notStarted}>
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
        rowClassName={(_record, rowIndex) => {
          const row = displayRows[rowIndex];
          if (!row) return '';
          const classes = [`style-size-group-${row.groupToneMeta.key}`];
          if (row.isGroupStart) {
            classes.push('style-size-group-start');
          }
          return classes.join(' ');
        }}
        scroll={{ x: 'max-content' }}
        tableLayout="auto"
        storageKey={`style-size-v2-${String(styleId)}`}
        minColumnWidth={70}
      />

      <ResizableModal
        open={addGroupOpen}
        title="新增分组"
        onCancel={() => {
          setAddGroupOpen(false);
          setNewGroupName('');
        }}
        onOk={confirmAddGroup}
        okText="确定"
        cancelText="取消"
        confirmLoading={saving}
        width="30vw"
        minWidth={360}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.34 : 280}
        minHeight={220}
        autoFontSize={false}
        scaleWithViewport
      >
        <Input
          value={newGroupName}
          placeholder="如：上装区 / 下装区 / 马甲区"
          onChange={(e) => setNewGroupName(e.target.value)}
          onPressEnter={confirmAddGroup}
        />
      </ResizableModal>

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
    </div>
  );
};

export default StyleSizeTab;
