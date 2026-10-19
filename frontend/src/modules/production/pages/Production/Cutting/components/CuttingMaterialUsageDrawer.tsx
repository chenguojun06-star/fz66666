import React, { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Input, InputNumber, Modal, Space, Table, Tag, Typography, message as antdMessage } from 'antd';
import { cuttingApi, type CuttingMaterialUsageDetail, type CuttingMaterialUsageRow, type MaterialRollRow, type MaterialUsageChain } from '@/services/production/cuttingApi';
import type { CuttingTask } from '@/types/production';

const { Text } = Typography;

interface CuttingMaterialUsageDrawerProps {
  task: CuttingTask | null;
  visible: boolean;
  onClose: () => void;
  /** 登记/回库成功后回调（刷新列表徽标） */
  onChanged?: () => void;
}

interface EditRow {
  issued: number | null;
  actual: number | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: unknown): string => {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
};

/**
 * D-823 裁剪用料台账抽屉。
 *
 * 操作流（最简路径）：
 *  1. 打开即见每种物料的 计划/领出/实际/余料（领出默认=计划，实际默认=领出 → 无余料时一键确认）
 *  2. 只有真有剩料才改「实际」→ 余料实时算出
 *  3. 保存登记 → 有余料行出现「回库」→ 行内单条回库或底部「余料全部回库」一键完成
 */
