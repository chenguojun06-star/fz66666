import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, InputNumber, Modal, Spin, Tag } from 'antd';
import api from '@/utils/api';
import type { PatternProductionSnapshot } from '../styleTableViewUtils.types';

/**
 * D-382：PC「完成工序」弹窗——与手机端「多色勾选 + 填数量」完全同款交互。
 *
 * 背景（用户拍板）：
 * 1. 多色多码外单（如 20 个颜色）在 PC 上要逐个切换「色码任务」再点「手动完成」，
 *    20 个色码 = 20 次切换 + 20 次点按 → 这里一次列出全部色码，勾选后统一完成。
 * 2. **数量必须由操作人手动填写，不预设默认值**——一个版可能有多个工人分批做，
 *    每人实际完成的件数各不相同，系统预设的默认值会导致记录失真。
 *
 * 打开时并行拉取每个色码的扫码记录，标记出「该工序已完成」的色码并默认不勾选，
 * 避免重复完成产生重复报工记录（重复报工会导致工资重复计件）。
 */

export interface BatchCompleteTarget {
  snapshot: PatternProductionSnapshot;
  /** 本次完成数量（用户手填，不预设默认值） */
  quantity: number;
}

export interface BatchCompleteModalProps {
  open: boolean;
  /** 目标工序名（子工序名，如「整件」） */
  processName: string;
  /** 该工序所属阶段对应的操作类型（如 SEWING / TAIL） */
  operationType: string;
  /** 该款式下的全部色码任务（每个 颜色×码数 一条 PatternProduction） */
  snapshots: PatternProductionSnapshot[];
  submitting?: boolean;
  onCancel: () => void;
  /** 确认完成：回传被勾选的色码任务 + 各自数量 */
  onConfirm: (targets: BatchCompleteTarget[]) => Promise<void> | void;
}

interface ColorTaskRow {
  snapshot: PatternProductionSnapshot;
  label: string;
  /** 该工序在该色码任务上是否已完成（查扫码记录得出） */
  completed: boolean;
}

const BatchCompleteModal: React.FC<BatchCompleteModalProps> = ({
  open,
  processName,
  // 提交用的 operationType 由调用方（useSampleProcessListData）按当前阶段解析
  operationType: _operationType,
  snapshots,
  submitting,
  onCancel,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  /** D-382：数量由用户手填，**不预设默认值**（一个版多人生产时各人件数不同） */
  const [qtyMap, setQtyMap] = useState<Record<string, number | null>>({});
  const [rows, setRows] = useState<ColorTaskRow[]>([]);

  // 每个色码任务的展示文案：颜色/码数（+ 该色码的计划数量作为参考）
  const baseRows = useMemo<ColorTaskRow[]>(() => (
    (snapshots || []).map((snap) => {
      const color = String(snap.color || snap.colors?.[0] || '').trim();
      const size = String(snap.size || '').trim();
      const parts = [color || '未标色'];
      if (size) parts.push(size);
      return { snapshot: snap, label: parts.join(' / '), completed: false };
    })
  ), [snapshots]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const target = String(processName || '').trim().toLowerCase();
    setLoading(true);
    setRows(baseRows);
    setQtyMap({});
    setCheckedKeys([]);

    const tasks = baseRows.map(async (row) => {
      const pid = String(row.snapshot.id || '').trim();
      if (!pid || !target) return { ...row, completed: false };
      try {
        const res: any = await api.get(`/production/pattern/${pid}/scan-records`);
        const data = res?.data;
        const records: any[] = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : [];
        // 与手机端/后端同口径：CLAIM（领取）不算完成，只有报工记录才算
        const completed = records.some((r) => {
          if (!r || r.success === false) return false;
          if (String(r.processName || '').trim().toLowerCase() !== target) return false;
          const op = String(r.operationType || '').trim().toUpperCase();
          if (op === 'CLAIM' || op === 'RECEIVE') return false;
          return Number(r.quantity) > 0;
        });
        return { ...row, completed };
      } catch {
        return { ...row, completed: false };
      }
    });

    Promise.all(tasks).then((next) => {
      if (cancelled) return;
      setRows(next);
      // 已完成的不默认勾选，避免重复报工（重复报工会重复计件工资）
      setCheckedKeys(next.filter((r) => !r.completed).map((r) => String(r.snapshot.id)));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, processName, baseRows]);

  const pendingRows = rows.filter((r) => !r.completed);

  /** 勾选且已填有效数量的行 —— 只有这些能提交 */
  const readyTargets: BatchCompleteTarget[] = rows
    .filter((r) => checkedKeys.includes(String(r.snapshot.id)))
    .filter((r) => Number(qtyMap[String(r.snapshot.id)]) > 0)
    .map((r) => ({ snapshot: r.snapshot, quantity: Number(qtyMap[String(r.snapshot.id)]) }));

  const checkedCount = rows.filter((r) => checkedKeys.includes(String(r.snapshot.id))).length;
  const missingQtyCount = checkedCount - readyTargets.length;

  return (
    <Modal
      open={open}
      title={`完成「${processName || '工序'}」`}
      okText={`确认完成（${readyTargets.length}）`}
      cancelText="取消"
      okButtonProps={{ disabled: loading || readyTargets.length === 0 }}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => onConfirm(readyTargets)}
      width={560}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="勾选色码并填写本次完成数量"
          description={
            pendingRows.length === 0
              ? '该工序下所有色码都已完成，无需重复操作。'
              : `共 ${rows.length} 个色码，其中 ${pendingRows.length} 个还没完成。已完成的默认不勾选，避免重复报工。数量按实际完成件数填写。`
          }
        />
        {rows.length > 1 && (
          <div style={{ marginBottom: 8 }}>
            <Checkbox
              indeterminate={checkedKeys.length > 0 && checkedKeys.length < rows.length}
              checked={checkedKeys.length === rows.length}
              onChange={(e) => setCheckedKeys(e.target.checked ? rows.map((r) => String(r.snapshot.id)) : [])}
            >
              全选
            </Checkbox>
          </div>
        )}
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {rows.map((row) => {
            const key = String(row.snapshot.id);
            const qty = qtyMap[key];
            const checked = checkedKeys.includes(key);
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 4px',
                  borderBottom: '1px solid var(--color-border-light)',
                }}
              >
                <Checkbox
                  checked={checked}
                  onChange={(e) => {
                    setCheckedKeys((prev) => (
                      e.target.checked ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key)
                    ));
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{row.label}</span>
                </Checkbox>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {row.completed
                    ? <Tag color="success" style={{ fontSize: 11 }}>已完成</Tag>
                    : (
                      <InputNumber
                        size="small"
                        min={1}
                        precision={0}
                        placeholder="本次件数"
                        style={{ width: 110 }}
                        value={qty ?? undefined}
                        disabled={!checked}
                        onChange={(v) => setQtyMap((prev) => ({ ...prev, [key]: (v == null ? null : Number(v)) }))}
                      />
                    )}
                </span>
              </div>
            );
          })}
        </div>
        {missingQtyCount > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning)' }}>
            有 {missingQtyCount} 个已勾选的色码还没填数量，提交时会自动跳过。
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default BatchCompleteModal;
