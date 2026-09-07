import React, { useMemo, useState } from 'react';
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
  bundles, scannedBundleIds, factories, users, disableEdit, saving, onBundleDelegate,
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

  const isBlocked = (b: BundleRecord) =>
    b.completed === true
    || b.status === 'completed'
    || b.status === 'qualified'
    || scannedBundleIds.has(b.id);

  const selectableBundles = useMemo(() => bundles.filter((b) => !isBlocked(b)), [bundles, scannedBundleIds]);

  const allSelected = selectableBundles.length > 0 && selectedIds.length === selectableBundles.length;

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
          已选 {selectedIds.length} / 可选 {selectableBundles.length} 扎
        </span>
      </div>

      <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        {bundles.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            暂无菲号数据
          </div>
        ) : (
          bundles.map((b) => {
            const blocked = isBlocked(b);
            const currentDelegate = b.assigneeName || (b.factoryId ? factoryNameById[b.factoryId] : undefined) || b.factoryName || '-';
            return (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderBottom: '1px solid var(--color-border)',
                  opacity: blocked ? 0.5 : 1,
                  background: blocked ? 'var(--color-fill-secondary, #f5f5f5)' : undefined,
                }}
              >
                <Checkbox
                  checked={selectedIds.includes(b.id)}
                  disabled={disableEdit || blocked}
                  onChange={(e) => handleToggleOne(b.id, e.target.checked)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
                    菲号 {b.bundleNo ?? '-'}
                    {/* 二维码内容（含 PO/款号/SIG 签名等）对用户无阅读价值，不再整串展示 */}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {b.color || '-'} / {b.size || '-'} / {b.quantity ?? 0} 件
                  </div>
                </div>
                <div style={{ width: 64, textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  {BUNDLE_STATUS_LABEL[b.status ?? ''] ?? b.status ?? '-'}
                </div>
                <div style={{ width: 90, textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  {currentDelegate}
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
