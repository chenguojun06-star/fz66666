/**
 * SubProcessRemapModal — 子工序临时重分配配置弹窗
 *
 * 使用场景：外发工厂按订单临时增删/排序父节点下的子工序用于进度追踪，
 *           不影响父节点结构、下单单价与工资结算。
 *
 * 替代 SubProcessRemapDrawer（侧边栏）改为通用弹窗组件。
 */

import React, { useState, useEffect } from 'react';
import {
  Button,
  Switch,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
  Empty,
  Divider,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  HolderOutlined,
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

// ── 颜色映射（与 mainStages 对齐）
const STAGE_COLORS: Record<string, string> = {
  procurement: '#1e40af',
  cutting: '#92400e',
  carSewing: '#065f46',
  secondaryProcess: '#5b21b6',
  tailProcess: '#9d174d',
  warehousing: '#374151',
};

// ── 生成简短 ID（避免 uuid 依赖）
function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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
}

// ────────────────────────────────────
// 单个父节点区块
// ────────────────────────────────────

interface StageBlockProps {
  node: ParentNode;
  entry: SubProcessRemapEntry;
  onChange: (entry: SubProcessRemapEntry) => void;
}

function StageBlock({ node, entry, onChange }: StageBlockProps) {
  const color = STAGE_COLORS[node.stageKey] ?? '#6b7280';

  function toggleEnabled(checked: boolean) {
    onChange({ ...entry, enabled: checked });
  }

  function addSubProcess() {
    const next: SubProcess = { id: genId(), name: '', sortOrder: entry.subProcesses.length };
    onChange({ ...entry, subProcesses: [...entry.subProcesses, next] });
  }

  function updateSubProcess(id: string, patch: Partial<SubProcess>) {
    onChange({
      ...entry,
      subProcesses: entry.subProcesses.map(s => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function removeSubProcess(id: string) {
    const filtered = entry.subProcesses
      .filter(s => s.id !== id)
      .map((s, i) => ({ ...s, sortOrder: i }));
    onChange({ ...entry, subProcesses: filtered });
  }

  function moveSubProcess(idx: number, dir: -1 | 1) {
    const arr = [...entry.subProcesses];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    onChange({
      ...entry,
      subProcesses: arr.map((s, i) => ({ ...s, sortOrder: i })),
    });
  }

  return (
    <div
      style={{
        marginBottom: 20,
        border: `1px solid ${color}30`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* 区块标题栏 — 单价已隐藏，仅显示节点名与启用开关 */}
      <div
        style={{
          background: `${color}18`,
          borderBottom: entry.enabled ? `1px solid ${color}30` : 'none',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Tag color={color} style={{ fontWeight: 600, margin: 0 }}>
          {node.name}
        </Tag>
        <div style={{ flex: 1 }} />
        <Switch
          size="small"
          checked={entry.enabled}
          onChange={toggleEnabled}
          checkedChildren="已配置"
          unCheckedChildren="关闭"
        />
      </div>

      {/* 子工序列表 */}
      {entry.enabled && (
        <div style={{ padding: '10px 14px' }}>
          {entry.subProcesses.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无子工序，点击下方「+」添加"
              style={{ margin: '8px 0' }}
            />
          ) : (
            entry.subProcesses.map((sp, idx) => (
              <div
                key={sp.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {/* 排序按钮 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button
                    type="text"
                    size="small"
                    icon={<HolderOutlined />}
                    disabled={idx === 0}
                    onClick={() => moveSubProcess(idx, -1)}
                    style={{ height: 16, padding: '0 4px', fontSize: 12 }}
                    title="上移"
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<HolderOutlined style={{ transform: 'rotate(180deg)' }} />}
                    disabled={idx === entry.subProcesses.length - 1}
                    onClick={() => moveSubProcess(idx, 1)}
                    style={{ height: 16, padding: '0 4px', fontSize: 12 }}
                    title="下移"
                  />
                </div>

                {/* 子工序名称 */}
                <Input
                  value={sp.name}
                  placeholder={`子工序名称 ${idx + 1}`}
                  onChange={e => updateSubProcess(sp.id, { name: e.target.value })}
                  style={{ flex: 1, minWidth: 0 }}
                  size="small"
                  maxLength={30}
                />

                {/* 权重比例（可选） */}
                <Tooltip title="进度权重 %（可不填，留空时系统等比分配）">
                  <InputNumber
                    value={sp.ratio}
                    min={1}
                    max={100}
                    placeholder="权重%"
                    onChange={val => updateSubProcess(sp.id, { ratio: val ?? undefined })}
                    style={{ width: 72 }}
                    size="small"
                  />
                </Tooltip>

                {/* 删除 */}
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeSubProcess(sp.id)}
                  title="删除该子工序"
                />
              </div>
            ))
          )}

          {/* 字数提示 */}
          {entry.subProcesses.length > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              共&nbsp;{entry.subProcesses.length}&nbsp;个子工序
              {entry.subProcesses.some(s => !s.name.trim()) && (
                <Text type="danger" style={{ fontSize: 11 }}>
                  &nbsp;·&nbsp;名称不能为空
                </Text>
              )}
            </Text>
          )}

          {/* 添加按钮 */}
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={addSubProcess}
            style={{ marginTop: 8, width: '100%' }}
          >
            添加子工序
          </Button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────
// 主弹窗组件
// ────────────────────────────────────

export default function SubProcessRemapModal({
  visible,
  record,
  parentNodes,
  config,
  saving,
  onSave,
  onClose,
}: Props) {
  // local editable copy
  const [localConfig, setLocalConfig] = useState<SubProcessRemapConfig>({});

  useEffect(() => {
    if (visible) {
      // 确保每个父节点都有初始 entry
      const init: SubProcessRemapConfig = {};
      parentNodes.forEach(node => {
        init[node.stageKey] = config[node.stageKey] ?? { enabled: false, subProcesses: [] };
      });
      setLocalConfig(init);
    }
  }, [visible, parentNodes, config]);

  function handleEntryChange(stageKey: string, entry: SubProcessRemapEntry) {
    setLocalConfig(prev => ({ ...prev, [stageKey]: entry }));
  }

  function handleSave() {
    // 校验：已启用的父节点所有子工序名称不能为空
    const hasEmptyName = Object.values(localConfig).some(
      e => e.enabled && e.subProcesses.some(s => !s.name.trim()),
    );
    if (hasEmptyName) {
      return; // StageBlock 内有"名称不能为空"提示，此处静默阻止
    }
    // 只保存已启用且有子工序的条目，减少存储体积
    const cleaned: SubProcessRemapConfig = {};
    Object.entries(localConfig).forEach(([key, entry]) => {
      if (entry.enabled && entry.subProcesses.length > 0) {
        cleaned[key] = entry;
      }
    });
    onSave(cleaned);
  }

  const title = record
    ? `子工序配置 — ${(record as any).orderNo ?? (record as any).productionOrderNo ?? record.id}`
    : '子工序配置';

  return (
    <ResizableModal
      title={title}
      open={visible}
      onCancel={onClose}
      width="40vw"
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存
          </Button>
        </div>
      }
    >
      {/* 说明栏 */}
      <div
        style={{
          background: '#fffbeb',
          border: '1px solid #f59e0b',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 16,
          fontSize: 12,
          lineHeight: '1.6',
          color: '#78350f',
        }}
      >
        <strong>📌 使用说明：</strong>此处仅影响进度追踪中的子步骤分组显示，
        <br />
        <strong>不修改父节点结构、下单单价，不影响工资结算。</strong>
        <br />
        如不需要子工序细分，保持"关闭"状态即可。
      </div>

      <Divider style={{ margin: '0 0 16px' }} />

      {parentNodes.length === 0 ? (
        <Empty description="暂无可配置的父节点" />
      ) : (
        parentNodes.map(node => (
          <StageBlock
            key={node.stageKey}
            node={node}
            entry={localConfig[node.stageKey] ?? { enabled: false, subProcesses: [] }}
            onChange={entry => handleEntryChange(node.stageKey, entry)}
          />
        ))
      )}
    </ResizableModal>
  );
}
