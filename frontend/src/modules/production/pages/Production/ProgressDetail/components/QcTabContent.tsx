// QcTabContent — 质检 Tab 内容（菲号列表 + 批量操作）
// 抽离自原 ProcessKanbanDrawer.tsx 的 renderQcTab，保持业务逻辑不变

import React from 'react';
import {
  Badge, Button, Checkbox, Empty, Input, Space, Tag, Tooltip,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  LockOutlined, SafetyCertificateOutlined, SearchOutlined, ToolOutlined, UnlockOutlined,
} from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { STAGE_COLORS, DEFECT_CATEGORIES } from './ProcessKanbanDrawer.constants';
import type { TrackingRecord, QcFilter, BatchQcMode } from './ProcessKanbanDrawer.types';

interface QcTabContentProps {
  orderId?: string;
  qcFilter: QcFilter;
  setQcFilter: (v: QcFilter) => void;
  setSelectedIds: (v: Set<string>) => void;
  pendingQc: TrackingRecord[];
  unqualified: TrackingRecord[];
  repairDone: TrackingRecord[];
  scannedRecords: TrackingRecord[];
  filteredRecords: TrackingRecord[];
  selectableIds: string[];
  searchText: string;
  setSearchText: (v: string) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: (ids: string[]) => void;
  batchLoading: boolean;
  batchQcMode: BatchQcMode;
  setBatchQcMode: (v: BatchQcMode) => void;
  batchQcForm: FormInstance;
  handleQualityInspect: (record: TrackingRecord) => void;
  handleLock: (record: TrackingRecord) => void;
  handleUnlock: (record: TrackingRecord) => void;
  handleRepairComplete: (record: TrackingRecord) => void;
  handleBatchQualityPass: () => void;
}

