import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, InputNumber, message, Space, Select, Modal } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { StyleSize, TemplateLibrary } from '@/types/style';
import api, { sortSizeNames, toNumberSafe } from '@/utils/api';
import { useViewport } from '@/utils/useViewport';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
}

type MatrixCell = {
  id?: string | number;
  value: number;
};

type MatrixRow = {
  key: string;
  partName: string;
  measureMethod: string;
  tolerance: number;
  sort: number;
  cells: Record<string, MatrixCell>;
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

const StyleSizeTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
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
  const [newSizeName, setNewSizeName] = useState('');
  const [sizeTemplateKey, setSizeTemplateKey] = useState<string | undefined>(undefined);
  const [sizeTemplates, setSizeTemplates] = useState<TemplateLibrary[]>([]);
  const [templateSourceStyleNo, setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);
  const { modalWidth } = useViewport();

  const fetchStyleNoOptions = async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/style/info/list', {
        params: {
          page: 1,
          pageSize: 200,
          styleNo: String(keyword ?? '').trim(),
        },
      });
      const result = res as Record<string, unknown>;
      if (seq !== styleNoReqSeq.current) return;
      if (result.code !== 200) return;
      const records = (result.data?.records || []) as Array<unknown>;
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
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/template-library/list', {
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
        const records = (result.data?.records || []) as TemplateLibrary[];
        setSizeTemplates(Array.isArray(records) ? records : []);
        return;
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      setTemplateLoading(false);
    }

    try {
      const res = await api.get<{ code: number; data: unknown[] }>('/template-library/type/size');
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
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const rawList: StyleSize[] = result.data || [];
        const combinedIds: Array<string | number> = [];
        const normalizedList: StyleSize[] = [];
        rawList.forEach((it) => {
          const parts = splitSizeNames((it as Record<string, unknown>)?.sizeName);
          if (parts.length > 1 && it?.id != null && String(it.id).trim() !== '') {
            combinedIds.push(it.id);
          }
          const atomic = parts.length ? parts : [];
          atomic.forEach((sn) => {
            const next: unknown = { ...it, sizeName: sn };
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
                .flatMap((x) => splitSizeNames((x as Record<string, unknown>)?.sizeName))
                .map((x) => String(x || '').trim())
                .filter(Boolean),
            ),
          ),
        );

        const byPart = new Map<string, StyleSize[]>();
        normalizedList.forEach((it) => {
          const part = String(it.partName || '').trim();
          if (!byPart.has(part)) byPart.set(part, []);
          byPart.get(part)!.push(it);
        });

        const nextRows: MatrixRow[] = Array.from(byPart.entries())
          .map(([partName, items]) => {
            const key = partName || (items.map((x) => String(x.id || '')).filter(Boolean)[0] || `tmp-${Date.now()}-${Math.random()}`);
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
            return { key, partName, measureMethod, tolerance, sort, cells };
          })
          .sort((a, b) => (toNumberSafe(a.sort) || 0) - (toNumberSafe(b.sort) || 0));

        setSizeColumns(sizes);
        setRows(nextRows);
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

  const handleAddPart = () => {
    if (readOnly) return;
    const nextSort = rows.length ? Math.max(...rows.map((r) => toNumberSafe(r.sort))) + 1 : 1;
    const key = `tmp-part-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => {
      cells[sn] = { value: 0 };
    });
    setRows((prev) => [...prev, { key, partName: '', measureMethod: '', tolerance: 0, sort: nextSort, cells }]);
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

  const applySizeTemplate = async (templateId: string) => {
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
        mode: 'overwrite',
      });
      const result = res as Record<string, unknown>;
      if (result.code !== 200) {
        message.error(result.message || '导入失败');
        return;
      }
      message.success('已导入尺寸模板');
      setSizeTemplateKey(undefined);
      fetchSize();
    } catch (e: unknown) {
      message.error(e?.message || '导入失败');
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
        return { ...r, cells: nextCells };
      }),
    );
  };

  const saveAll = async () => {
    if (readOnly) return;
    const invalid = rows.some((r) => !String(r.partName || '').trim());
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

      const tasks: Array<Promise<unknown>> = [];
      rows.forEach((r) => {
        sizeColumns.forEach((sn) => {
          const cell = r.cells[sn];
          const id = cell?.id;
          const payload: unknown = {
            id: id != null ? id : undefined,
            styleId,
            sizeName: sn,
            partName: r.partName,
            measureMethod: r.measureMethod,
            standardValue: toNumberSafe(cell?.value),
            tolerance: toNumberSafe(r.tolerance),
            sort: toNumberSafe(r.sort),
          };

          if (id != null && String(id).trim() !== '') {
            const old = originalById.get(String(id));
            const changed =
              !old ||
              String(old.sizeName || '').trim() !== sn ||
              String(old.partName || '').trim() !== String(r.partName || '').trim() ||
              String((old as Record<string, unknown>).measureMethod || '').trim() !== String(r.measureMethod || '').trim() ||
              toNumberSafe(old.standardValue) !== toNumberSafe(payload.standardValue) ||
              toNumberSafe(old.tolerance) !== toNumberSafe(payload.tolerance) ||
              toNumberSafe((old as Record<string, unknown>).sort) !== toNumberSafe(payload.sort);
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
        const bad = results.find((r: Record<string, unknown>) => (r as Record<string, unknown>)?.code !== 200);
        if (bad) {
          message.error((bad as Record<string, unknown>)?.message || '保存失败');
          return;
        }
      }

      message.success('保存成功');
      setEditMode(false);
      snapshotRef.current = null;
      await fetchSize();
    } catch (e: unknown) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => {
    const editableMode = editMode && !readOnly;
    const left = [
      {
        title: '部位(cm)',
        dataIndex: 'partName',
        width: 180,
        render: (_: any, record: MatrixRow) =>
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
              onClick={() => {
                Modal.confirm({
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
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
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
  }, [editMode, readOnly, rows, sizeColumns]);

  return (
    <div>
      {/* 状态栏 */}
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#f5f5f5',
        borderRadius: 4,
        display: 'flex',
        gap: 24,
      }}>
        <span style={{ color: '#666' }}>
          领取人：<span style={{ color: '#333', fontWeight: 500 }}>{sizeAssignee || '-'}</span>
        </span>
        <span style={{ color: '#666' }}>
          开始时间：<span style={{ color: '#333', fontWeight: 500 }}>{formatDateTime(sizeStartTime)}</span>
        </span>
        <span style={{ color: '#666' }}>
          完成时间：<span style={{ color: '#333', fontWeight: 500 }}>{formatDateTime(sizeCompletedTime)}</span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div />
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
            disabled={loading || saving || Boolean(readOnly) || templateLoading}
          />

          <Button disabled={loading || saving || Boolean(readOnly) || templateLoading} onClick={() => fetchSizeTemplates(templateSourceStyleNo)}>
            筛选
          </Button>

          <Button
            disabled={loading || saving || Boolean(readOnly) || templateLoading}
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
            disabled={loading || saving || Boolean(readOnly) || templateLoading}
          />
          <Button
            onClick={() => {
              if (!sizeTemplateKey) {
                message.error('请选择模板');
                return;
              }
              applySizeTemplate(sizeTemplateKey);
            }}
            disabled={loading || saving || Boolean(readOnly) || templateLoading}
          >
            导入模板
          </Button>
          <Button icon={<PlusOutlined />} onClick={handleAddPart} disabled={loading || saving}>
            新增部位
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setAddSizeOpen(true)} disabled={loading || saving || Boolean(readOnly)}>
            新增尺码
          </Button>
          {!editMode || readOnly ? (
            <Button icon={<EditOutlined />} type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly)}>
              编辑
            </Button>
          ) : (
            <>
              <Button icon={<SaveOutlined />} type="primary" onClick={saveAll} loading={saving}>
                保存
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  Modal.confirm({
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
        <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
          💡 提示：相关文件请在"文件管理"标签页统一上传
        </div>
      </div>

      <ResizableTable
        bordered
        dataSource={rows}
        columns={columns as Record<string, unknown>}
        pagination={false}
        loading={loading}
        rowKey="key"
        scroll={{ x: 'max-content' }}
        tableLayout="auto"
        storageKey={`style-size-v2-${String(styleId)}`}
        minColumnWidth={70}
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
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        minHeight={240}
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
