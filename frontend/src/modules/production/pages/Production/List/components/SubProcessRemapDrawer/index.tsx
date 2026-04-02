/**
 * SubProcessRemapDrawer — 子工序临时重分配配置面板
 *
 * v2 重构要点：
 *   - Collapse 树状结构：父节点为可展开面板，子工序直接列于其下，父子关系清晰
 *   - 移除 Switch：点击父节点标题即可展开/折叠，添加子工序后自动标记为"已配置"
 *   - 修复 DOM 嵌套警告：Drawer 添加 getContainer={() => document.body}
 *   - 不影响父节点结构、下单单价与工资结算
 */

import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Button,
  Badge,
  Collapse,
  Input,
  InputNumber,
  Tag,
  Typography,
  Empty,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import type { ProductionOrder } from '@/types/production';
import type {
  SubProcess,
  SubProcessRemapConfig,
  SubProcessRemapEntry,
  ParentNode,
} from '../../hooks/useSubProcessRemap';
import { STAGE_ACCENT } from '@/utils/stageStyles';

const { Text } = Typography;

// ── 图标映射
const STAGE_ICONS: Record<string, string> = {
  procurement:      '',
  cutting:          '',
  carSewing:        '',
  secondaryProcess: '',
  tailProcess:      '',
  warehousing:      '',
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
// 父节点展开后内部的子工序编辑器
// ────────────────────────────────────

interface EntryEditorProps {
  node: ParentNode;
  entry: SubProcessRemapEntry;
  onChange: (entry: SubProcessRemapEntry) => void;
}

function EntryEditor({ node, entry, onChange }: EntryEditorProps) {
  const color = STAGE_ACCENT;

  function addSubProcess() {
    const next: SubProcess = {
      id: genId(),
      name: '',
      sortOrder: entry.subProcesses.length,
    };
    onChange({ enabled: true, subProcesses: [...entry.subProcesses, next] });
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
    onChange({ enabled: filtered.length > 0, subProcesses: filtered });
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const arr = [...entry.subProcesses];
    [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
    onChange({ ...entry, subProcesses: arr.map((s, i) => ({ ...s, sortOrder: i })) });
  }

  function moveDown(idx: number) {
    if (idx >= entry.subProcesses.length - 1) return;
    const arr = [...entry.subProcesses];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    onChange({ ...entry, subProcesses: arr.map((s, i) => ({ ...s, sortOrder: i })) });
  }

  return (
    <div>
      {/* 单价只读说明 */}
      {node.unitPrice !== undefined && (
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            &nbsp;父节点单价&nbsp;
            <Text strong style={{ fontSize: 12 }}>¥{node.unitPrice}</Text>
            &nbsp;—&nbsp;不可修改，不影响工资结算
          </Text>
        </div>
      )}

      {/* 子工序列表（左侧竖线体现父子关系） */}
      <div
        style={{
          borderLeft: `3px solid ${color}50`,
          paddingLeft: 14,
          marginBottom: 10,
          minHeight: 24,
        }}
      >
        {entry.subProcesses.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            ─── 暂无子工序，点击下方「添加子工序」
          </Text>
        ) : (
          entry.subProcesses.map((sp, idx) => (
            <div
              key={sp.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 7,
              }}
            >
              {/* 序号 */}
              <Text
                style={{
                  fontSize: 11,
                  color,
                  fontWeight: 700,
                  minWidth: 18,
                  textAlign: 'right',
                }}
              >
                {idx + 1}.
              </Text>

              {/* 名称输入框 */}
              <Input
                value={sp.name}
                placeholder={`子工序 ${idx + 1}`}
                onChange={e => updateSubProcess(sp.id, { name: e.target.value })}
                size="small"
                maxLength={30}
                style={{
                  flex: 1,
                  minWidth: 0,
                  borderColor: sp.name.trim() ? undefined : '#ff4d4f',
                }}
              />

              {/* 进度权重（可选） */}
              <Tooltip title="进度权重 %（可选，留空时平均分配）">
                <InputNumber
                  value={sp.ratio}
                  min={1}
                  max={100}
                  placeholder="%"
                  onChange={val => updateSubProcess(sp.id, { ratio: val ?? undefined })}
                  style={{ width: 60 }}
                  size="small"
                />
              </Tooltip>

              {/* 上移 */}
              <Button
                size="small"
                type="text"
                icon={<ArrowUpOutlined />}
                disabled={idx === 0}
                onClick={() => moveUp(idx)}
                style={{ padding: '0 3px' }}
              />

              {/* 下移 */}
              <Button
                size="small"
                type="text"
                icon={<ArrowDownOutlined />}
                disabled={idx >= entry.subProcesses.length - 1}
                onClick={() => moveDown(idx)}
                style={{ padding: '0 3px' }}
              />

              {/* 删除 */}
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeSubProcess(sp.id)}
                style={{ padding: '0 3px' }}
              />
            </div>
          ))
        )}
      </div>

      {/* 添加子工序按钮 */}
      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        onClick={addSubProcess}
        style={{ width: '100%' }}
      >
        在「{node.name}」下添加子工序
      </Button>
    </div>
  );
}

