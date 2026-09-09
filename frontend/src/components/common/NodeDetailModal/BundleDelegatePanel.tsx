import React, { useCallback, useMemo, useState } from 'react';
import { Button, Checkbox, Select } from 'antd';
import { formatProcessDisplayName } from '@/utils/productionStage';
import type { BundleRecord, BundleDelegatePayload, ProcessPriceItem } from './types';

interface BundleDelegatePanelProps {
  bundles: BundleRecord[];
  scannedBundleIds: Set<string>;
  factories: Array<{ id?: string; factoryName: string }>;
  users: Array<{ id: string; name?: string; username?: string }>;
  disableEdit: boolean;
  saving: boolean;
  onBundleDelegate: (payload: BundleDelegatePayload) => Promise<void> | void;
  /** 节点只读信息（节点/状态/工序/单价），与菲号委派同卡片展示，避免顶部表格重复 */
  nodeInfo?: React.ReactNode;
  /** 该节点下的子工序（含单价），用于多选外发工序 */
  processOptions?: ProcessPriceItem[];
}

// 菲号状态中文映射（created=已生成未扫码；pending=分扎转移待接收；scrapped=已报废）
const BUNDLE_STATUS_LABEL: Record<string, string> = {
  created: '待生产',
  pending: '待接收',
  completed: '已完成',
  qualified: '已合格',
  unqualified: '待返修',
  repaired_waiting_qc: '待复检',
  scrapped: '已报废',
};