const QcTabContent: React.FC<QcTabContentProps> = ({
  orderId, qcFilter, setQcFilter, setSelectedIds,
  pendingQc, unqualified, repairDone, scannedRecords,
  filteredRecords, selectableIds, searchText, setSearchText,
  selectedIds, toggleSelect, toggleSelectAll,
  batchLoading, batchQcMode, setBatchQcMode, batchQcForm,
  handleQualityInspect, handleLock, handleUnlock, handleRepairComplete,
  handleBatchQualityPass,
}) => {
  if (!orderId) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <ExclamationCircleOutlined style={{ fontSize: 48, color: 'var(--color-warning)', marginBottom: 16 }} />
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>请先选择一个订单</div>
        <div style={{ color: 'var(--color-text-tertiary)' }}>在进度详情页点击某个订单的「看板」按钮，即可对该订单的菲号进行质检</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8,
      }}>
        <Space size={12}>
          <Badge count={pendingQc.length} overflowCount={999}>
            <Button type={qcFilter === 'pending' ? 'primary' : 'default'} onClick={() => { setQcFilter('pending'); setSelectedIds(new Set()); }}>
              待质检
            </Button>
          </Badge>
          <Badge count={unqualified.length} overflowCount={999}>
            <Button danger={qcFilter === 'unqualified'} type={qcFilter === 'unqualified' ? 'primary' : 'default'} onClick={() => { setQcFilter('unqualified'); setSelectedIds(new Set()); }}>
              不合格
            </Button>
          </Badge>
          <Badge count={repairDone.length} overflowCount={999}>
            <Button type={qcFilter === 'repair_done' ? 'primary' : 'default'} onClick={() => { setQcFilter('repair_done'); setSelectedIds(new Set()); }}>
              待复检
            </Button>
          </Badge>
          <Button type={qcFilter === 'all' ? 'primary' : 'default'} onClick={() => { setQcFilter('all'); setSelectedIds(new Set()); }}>
            全部
          </Button>
        </Space>
        <Space>
          <Input
            placeholder="搜索菲号/工序/颜色/尺码"
            prefix={<SearchOutlined />}

            style={{ width: 200 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
            {scannedRecords.length} 已扫码 | {pendingQc.length} 待质检
          </span>
        </Space>
      </div>

      {qcFilter === 'pending' && pendingQc.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, padding: '10px 16px', background: '#e6f7ff', borderRadius: 8,
          border: '1px solid #91d5ff',
        }}>
          <Space>
            <Checkbox
              checked={selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))}
              indeterminate={selectableIds.some(id => selectedIds.has(id)) && !selectableIds.every(id => selectedIds.has(id))}
              onChange={() => toggleSelectAll(selectableIds)}
            >
              全选
            </Checkbox>
            {selectedIds.size > 0 && <span style={{ color: 'var(--color-info)', fontWeight: 500 }}>已选 {selectedIds.size} 条</span>}
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleBatchQualityPass}
              loading={batchLoading && batchQcMode === false}
              disabled={selectedIds.size === 0}
            >
              批量合格 ({selectedIds.size})
            </Button>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => {
                setBatchQcMode('unqualified');
                batchQcForm.setFieldsValue({
                  defectQuantity: undefined,
                  defectCategory: undefined,
                  defectProblems: undefined,
                  qualityRemark: undefined,
                  lockBundle: false,
                });
              }}
              disabled={selectedIds.size === 0}
            >
              批量不合格 ({selectedIds.size})
            </Button>
          </Space>
        </div>
      )}

      {filteredRecords.length === 0 ? (
        <Empty
          description={
            qcFilter === 'pending' ? '没有待质检的菲号' :
            qcFilter === 'unqualified' ? '没有不合格的菲号' :
            qcFilter === 'repair_done' ? '没有待复检的菲号' :
            '没有已扫码的菲号'
          }
        />
      ) : (() => {
        const sorted = [...filteredRecords].sort((a, b) => {
          const ao = a.processOrder ?? 999;
          const bo = b.processOrder ?? 999;
          if (ao !== bo) return ao - bo;
          return (a.bundleNo ?? 0) - (b.bundleNo ?? 0);
        });
        const groups: { key: string; name: string; stage: string; order: number; records: TrackingRecord[] }[] = [];
        const groupMap = new Map<string, typeof groups[0]>();
        for (const r of sorted) {
          const gk = r.processName || '未知';
          let g = groupMap.get(gk);
          if (!g) {
            g = { key: gk, name: gk, stage: r.progressStage || '其他', order: r.processOrder ?? 999, records: [] };
            groupMap.set(gk, g);
            groups.push(g);
          }
          g.records.push(r);
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groups.map((g) => {
              const selectableInGroup = g.records.filter(r => !r.qualityStatus).map(r => r.id);
              return (
                <div key={g.key} style={{ border: '1px solid var(--color-border-light)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 14px', background: 'var(--color-bg-container)', borderBottom: '1px solid var(--color-border-light)',
                  }}>
                    <Space>
                      <Tag color={STAGE_COLORS[g.stage] || undefined}>{g.stage}</Tag>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>{g.records.length} 条菲号</span>
                    </Space>
                    {qcFilter === 'pending' && selectableInGroup.length > 0 && (
                      <Checkbox
                        checked={selectableInGroup.every(id => selectedIds.has(id))}
                        indeterminate={selectableInGroup.some(id => selectedIds.has(id)) && !selectableInGroup.every(id => selectedIds.has(id))}
                        onChange={() => toggleSelectAll(selectableInGroup)}
                      >
                        全选此工序
                      </Checkbox>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {g.records.map((r) => {
                      const isPendingQc = !r.qualityStatus;
                      const isUnqualified = r.qualityStatus === 'unqualified';
                      const isRepairDone = r.repairStatus === 'repair_done';
                      const isLocked = !!r.scanBlocked;
                      const isSelected = selectedIds.has(r.id);

                      return (
                        <div
                          key={r.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px',
                            borderBottom: '1px solid var(--color-bg-subtle)',
                            background: isSelected ? '#e6f7ff' : isUnqualified ? '#F6FFED' : isLocked ? 'var(--color-bg-container)' : 'var(--color-bg-base)',
                          }}
                        >
                          {isPendingQc && qcFilter === 'pending' && (
                            <Checkbox checked={isSelected} onChange={() => toggleSelect(r.id)} />
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>#{r.bundleNo}</span>
                              {r.color && <Tag>{r.color}</Tag>}
                              {r.size && <Tag>{r.size}</Tag>}
                            </div>
                            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                              {r.quantity}件{r.unitPrice ? ` × ¥${r.unitPrice}` : ''}{r.operatorName ? ` | ${r.operatorName}` : ''}
                            </div>
                            {isUnqualified && (
                              <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Tag color="error">次品{r.defectQuantity || 0}件</Tag>
                                {r.defectCategory && <Tag>{DEFECT_CATEGORIES.find(d => d.value === r.defectCategory)?.label || r.defectCategory}</Tag>}
                                {r.defectProblems && r.defectProblems.length > 0 && r.defectProblems.map((p, i) => (
                                  <Tag key={i} color="orange">{p}</Tag>
                                ))}
                                {r.defectRemark && <Tag color="default">{r.defectRemark}</Tag>}
                                {r.repairStatus === 'pending' && <Tag color="warning">待返修</Tag>}
                                {r.repairStatus === 'repairing' && <Tag color="processing">返修中</Tag>}
                                {r.repairStatus === 'repair_done' && <Tag color="cyan">待复检</Tag>}
                                {r.qualityOperatorName && <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>质检: {r.qualityOperatorName}</span>}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {isPendingQc && (
                              <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => handleQualityInspect(r)}>
                                质检
                              </Button>
                            )}
                            {isUnqualified && !isLocked && (
                              <Tooltip title="锁定后下游扫码被阻止">
                                <Button danger icon={<LockOutlined />} onClick={() => handleLock(r)}>锁定</Button>
                              </Tooltip>
                            )}
                            {isUnqualified && (r.repairStatus === 'pending' || !r.repairStatus) && (
                              <Button icon={<ToolOutlined />} onClick={() => handleRepairComplete(r)}>返修完成</Button>
                            )}
                            {isRepairDone && (
                              <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => handleQualityInspect(r)}>
                                复检
                              </Button>
                            )}
                            {isRepairDone && isLocked && (
                              <Tooltip title="复检合格后自动解锁，也可手动解锁验收">
                                <Button icon={<UnlockOutlined />} onClick={() => handleUnlock(r)}>
                                  手动解锁
                                </Button>
                              </Tooltip>
                            )}
                            {isLocked && !isRepairDone && (
                              <Tag icon={<LockOutlined />} color="error">已锁定</Tag>
                            )}
                            {r.qualityStatus === 'qualified' && (
                              <Tag icon={<CheckCircleOutlined />} color="success">合格</Tag>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

export default QcTabContent;