// ────────────────────────────────────
// 主 Drawer 组件
// ────────────────────────────────────

export default function SubProcessRemapDrawer({
  visible,
  record,
  parentNodes,
  config,
  saving,
  onSave,
  onClose,
}: Props) {
  const [localConfig, setLocalConfig] = useState<SubProcessRemapConfig>({});
  const [activePanels, setActivePanels] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      const init: SubProcessRemapConfig = {};
      parentNodes.forEach(node => {
        init[node.stageKey] = config[node.stageKey] ?? { enabled: false, subProcesses: [] };
      });
      setLocalConfig(init);
      // 默认展开已有配置的节点；若全未配置则默认展开第一个，提示用户入口
      const configured = parentNodes
        .filter(n => (config[n.stageKey]?.subProcesses?.length ?? 0) > 0)
        .map(n => n.stageKey);
      setActivePanels(
        configured.length > 0
          ? configured
          : parentNodes.length > 0
          ? [parentNodes[0].stageKey]
          : [],
      );
    }
  }, [visible, parentNodes, config]);

  function handleEntryChange(stageKey: string, entry: SubProcessRemapEntry) {
    setLocalConfig(prev => ({ ...prev, [stageKey]: entry }));
  }

  function handleSave() {
    const hasEmptyName = Object.values(localConfig).some(
      e => e.enabled && e.subProcesses.some(s => !s.name.trim()),
    );
    if (hasEmptyName) return;
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

  // 构建 Collapse items（树状父子结构）
  const collapseItems = parentNodes.map(node => {
    const color   = STAGE_ACCENT;
    const icon    = STAGE_ICONS[node.stageKey]  ?? '●';
    const entry   = localConfig[node.stageKey] ?? { enabled: false, subProcesses: [] };
    const count   = entry.subProcesses.length;
    const hasErr  = count > 0 && entry.subProcesses.some(s => !s.name.trim());

    return {
      key: node.stageKey,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <Text strong style={{ color, fontSize: 14 }}>
            {node.name}
          </Text>
          <div style={{ flex: 1 }} />
          {count > 0 ? (
            <Badge
              count={count}
              style={{ backgroundColor: hasErr ? '#ff4d4f' : color }}
              title={`已配置 ${count} 个子工序`}
            />
          ) : (
            <Tag style={{ margin: 0, fontSize: 11, color: '#9ca3af', borderColor: '#e5e7eb' }}>
              未配置
            </Tag>
          )}
        </div>
      ),
      style: {
        marginBottom: 6,
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        overflow: 'hidden',
      },
      children: (
        <EntryEditor
          node={node}
          entry={entry}
          onChange={newEntry => handleEntryChange(node.stageKey, newEntry)}
        />
      ),
    };
  });

  return (
    <Drawer
      title={title}
      open={visible}
      onClose={onClose}
      width={540}
      destroyOnClose
      getContainer={() => document.body}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存配置
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
          lineHeight: 1.7,
          color: '#78350f',
        }}
      >
        <strong> 使用方法：</strong>
        点击左侧父工序展开 → 在该节点下添加子工序步骤。
        <br />
        <strong>不修改父节点结构、不影响下单单价与工资结算。</strong>
      </div>

      {parentNodes.length === 0 ? (
        <Empty description="暂无可配置的父节点" />
      ) : (
        <Collapse
          activeKey={activePanels}
          onChange={keys =>
            setActivePanels(Array.isArray(keys) ? (keys as string[]) : [keys as string])
          }
          expandIconPosition="start"
          style={{ background: 'transparent' }}
          items={collapseItems}
        />
      )}
    </Drawer>
  );
}
