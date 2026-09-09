import React, { useCallback, useMemo, useState } from 'react';
import { Button, Checkbox, Select } from 'antd';
import type { BundleRecord, BundleDelegatePayload } from './types';

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
  bundles, scannedBundleIds, factories, users, disableEdit, saving, onBundleDelegate, nodeInfo,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [delegateType, setDelegateType] = useState<'factory' | 'person'>('factory');
  const [factoryId, setFactoryId] = useState<string | undefined>();
  const [assigneeId, setAssigneeId] = useState<string | undefined>();

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
    });
    setSelectedIds([]);
    setFactoryId(undefined);
    setAssigneeId(undefined);
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
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
        }}>
          {nodeInfo}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>菲号委派</span>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedIds.length > 0 && !allSelected}
          onChange={(e) => handleToggleAll(e.target.checked)}
          disabled={disableEdit || selectableBundles.length === 0}
        >
          全选可选菲号
        </Checkbox>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
          已选 <strong style={{ color: 'var(--color-primary)' }}>{selectedIds.length}</strong> 扎 ·{' '}
          <strong style={{ color: 'var(--color-primary)' }}>{selectedQuantity}</strong> 件 / 可选 {selectableBundles.length} 扎
        </span>
      </div>

      <div
        style={{
          maxHeight: 300,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 8,
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
            return (
              <div
                key={b.id}
                onClick={() => { if (!disableEdit && !blocked) handleToggleOne(b.id, !checked); }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '6px 8px',
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
                  <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    菲号 {b.bundleNo ?? '-'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {b.color || '-'} / {b.size || '-'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {b.quantity ?? 0} 件 · {BUNDLE_STATUS_LABEL[b.status ?? ''] ?? b.status ?? '-'}
                  </div>
                  {currentDelegate && currentDelegate !== '-' && (
                    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      委派：{currentDelegate}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Select
          value={delegateType}
          onChange={(v) => { setDelegateType(v); setFactoryId(undefined); setAssigneeId(undefined); }}
          options={[
            { value: 'factory', label: '委派工厂' },
            { value: 'person', label: '委派人员' },
          ]}
          disabled={disableEdit}
          style={{ width: 110 }}
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
            style={{ minWidth: 180 }}
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
            style={{ minWidth: 180 }}
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
  );
};

export default BundleDelegatePanel;
