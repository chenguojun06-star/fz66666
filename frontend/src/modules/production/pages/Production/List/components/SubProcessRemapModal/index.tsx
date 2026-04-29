/**
 * SubProcessRemapModal — 子工序临时重分配配置弹窗
 *
 * 使用场景：外发工厂按订单临时增删/排序父节点下的子工序用于进度追踪，
 *           不影响父节点结构、单价与工资结算。
 *
 * v3 Table布局：左列子工序名称，右列进度节点 rowSpan 分组（与模板中心表格风格一致）
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Switch,
  Input,
  InputNumber,
  Tag,
  Typography,
  Empty,
  Tooltip,
  message,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProductionOrder } from '@/types/production';
import type {
  SubProcess,
  SubProcessRemapConfig,
  SubProcessRemapEntry,
  ParentNode,
} from '../../hooks/useSubProcessRemap';

const { Text } = Typography;

import {
  STAGE_ACCENT as ACCENT,
  STAGE_ACCENT_LIGHT as ACCENT_LIGHT,
  STAGE_ACTIVE as ACTIVE_COLOR,
} from '@/utils/stageStyles';

// ── 阶段排序
const STAGE_ORDER = ['procurement', 'cutting', 'carSewing', 'secondaryProcess', 'tailProcess', 'warehousing'];

// ── 生成简短 ID
function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── 表格行类型
interface TableRow {
  key: string;
  parentNode: ParentNode;
  entry: SubProcessRemapEntry;
  subprocess: SubProcess | null;
  subIndex: number;
  rowSpan: number;
  totalInParent: number;
}

// ────────────────────────────────────
// Props
// ────────────────────────────────────

interface Props {
  visible: boolean;
  record: ProductionOrder | null;
  parentNodes: ParentNode[];
  config: SubProcessRemapConfig;
  saving: boolean;
  onSave: (newConfig: SubProcessRemapConfig) => void;
  onClose: () => void;
  /** 是否为外发工厂账号。工厂账号可设置子工序自定义单价（仅外部参考，系统不参与结算） */
  isFactoryAccount?: boolean;
}