const BundleDelegatePanel: React.FC<BundleDelegatePanelProps> = ({
  bundles, scannedBundleIds, factories, users, disableEdit, saving, onBundleDelegate, nodeInfo, processOptions,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [delegateType, setDelegateType] = useState<'factory' | 'person'>('factory');
  const [factoryId, setFactoryId] = useState<string | undefined>();
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [processNames, setProcessNames] = useState<string[]>([]);

  // 子工序选项：label 带单价，便于逐工序核对（不选 = 整扎外发）
  const processSelectOptions = useMemo(() => (processOptions || []).map((p) => {
    const name = String(p.processName || p.name || '').trim();
    const code = String(p.processCode || p.code || p.id || '').trim();
    const price = Number(p.unitPrice || 0);
    return {
      value: name,
      label: `${formatProcessDisplayName(code, name)}${price > 0 ? ` · ¥${price.toFixed(2)}/件` : ' · 待定价'}`,
    };
  }).filter((o) => o.value), [processOptions]);

  const selectedProcessPrices = useMemo(() => processNames.map((name) => {
    const hit = (processOptions || []).find((p) => String(p.processName || p.name || '').trim() === name);
    const price = Number(hit?.unitPrice || 0);
    return { name, price };
  }), [processNames, processOptions]);

  const factoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    factories.forEach((f) => { if (f.id) map[f.id] = f.factoryName; });
    return map;
  }, [factories]);

  const isBlocked = useCallback((b: BundleRecord) =>
    b.completed === true
    || b.status === 'completed'
    || b.status === 'qualified'
    || scannedBundleIds.has(b.id), [scannedBundleIds]);

  const selectableBundles = useMemo(() => bundles.filter((b) => !isBlocked(b)), [bundles, isBlocked]);

  const allSelected = selectableBundles.length > 0 && selectedIds.length === selectableBundles.length;

  // 已勾选菲号的合计件数（顶部实时显示，勾多少显示多少件）
  const selectedQuantity = useMemo(
    () => bundles
      .filter((b) => selectedIds.includes(b.id))
      .reduce((sum, b) => sum + Number(b.quantity || 0), 0),
    [bundles, selectedIds],
  );

  const handleToggleAll = (checked: boolean) => {
    setSelectedIds(checked ? selectableBundles.map((b) => b.id) : []);
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const selectedFactory = factories.find((f) => f.id === factoryId);
  const selectedUser = users.find((u) => u.id === assigneeId);
  const targetReady = delegateType === 'factory' ? !!factoryId : !!assigneeId;

  const handleSubmit = () => {
    if (!targetReady || selectedIds.length === 0) return;
    void onBundleDelegate({
      delegateType,
      factoryId: delegateType === 'factory' ? factoryId : undefined,
      factoryName: delegateType === 'factory' ? selectedFactory?.factoryName : undefined,
      assigneeId: delegateType === 'person' ? assigneeId : undefined,
      assigneeName: delegateType === 'person' ? (selectedUser?.name || selectedUser?.username) : undefined,
      bundleIds: selectedIds,
      processNames: processNames.length > 0 ? processNames : undefined,
    });
    setSelectedIds([]);
    setFactoryId(undefined);
    setAssigneeId(undefined);
    setProcessNames([]);
  };

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: '10px 12px',
      marginTop: 10,
      background: 'var(--color-bg-base)',
    }}>
      {nodeInfo && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 8,
          marginBottom: 8,
          borderBottom: '1px solid var(--color-border)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
        }}>
          {nodeInfo}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-subtitle)', color: 'var(--color-text-primary)' }}>菲号委派</span>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedIds.length > 0 && !allSelected}
          onChange={(e) => handleToggleAll(e.target.checked)}
          disabled={disableEdit || selectableBundles.length === 0}
        >
          全选可选菲号
        </Checkbox>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          已选 <strong style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-subtitle)' }}>{selectedIds.length}</strong> 扎 ·{' '}
          <strong style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-subtitle)' }}>{selectedQuantity}</strong> 件 / 可选 {selectableBundles.length} 扎
        </span>
      </div>

      <div
        style={{
          maxHeight: 300,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
          padding: 4,
        }}
      >
        {bundles.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', gridColumn: '1 / -1' }}>
            暂无菲号数据
          </div>
        ) : (
          bundles.map((b) => {
            const blocked = isBlocked(b);
            const checked = selectedIds.includes(b.id);
            const currentDelegate = b.assigneeName || (b.factoryId ? factoryNameById[b.factoryId] : undefined) || b.factoryName || '';
            const delegateProcessText = String(b.delegateProcesses || '').trim().split(',').map((s) => s.trim()).filter(Boolean).join('、');
            return (
              <div
                key={b.id}
                onClick={() => { if (!disableEdit && !blocked) handleToggleOne(b.id, !checked); }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 10px',
                  border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: checked ? 'var(--status-processing-bg)' : 'var(--color-bg-base)',
                  borderRadius: 8,
                  opacity: blocked ? 0.55 : 1,
                  cursor: disableEdit || blocked ? 'not-allowed' : 'pointer',
                  minWidth: 0,
                }}
              >
                <Checkbox
                  checked={checked}
                  disabled={disableEdit || blocked}
                  onChange={(e) => handleToggleOne(b.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-subtitle)', fontWeight: 600 }}>
                    菲号 {b.bundleNo ?? '-'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 2 }}>
                    {b.color || '-'} / {b.size || '-'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    {b.quantity ?? 0} 件 · {BUNDLE_STATUS_LABEL[b.status ?? ''] ?? b.status ?? '-'}
                  </div>
                  {currentDelegate && currentDelegate !== '-' && (
                    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      委派：{currentDelegate}
                    </div>
                  )}
                  {delegateProcessText && (
                    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      工序：{delegateProcessText}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        background: 'var(--color-bg-page)',
        border: '1px solid var(--color-border-light)',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}>外发工序</span>
          <Select
            mode="multiple"
            allowClear
            showSearch
            placeholder="不选 = 整扎外发；可多选子工序"
            value={processNames}
            onChange={setProcessNames}
            options={processSelectOptions}
            filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            disabled={disableEdit}
            style={{ minWidth: 320, maxWidth: 560, flex: 1, fontSize: 'var(--font-size-base)' }}
          />
        </div>
        {selectedProcessPrices.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            逐工序单价：
            {selectedProcessPrices.map((p, idx) => (
              <span key={p.name}>
                {idx > 0 ? ' · ' : ''}
                {p.name}
                <strong style={{ color: 'var(--color-primary)', marginLeft: 4 }}>
                  {p.price > 0 ? `¥${p.price.toFixed(2)}/件` : '待定价'}
                </strong>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}>
            {delegateType === 'factory' ? '执行工厂' : '委派人员'}
          </span>
          <Select
            value={delegateType}
            onChange={(v) => { setDelegateType(v); setFactoryId(undefined); setAssigneeId(undefined); }}
            options={[
              { value: 'factory', label: '委派工厂' },
              { value: 'person', label: '委派人员' },
            ]}
            disabled={disableEdit}
            style={{ width: 130, fontSize: 'var(--font-size-base)' }}
          />
          {delegateType === 'factory' ? (
            <Select
              allowClear
              showSearch
              placeholder="选择外发工厂"
              value={factoryId}
              onChange={setFactoryId}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={factories.map((f) => ({ value: f.id, label: f.factoryName }))}
              disabled={disableEdit}
              style={{ width: 260, fontSize: 'var(--font-size-base)' }}
            />
          ) : (
            <Select
              allowClear
              showSearch
              placeholder="选择人员"
              value={assigneeId}
              onChange={setAssigneeId}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={users.map((u) => ({ value: u.id, label: u.name || u.username }))}
              disabled={disableEdit}
              style={{ width: 260, fontSize: 'var(--font-size-base)' }}
            />
          )}
          <Button
            type="primary"
            loading={saving}
            disabled={disableEdit || !targetReady || selectedIds.length === 0}
            onClick={handleSubmit}
          >
            保存委派（{selectedIds.length} 扎）
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BundleDelegatePanel;