const CuttingMaterialUsageDrawer: React.FC<CuttingMaterialUsageDrawerProps> = ({
  task, visible, onClose, onChanged,
}) => {
  const [detail, setDetail] = useState<CuttingMaterialUsageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inbounding, setInbounding] = useState(false);
  const [editRows, setEditRows] = useState<Record<string, EditRow>>({});
  const [inboundTarget, setInboundTarget] = useState<CuttingMaterialUsageRow | null>(null);
  const [inboundQty, setInboundQty] = useState<number | null>(null);
  const [inboundLocation, setInboundLocation] = useState('默认仓');
  // P1：全链路穿透（按物料行懒加载）
  const [expandedCodes, setExpandedCodes] = useState<string[]>([]);
  const [chainMap, setChainMap] = useState<Record<string, MaterialUsageChain>>({});
  const [chainLoading, setChainLoading] = useState<Record<string, boolean>>({});
  // D-826：料卷级登记（按物料行懒加载）
  const [rollsMap, setRollsMap] = useState<Record<string, MaterialRollRow[]>>({});
  const [rollsLoading, setRollsLoading] = useState<Record<string, boolean>>({});
  const [rollEdit, setRollEdit] = useState<Record<string, number>>({});
  const [rollSaving, setRollSaving] = useState(false);
  const [rollInbounding, setRollInbounding] = useState(false);

  const loadChain = async (row: CuttingMaterialUsageRow) => {
    const orderNo = task?.productionOrderNo || detail?.orderNo;
    if (!orderNo || chainMap[row.materialCode] || chainLoading[row.materialCode]) return;
    setChainLoading((p) => ({ ...p, [row.materialCode]: true }));
    try {
      const res = await cuttingApi.chain(orderNo, row.materialCode);
      setChainMap((p) => ({ ...p, [row.materialCode]: res }));
    } catch {
      // 链路汇总失败不阻塞主流程（静默：展开行显示「暂无链路数据」）
    } finally {
      setChainLoading((p) => ({ ...p, [row.materialCode]: false }));
    }
  };

  // D-826：懒加载料卷列表，按 物料编码+颜色 过滤到当前行
  const loadRolls = async (row: CuttingMaterialUsageRow) => {
    if (!task?.id || rollsMap[row.materialCode] || rollsLoading[row.materialCode]) return;
    setRollsLoading((p) => ({ ...p, [row.materialCode]: true }));
    try {
      const res = await cuttingApi.rolls(task.id);
      const matched = (res.rolls || []).filter(
        (roll) => roll.materialCode === row.materialCode
          && String(roll.color || '') === String(row.color || ''),
      );
      setRollsMap((p) => ({ ...p, [row.materialCode]: matched }));
      const edits: Record<string, number> = {};
      matched.forEach((roll) => {
        edits[roll.rollId] = roll.usedQuantity != null ? Number(roll.usedQuantity) : 0;
      });
      setRollEdit((p) => ({ ...p, ...edits }));
    } catch {
      // 料卷拉取失败静默降级
    } finally {
      setRollsLoading((p) => ({ ...p, [row.materialCode]: false }));
    }
  };

  // D-826：保存卷级登记（保存后刷新台账主数据）
  const saveRollUsage = async (row: CuttingMaterialUsageRow) => {
    if (!task?.id) return;
    const rolls = rollsMap[row.materialCode] || [];
    for (const roll of rolls) {
      const used = Number(rollEdit[roll.rollId] ?? 0);
      if (used < 0 || used > Number(roll.rollQuantity || 0)) {
        antdMessage.error(`料卷「${roll.rollCode}」消耗必须在 0 ~ ${roll.rollQuantity} 之间`);
        return;
      }
    }
    setRollSaving(true);
    try {
      const res = await cuttingApi.saveRollUsage(
        task.id,
        rolls.map((roll) => ({ rollId: roll.rollId, usedQuantity: Number(rollEdit[roll.rollId] ?? 0) })),
      );
      antdMessage.success(res.message || '已登记');
      await load(task.id);
      setRollsMap((p) => ({ ...p, [row.materialCode]: [] as MaterialRollRow[] })); // 强制下次展开重拉
      onChanged?.();
    } catch (e: any) {
      antdMessage.error(e?.message || '登记失败');
    } finally {
      setRollSaving(false);
    }
  };

  // D-826：卷级余料回库（单卷）
  const rollRemnantInbound = async (row: CuttingMaterialUsageRow, roll: MaterialRollRow) => {
    if (!task?.id) return;
    const used = Number(rollEdit[roll.rollId] ?? roll.usedQuantity ?? 0);
    const remaining = Math.max(0, Number(roll.rollQuantity || 0) - used);
    if (remaining <= 0) {
      antdMessage.error(`料卷「${roll.rollCode}」无剩余可回库`);
      return;
    }
    setRollInbounding(true);
    try {
      const res = await cuttingApi.rollRemnantInbound(task.id, [
        { rollId: roll.rollId, quantity: remaining, warehouseLocation: '默认仓' },
      ]);
      antdMessage.success(res.message || '回库完成');
      await load(task.id);
      setRollsMap((p) => ({ ...p, [row.materialCode]: [] as MaterialRollRow[] }));
      onChanged?.();
    } catch (e: any) {
      antdMessage.error(e?.message || '回库失败');
    } finally {
      setRollInbounding(false);
    }
  };

  const load = async (taskId: string) => {
    setLoading(true);
    try {
      const res = await cuttingApi.detail(taskId);
      setDetail(res);
      // 本地编辑态：领出默认=计划，实际默认=领出（已登记则带原值）
      const next: Record<string, EditRow> = {};
      (res.rows || []).forEach((r) => {
        const issued = r.issuedAmount != null ? num(r.issuedAmount) : num(r.plannedAmount);
        const actual = r.actualUsed != null ? num(r.actualUsed) : issued;
        next[r.materialCode] = { issued, actual };
      });
      setEditRows(next);
    } catch (e: any) {
      antdMessage.error(e?.message || '用料台账加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && task?.id) {
      void load(task.id);
    } else {
      setDetail(null);
      setEditRows({});
    }
  }, [visible, task?.id]);

  const rows = useMemo(() => detail?.rows || [], [detail]);

  const totals = useMemo(() => {
    let planned = 0;
    let issued = 0;
    let actual = 0;
    let remnant = 0;
    rows.forEach((r) => {
      const e = editRows[r.materialCode];
      planned += num(r.plannedAmount);
      issued += e ? num(e.issued) : num(r.issuedAmount);
      actual += e ? num(e.actual) : num(r.actualUsed);
      const i = e ? num(e.issued) : num(r.issuedAmount);
      const a = e ? num(e.actual) : num(r.actualUsed);
      remnant += Math.max(0, i - a);
    });
    return { planned, issued, actual, remnant };
  }, [rows, editRows]);

  const pendingRemnantRows = useMemo(
    () => rows.filter((r) => {
      const e = editRows[r.materialCode];
      const i = e ? num(e.issued) : num(r.issuedAmount);
      const a = e ? num(e.actual) : num(r.actualUsed);
      return i - a > 0.0001;
    }),
    [rows, editRows],
  );

  const setEdit = (code: string, patch: Partial<EditRow>) => {
    setEditRows((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  };

  const handleSave = async () => {
    if (!task?.id) return;
    // 本地校验：实际不能大于领出、不能为负
    for (const r of rows) {
      const e = editRows[r.materialCode];
      if (!e) continue;
      const issued = num(e.issued);
      const actual = num(e.actual);
      if (issued < 0 || actual < 0) {
        antdMessage.error(`物料「${r.materialName}」数量不能为负`);
        return;
      }
      if (actual > issued) {
        antdMessage.error(`物料「${r.materialName}」实际消耗不能大于领出量`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await cuttingApi.saveUsage(
        task.id,
        rows.map((r) => ({
          materialCode: r.materialCode,
          issuedAmount: editRows[r.materialCode]?.issued ?? undefined,
          actualUsed: editRows[r.materialCode]?.actual ?? undefined,
        })),
      );
      antdMessage.success(res.message || '登记完成');
      await load(task.id);
      onChanged?.();
    } catch (e: any) {
      antdMessage.error(e?.message || '登记失败');
    } finally {
      setSaving(false);
    }
  };

  const doInbound = async (items: Array<{ materialCode: string; quantity?: number; warehouseLocation?: string }>) => {
    if (!task?.id || items.length === 0) return;
    setInbounding(true);
    try {
      const res = await cuttingApi.remnantInbound(task.id, items);
      antdMessage.success(res.message || '回库完成');
      await load(task.id);
      onChanged?.();
    } catch (e: any) {
      antdMessage.error(e?.message || '回库失败');
    } finally {
      setInbounding(false);
    }
  };

  const openInboundModal = (row: CuttingMaterialUsageRow) => {
    const e = editRows[row.materialCode];
    const issued = e ? num(e.issued) : num(row.issuedAmount);
    const actual = e ? num(e.actual) : num(row.actualUsed);
    setInboundQty(Math.max(0, issued - actual));
    setInboundTarget(row);
  };

  const confirmInbound = async () => {
    if (!inboundTarget) return;
    const qty = num(inboundQty);
    if (qty <= 0) {
      antdMessage.error('回库数量必须大于 0');
      return;
    }
    await doInbound([{ materialCode: inboundTarget.materialCode, quantity: qty, warehouseLocation: inboundLocation }]);
    setInboundTarget(null);
  };

  const inboundAll = async () => {
    const items = pendingRemnantRows.map((r) => {
      const e = editRows[r.materialCode];
      const issued = e ? num(e.issued) : num(r.issuedAmount);
      const actual = e ? num(e.actual) : num(r.actualUsed);
      return { materialCode: r.materialCode, quantity: Math.max(0, issued - actual), warehouseLocation: inboundLocation };
    });
    await doInbound(items);
  };

  const columns = [
    {
      title: '物料',
      key: 'material',
      render: (_: any, r: CuttingMaterialUsageRow) => (
        <div>
          <div>{r.materialName || r.materialCode}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.materialCode}
            {r.color ? ` · ${r.color}` : ''}
            {r.size ? ` · ${r.size}` : ''}
          </Text>
        </div>
      ),
    },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60, render: (v: string) => v || '-' },
    {
      title: '计划',
      key: 'planned',
      width: 100,
      align: 'right' as const,
      render: (_: any, r: CuttingMaterialUsageRow) => fmt(r.plannedAmount),
    },
    {
      title: '领出',
      key: 'issued',
      width: 120,
      align: 'right' as const,
      render: (_: any, r: CuttingMaterialUsageRow) => (
        <InputNumber
          size="small"
          min={0}
          precision={4}
          style={{ width: 96 }}
          value={editRows[r.materialCode]?.issued ?? num(r.issuedAmount ?? r.plannedAmount)}
          onChange={(v) => setEdit(r.materialCode, { issued: v == null ? 0 : Number(v) })}
        />
      ),
    },
    {
      title: '实际消耗',
      key: 'actual',
      width: 120,
      align: 'right' as const,
      render: (_: any, r: CuttingMaterialUsageRow) => (
        <InputNumber
          size="small"
          min={0}
          precision={4}
          style={{ width: 96 }}
          value={editRows[r.materialCode]?.actual ?? num(r.actualUsed)}
          onChange={(v) => setEdit(r.materialCode, { actual: v == null ? 0 : Number(v) })}
        />
      ),
    },
    {
      title: '余料',
      key: 'remnant',
      width: 150,
      align: 'right' as const,
      render: (_: any, r: CuttingMaterialUsageRow) => {
        const e = editRows[r.materialCode];
        const issued = e ? num(e.issued) : num(r.issuedAmount);
        const actual = e ? num(e.actual) : num(r.actualUsed);
        const remnant = Math.max(0, issued - actual);
        if (remnant <= 0.0001) return <Text type="secondary">0</Text>;
        return (
          <Space size={4}>
            <Text strong style={{ color: 'var(--color-warning, #fa8c16)' }}>{fmt(remnant)}</Text>
            <Button size="small" type="link" onClick={() => openInboundModal(r)}>回库</Button>
          </Space>
        );
      },
    },
    {
      title: '回库状态',
      key: 'status',
      width: 110,
      render: (_: any, r: CuttingMaterialUsageRow) => {
        if (r.remnantStatus === 'INBOUNDED') {
          return <Tag color="green">已回库{r.remnantInboundNo ? ` · ${r.remnantInboundNo}` : ''}</Tag>;
        }
        if (r.remnantStatus === 'PENDING') return <Tag color="orange">待回库</Tag>;
        return <Text type="secondary">-</Text>;
      },
    },
  ];

  // P1：全链路穿透（采购-到货-已领-退回 ↔ 计划-领出-实际-余料-已回库）
  // + P2：单件用料准确率（实际 vs BOM 计划）
  // + D-826：料卷级登记（逐卷录消耗 / 单卷余料回库）
  const renderChain = (r: CuttingMaterialUsageRow) => {
    const cuttingQty = num(detail?.cuttingQuantity);
    const perPiecePlanned = cuttingQty > 0 ? num(r.plannedAmount) / cuttingQty : 0;
    const perPieceActual = cuttingQty > 0 && r.actualUsed != null ? num(r.actualUsed) / cuttingQty : null;
    const deviation = perPieceActual != null && perPiecePlanned > 0
      ? (perPieceActual - perPiecePlanned) / perPiecePlanned
      : null;
    const rolls = rollsMap[r.materialCode];

    return (
      <div style={{ padding: '4px 8px' }}>
        {/* P2：单件用料准确率 */}
        {cuttingQty > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary">单件用料（{cuttingQty} 件）：</Text>
            计划 <Text strong>{fmt(perPiecePlanned)}</Text>{r.unit || ''}
            {perPieceActual != null && (
              <>
                {' · '}实际 <Text strong>{fmt(perPieceActual)}</Text>{r.unit || ''}
                {deviation != null && (
                  <>
                    {' · '}偏差{' '}
                    <Text strong style={{ color: Math.abs(deviation) > 0.15 ? '#fa8c16' : '#52c41a' }}>
                      {deviation > 0 ? '+' : ''}{(deviation * 100).toFixed(1)}%
                    </Text>
                    {Math.abs(deviation) > 0.15 && '（超 ±15%，建议复核 BOM 损耗率）'}
                  </>
                )}
              </>
            )}
            {perPieceActual == null && <Text type="secondary">（登记实际消耗后显示）</Text>}
          </div>
        )}

        {/* P1：全链路 */}
        {chainLoading[r.materialCode] ? (
          <div style={{ marginBottom: 8 }}><Text type="secondary">链路加载中…</Text></div>
        ) : chainMap[r.materialCode] ? (
          <div style={{ marginBottom: 8 }}>
            <Space size={32} wrap>
              <span>
                <Text type="secondary">采购 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].purchaseQuantity)}</Text>
                <Text type="secondary"> / 到货 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].arrivedQuantity)}</Text>
                <Text type="secondary"> / 已领出 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].usedQuantity)}</Text>
                <Text type="secondary"> / 退回 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].returnQuantity)}</Text>
                <Text type="secondary"> / 采购剩余 </Text>
                <Text strong style={{ color: '#1677ff' }}>{fmt(chainMap[r.materialCode].purchaseRemaining)}</Text>
              </span>
              <span>
                <Text type="secondary">裁剪计划 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].cuttingPlanned)}</Text>
                <Text type="secondary"> / 领出 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].cuttingIssued)}</Text>
                <Text type="secondary"> / 实际消耗 </Text>
                <Text strong>{fmt(chainMap[r.materialCode].cuttingActualUsed)}</Text>
                <Text type="secondary"> / 余料 </Text>
                <Text strong style={{ color: num(chainMap[r.materialCode].cuttingRemnant) > 0 ? '#fa8c16' : undefined }}>{fmt(chainMap[r.materialCode].cuttingRemnant)}</Text>
                <Text type="secondary"> / 已回库 </Text>
                <Text strong style={{ color: '#52c41a' }}>{fmt(chainMap[r.materialCode].remnantInbounded)}</Text>
              </span>
            </Space>
          </div>
        ) : null}

        {/* D-826：卷级登记 */}
        <div>
          <Text type="secondary" style={{ marginRight: 8 }}>按卷登记：</Text>
          {rollsLoading[r.materialCode] ? (
            <Text type="secondary">料卷加载中…</Text>
          ) : rolls == null ? (
            <Text type="secondary">（展开后自动加载）</Text>
          ) : rolls.length === 0 ? (
            <Text type="secondary">该物料暂无已发料料卷（未走扫码发料，或按任务级登记即可）</Text>
          ) : (
            <Table
              rowKey="rollId"
              dataSource={rolls}
              pagination={false}
              size="small"
              style={{ marginTop: 4 }}
              columns={[
                { title: '料卷号', dataIndex: 'rollCode', key: 'rollCode', width: 180 },
                {
                  title: '状态', dataIndex: 'status', key: 'status', width: 90,
                  render: (v: string) => (v === 'ISSUED' ? <Tag color="orange">已发料</Tag> : <Tag>{v || '-'}</Tag>),
                },
                { title: '发料量', key: 'qty', width: 90, align: 'right' as const, render: (_: any, roll: MaterialRollRow) => `${fmt(roll.rollQuantity)}${roll.unit || ''}` },
                {
                  title: '实际消耗', key: 'used', width: 130,
                  render: (_: any, roll: MaterialRollRow) => (
                    <InputNumber
                      size="small"
                      min={0}
                      max={Number(roll.rollQuantity || 0)}
                      precision={4}
                      style={{ width: 100 }}
                      value={rollEdit[roll.rollId] ?? (roll.usedQuantity != null ? Number(roll.usedQuantity) : 0)}
                      onChange={(v) => setRollEdit((p) => ({ ...p, [roll.rollId]: v == null ? 0 : Number(v) }))}
                    />
                  ),
                },
                {
                  title: '本卷剩余', key: 'remaining', width: 160,
                  render: (_: any, roll: MaterialRollRow) => {
                    const used = Number(rollEdit[roll.rollId] ?? roll.usedQuantity ?? 0);
                    const remaining = Math.max(0, Number(roll.rollQuantity || 0) - used);
                    if (remaining <= 0) return <Text type="secondary">0</Text>;
                    return (
                      <Space size={4}>
                        <Text strong style={{ color: '#fa8c16' }}>{fmt(remaining)}{roll.unit || ''}</Text>
                        <Button size="small" type="link" loading={rollInbounding} onClick={() => rollRemnantInbound(r, roll)}>回库</Button>
                      </Space>
                    );
                  },
                },
              ]}
              footer={() => (
                <div style={{ textAlign: 'right' }}>
                  <Button size="small" type="primary" loading={rollSaving} onClick={() => saveRollUsage(r)}>
                    保存卷级登记（自动重算本行）
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Drawer
        title="裁剪用料台账"
        width={860}
        open={visible}
        onClose={onClose}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button type="primary" loading={saving} onClick={handleSave} disabled={rows.length === 0}>
              保存登记
            </Button>
          </Space>
        }
      >
        {task && (
          <Space size={24} wrap style={{ marginBottom: 12 }}>
            <span>订单：<Text strong>{task.productionOrderNo || '-'}</Text></span>
            <span>款号：<Text strong>{task.styleNo || '-'}</Text></span>
            <span>裁剪数：<Text strong>{num(task.cuttingQuantity)}</Text> 件</span>
            <span>
              合计：计划 <Text strong>{fmt(totals.planned)}</Text>
              {' · '}领出 <Text strong>{fmt(totals.issued)}</Text>
              {' · '}实际 <Text strong>{fmt(totals.actual)}</Text>
              {' · '}余料 <Text strong style={{ color: totals.remnant > 0 ? '#fa8c16' : undefined }}>{fmt(totals.remnant)}</Text>
            </span>
          </Space>
        )}
        <Table
          rowKey="materialCode"
          loading={loading}
          dataSource={rows}
          columns={columns as any}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无用料台账（该任务无裁剪BOM或未完工）' }}
          expandable={{
            expandedRowKeys: expandedCodes,
            onExpand: (expanded, record) => {
              const code = String(record.materialCode);
              setExpandedCodes((prev) => (expanded ? [...prev, code] : prev.filter((c) => c !== code)));
              if (expanded) {
                void loadChain(record);
                void loadRolls(record);
              }
            },
            expandedRowRender: renderChain,
            rowExpandable: (record) => !!String(record.materialCode || ''),
          }}
        />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              提示：领出默认=计划量，实际默认=领出量；只有真有剩料才改数字。余料回库后自动增加物料库存。
            </Text>
            <Button
              type="primary"
              danger
              loading={inbounding}
              disabled={pendingRemnantRows.length === 0}
              onClick={inboundAll}
            >
              余料全部回库（{pendingRemnantRows.length}）
            </Button>
          </Space>
        </div>
      </Drawer>

      <Modal
        title="余料回库"
        open={!!inboundTarget}
        onCancel={() => setInboundTarget(null)}
        onOk={confirmInbound}
        confirmLoading={inbounding}
        okText="确认回库"
      >
        {inboundTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              物料：<Text strong>{inboundTarget.materialName}</Text>
              （{inboundTarget.materialCode}）
            </div>
            <div>
              回库数量（{inboundTarget.unit || '单位'}）：
              <InputNumber min={0} precision={4} style={{ width: 160, marginLeft: 8 }} value={inboundQty ?? 0} onChange={(v) => setInboundQty(v == null ? 0 : Number(v))} />
            </div>
            <div>
              存放位置：
              <Input style={{ width: 200, marginLeft: 8 }} value={inboundLocation} onChange={(e) => setInboundLocation(e.target.value)} />
            </div>
          </Space>
        )}
      </Modal>
    </>
  );
};

export default CuttingMaterialUsageDrawer;