export default function SubProcessRemapModal({
  visible,
  record,
  parentNodes,
  config,
  saving,
  onSave,
  onClose,
  isFactoryAccount = false,
}: Props) {
  const [localConfig, setLocalConfig] = useState<SubProcessRemapConfig>({});

  useEffect(() => {
    if (visible) {
      const init: SubProcessRemapConfig = {};
      parentNodes.forEach(node => {
        init[node.stageKey] = config[node.stageKey] ?? { enabled: false, subProcesses: [] };
      });
      setLocalConfig(init);
    }
  }, [visible, parentNodes, config]);

  function toggleEnabled(stageKey: string, checked: boolean) {
    setLocalConfig(prev => {
      const entry = prev[stageKey] ?? { enabled: false, subProcesses: [] };
      if (checked && entry.subProcesses.length === 0) {
        return { ...prev, [stageKey]: { ...entry, enabled: true, subProcesses: [{ id: genId(), name: '', sortOrder: 0 }] } };
      }
      return { ...prev, [stageKey]: { ...entry, enabled: checked } };
    });
  }

  function addSubProcess(stageKey: string) {
    setLocalConfig(prev => {
      const entry = prev[stageKey] ?? { enabled: false, subProcesses: [] };
      const next: SubProcess = { id: genId(), name: '', sortOrder: entry.subProcesses.length };
      return { ...prev, [stageKey]: { ...entry, enabled: true, subProcesses: [...entry.subProcesses, next] } };
    });
  }

  function removeSubProcess(stageKey: string, id: string) {
    setLocalConfig(prev => {
      const entry = prev[stageKey];
      if (!entry) return prev;
      if (entry.subProcesses.length <= 1) { message.warning('父节点至少保留 1 个子工序'); return prev; }
      const filtered = entry.subProcesses.filter(s => s.id !== id).map((s, i) => ({ ...s, sortOrder: i }));
      return { ...prev, [stageKey]: { ...entry, subProcesses: filtered } };
    });
  }

  function moveSubProcess(stageKey: string, idx: number, dir: -1 | 1) {
    setLocalConfig(prev => {
      const entry = prev[stageKey];
      if (!entry) return prev;
      const arr = [...entry.subProcesses];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return { ...prev, [stageKey]: { ...entry, subProcesses: arr.map((s, i) => ({ ...s, sortOrder: i })) } };
    });
  }

  function updateSubProcessName(stageKey: string, id: string, name: string) {
    setLocalConfig(prev => {
      const entry = prev[stageKey];
      if (!entry) return prev;
      return { ...prev, [stageKey]: { ...entry, subProcesses: entry.subProcesses.map(s => s.id === id ? { ...s, name } : s) } };
    });
  }

  function updateSubProcessUnitPrice(stageKey: string, id: string, unitPrice: number | undefined) {
    setLocalConfig(prev => {
      const entry = prev[stageKey];
      if (!entry) return prev;
      return { ...prev, [stageKey]: { ...entry, subProcesses: entry.subProcesses.map(s => s.id === id ? { ...s, unitPrice } : s) } };
    });
  }

  // ── 构建表格行（按阶段顺序，每个子工序一行；未启用时 1 行占位）
  const tableRows = useMemo<TableRow[]>(() => {
    const sorted = [...parentNodes].sort((a, b) =>
      STAGE_ORDER.indexOf(a.stageKey) - STAGE_ORDER.indexOf(b.stageKey),
    );
    const rows: TableRow[] = [];
    for (const node of sorted) {
      const entry = localConfig[node.stageKey] ?? { enabled: false, subProcesses: [] };
      if (!entry.enabled || entry.subProcesses.length === 0) {
        rows.push({ key: `${node.stageKey}-placeholder`, parentNode: node, entry, subprocess: null, subIndex: 0, rowSpan: 1, totalInParent: 0 });
      } else {
        entry.subProcesses.forEach((sp, idx) => {
          rows.push({ key: sp.id, parentNode: node, entry, subprocess: sp, subIndex: idx, rowSpan: idx === 0 ? entry.subProcesses.length : 0, totalInParent: entry.subProcesses.length });
        });
      }
    }
    return rows;
  }, [parentNodes, localConfig]);

  // ── 表格列定义
  const columns: ColumnsType<TableRow> = [
    {
      title: isFactoryAccount ? '子工序名称 / 自定义单价' : '子工序名称',
      key: 'subprocessName',
      render: (_: unknown, row: TableRow) => {
        if (!row.entry.enabled || row.subprocess === null) {
          return (
            <span style={{ color: '#9ca3af', fontSize: 12, paddingLeft: 8 }}>
              使用系统默认节点 — 开启右侧开关可自定义
            </span>
          );
        }
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
              <Text style={{ fontSize: 11, color: '#9ca3af', width: 18, flexShrink: 0 }}>
                {row.subIndex + 1}.
              </Text>
              <Input
                value={row.subprocess.name}
                placeholder={`子工序名称 ${row.subIndex + 1}`}
                onChange={e => updateSubProcessName(row.parentNode.stageKey, row.subprocess!.id, e.target.value)}
                size="small"
                maxLength={30}
                status={!row.subprocess.name.trim() ? 'error' : undefined}
                style={{ flex: 1 }}
              />
              <Button type="text" size="small" icon={<ArrowUpOutlined />}
                disabled={row.subIndex === 0}
                onClick={() => moveSubProcess(row.parentNode.stageKey, row.subIndex, -1)}
                style={{ padding: '0 3px', color: '#6b7280' }}
              />
              <Button type="text" size="small" icon={<ArrowDownOutlined />}
                disabled={row.subIndex === row.totalInParent - 1}
                onClick={() => moveSubProcess(row.parentNode.stageKey, row.subIndex, 1)}
                style={{ padding: '0 3px', color: '#6b7280' }}
              />
              <Tooltip title={row.totalInParent <= 1 ? '父节点至少保留 1 个子工序' : '删除'}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                  disabled={row.totalInParent <= 1}
                  onClick={() => removeSubProcess(row.parentNode.stageKey, row.subprocess!.id)}
                  style={{ padding: '0 3px' }}
                />
              </Tooltip>
            </div>
            {isFactoryAccount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 26, marginTop: 4 }}>
                <InputNumber
                  value={row.subprocess.unitPrice}
                  min={0}
                  max={99999}
                  precision={2}
                  prefix="¥"
                  size="small"
                  placeholder="自定义单价"
                  style={{ width: 130 }}
                  onChange={v => updateSubProcessUnitPrice(row.parentNode.stageKey, row.subprocess!.id, v ?? undefined)}
                />
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>厂方内部参考，不参与结算</Text>
              </div>
            )}
          </>
        );
      },
    },
    {
      title: '进度节点',
      key: 'stage',
      width: '50%',
      onCell: (row: TableRow) => ({
        rowSpan: row.rowSpan,
        style: {
          background: ACCENT_LIGHT,
          borderLeft: `3px solid ${ACCENT}`,
          verticalAlign: 'middle' as const,
          textAlign: 'center' as const,
          padding: '8px 6px',
        },
      }),
      render: (_: unknown, row: TableRow) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <Tag style={{ background: ACCENT, color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, margin: 0 }}>
            {row.parentNode.name}
          </Tag>
          <span style={{ fontSize: 12, color: '#999' }}>
            {row.entry.enabled && row.entry.subProcesses.length > 0
              ? `${row.entry.subProcesses.length} 个子工序`
              : '未启用'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, color: row.entry.enabled ? ACTIVE_COLOR : '#9ca3af' }}>
              {row.entry.enabled ? '已启用' : '已关闭'}
            </Text>
            <Switch
              size="small"
              checked={row.entry.enabled}
              onChange={c => toggleEnabled(row.parentNode.stageKey, c)}
            />
          </div>
          {row.entry.enabled && (
            <Button type="link" size="small" icon={<PlusOutlined />}
              onClick={() => addSubProcess(row.parentNode.stageKey)}
              style={{ fontSize: 12, padding: 0 }}
            >
              添加
            </Button>
          )}
        </div>
      ),
    },
  ];

  function handleSave() {
    const hasEmptyName = Object.values(localConfig).some(
      e => e.enabled && e.subProcesses.some(s => !s.name.trim()),
    );
    const hasEnabledWithoutSub = Object.values(localConfig).some(
      e => e.enabled && e.subProcesses.length === 0,
    );
    if (hasEnabledWithoutSub) { message.warning('已启用的父节点至少保留 1 个子工序'); return; }
    if (hasEmptyName) { message.warning('已启用节点存在空白子工序名称，请先补全'); return; }
    const cleaned: SubProcessRemapConfig = {};
    Object.entries(localConfig).forEach(([key, entry]) => {
      if (entry.enabled && entry.subProcesses.length > 0) cleaned[key] = entry;
    });
    onSave(cleaned);
  }

  const title = record
    ? `子工序配置 — ${(record as any).orderNo ?? (record as any).productionOrderNo ?? record.id}`
    : '子工序配置';

  return (
    <ResizableModal title={title} open={visible} onCancel={onClose} width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)} destroyOnHidden footer={null}>
      {/* ══ 顶部操作栏 ══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, padding: '8px 12px',
        background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6,
      }}>
        <span style={{ fontSize: 12, color: '#595959' }}>
          开启右侧开关后可自定义子工序，仅影响本订单扫码节点
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={onClose}>取消</Button>
          <Button size="small" type="primary" loading={saving} onClick={handleSave}>保存</Button>
        </div>
      </div>

      {parentNodes.length === 0 ? (
        <Empty description="暂无可配置的父节点" />
      ) : (
        <ResizableTable<TableRow>
          storageKey="subprocess-remap-table"
          dataSource={tableRows}
          columns={columns}
          pagination={false}
          size="small"
          bordered
          rowKey="key"
          scroll={{ x: 600 }}
        />
      )}
    </ResizableModal>
  );
}
