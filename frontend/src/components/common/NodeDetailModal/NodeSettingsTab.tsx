import React from 'react';
import { Alert, Button, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import { formatProcessDisplayName } from '@/utils/productionStage';
import type { NodeOperationData } from './types';

const formatDelegationTime = (value?: string) => (value ? dayjs(value).format('MM/DD') : '-');

interface NodeSettingsTabProps {
  nodeName: string;
  nodeStats?: { percent?: number };
  delegateProcessCode: string;
  processList: Array<{ id?: string; name: string; processCode?: string; code?: string; unitPrice?: number }>;
  currentNodeData: NodeOperationData;
  matchedProcess: any;
  disableEdit: boolean;
  saving: boolean;
  factories: Array<{ id: string; factoryName: string }>;
  users: Array<{ id: string; name?: string; username?: string }>;
  orderSummary: { orderNo?: string; styleNo?: string; orderQuantity?: number };
  orderNo: string;
  unitPrice?: number;
  cuttingSizeItems: Array<{ size: string; quantity: number }>;
  updateNodeData: (field: keyof NodeOperationData, value: string | number | undefined) => void;
  handleFactoryChange: (factoryId: string | undefined) => void;
  handleSave: () => void;
}

const NodeSettingsTab: React.FC<NodeSettingsTabProps> = ({
  nodeName, nodeStats, delegateProcessCode, processList,
  currentNodeData, matchedProcess, disableEdit, saving,
  factories, users, orderSummary, orderNo, unitPrice,
  cuttingSizeItems, updateNodeData, handleFactoryChange, handleSave,
}) => {
  const fixedProcessName = String(
    currentNodeData.delegateProcessName || (matchedProcess as any)?.name || (matchedProcess as any)?.processName || nodeName || ''
  ).trim();
  const fixedUnitPrice = (() => {
    if (typeof currentNodeData.delegatePrice === 'number') return currentNodeData.delegatePrice;
    const picked = Number((matchedProcess as any)?.unitPrice);
    if (Number.isFinite(picked)) return picked;
    return Number(unitPrice) || 0;
  })();
  const orderInfoLine = `${orderSummary.orderNo || orderNo || '-'}  款号：${orderSummary.styleNo || '-'}  数量：${orderSummary.orderQuantity || 0} 件`;

  return (
    <div style={{ padding: '4px 0', minHeight: 400 }}>
      <Alert
        type="info"
        showIcon
        title="可以为不同的生产节点指定执行工厂"
        style={{ marginBottom: 10 }}
      />
      <div style={{
        padding: '8px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        marginBottom: 6,
        fontSize: "var(--font-size-xs)",
        color: 'var(--color-text-secondary)'
      }}>
        订单：{orderInfoLine}
      </div>

      {cuttingSizeItems.length > 0 && (
        <div style={{
          padding: '8px 10px',
          border: '1px solid #b7eb8f',
          background: 'rgba(34, 197, 94, 0.15)',
          borderRadius: 12,
          marginBottom: 6,
          fontSize: "var(--font-size-sm)",
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap'
        }}>
          <span style={{ color: '#595959', fontWeight: 600 }}>裁剪数量：</span>
          {cuttingSizeItems.map(item => (
            <span key={item.size} style={{
              color: 'var(--color-success)',
              fontWeight: 600,
              padding: '2px 8px',
              background: 'var(--color-bg-base)',
              borderRadius: 4,
              border: '1px solid #b7eb8f'
            }}>
              {item.size}: {item.quantity}
            </span>
          ))}
          <span style={{ color: 'var(--color-success)', fontWeight: 700, marginLeft: 4 }}>
            总计: {cuttingSizeItems.reduce((sum, item) => sum + item.quantity, 0)}
          </span>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: 8,
        padding: '6px 8px',
        background: 'var(--color-bg-base)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        fontSize: "var(--font-size-xs)",
        color: 'var(--color-text-secondary)',
        fontWeight: 600,
        width: '100%',
        overflow: 'hidden',
      }}>
        <div>生产节点</div>
        <div>当前状态</div>
        <div>工序编号</div>
        <div>工序名称</div>
        <div>数量</div>
        <div>委派类型</div>
        <div>执行工厂</div>
        <div>委派人员</div>
        <div>委派单价</div>
        <div>委派时间</div>
        <div>操作</div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: 8,
        padding: '8px',
        border: '1px solid var(--color-border)',
        borderTop: 'none',
        borderRadius: '0 0 6px 6px',
        alignItems: 'center',
        marginBottom: 10,
        width: '100%',
        overflow: 'hidden',
      }}>
        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 0 }}>{nodeName || '-'}</div>
        <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>
          {typeof nodeStats?.percent === 'number'
            ? (nodeStats.percent >= 100 ? '完成' : `${Math.round(nodeStats.percent)}%`)
            : '-'}
        </div>
        <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>{delegateProcessCode || '-'}</div>
        <Select
          value={fixedProcessName || undefined}
          placeholder="选择工序"
          options={processList.map((p) => {
            const name = String((p as any)?.name || '').trim();
            const code = String((p as any)?.processCode || (p as any)?.code || (p as any)?.id || '').trim();
            return { value: name, label: formatProcessDisplayName(code, name) };
          }).filter((o) => o.value)}
          disabled
          style={{ width: '100%', minWidth: 0 }}
        />
        <InputNumber
          placeholder="数量"
          min={0}
          precision={0}
          value={typeof currentNodeData.assigneeQuantity === 'number' ? currentNodeData.assigneeQuantity : undefined}
          onChange={(v) => updateNodeData('assigneeQuantity', v)}
          disabled={disableEdit}
          style={{ width: '100%', minWidth: 0 }}
        />
        <Select
          value={currentNodeData.delegateType || 'factory'}
          onChange={(v) => {
            updateNodeData('delegateType', v);
            if (v === 'factory') {
              updateNodeData('assigneeId', undefined);
              updateNodeData('assignee', undefined);
            } else {
              updateNodeData('delegateFactoryId', undefined);
              updateNodeData('delegateFactoryName', undefined);
            }
          }}
          options={[
            { value: 'factory', label: '工厂' },
            { value: 'person', label: '人员' },
          ]}
          disabled={disableEdit}
          style={{ width: '100%', minWidth: 0 }}
        />
        <Select
          allowClear
          showSearch
          placeholder="选择工厂"
          value={currentNodeData.delegateFactoryId}
          onChange={handleFactoryChange}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          options={factories?.map(f => ({ value: f.id, label: f.factoryName })) || []}
          disabled={disableEdit || currentNodeData.delegateType === 'person'}
          style={{ width: '100%', minWidth: 0 }}
        />
        <Select
          allowClear
          showSearch
          placeholder="选择人员"
          value={currentNodeData.assigneeId}
          onChange={(v, option) => {
            updateNodeData('assigneeId', v);
            updateNodeData('assignee', (option as any)?.label || v);
          }}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          options={users.map(u => ({ value: u.id, label: u.name || u.username }))}
          disabled={disableEdit || currentNodeData.delegateType === 'factory'}
          style={{ width: '100%', minWidth: 0 }}
        />
        <Input
          prefix="¥"
          value={Number.isFinite(fixedUnitPrice) ? fixedUnitPrice.toFixed(2) : '0.00'}
          disabled
          style={{ width: '100%', minWidth: 0 }}
        />
        <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>{formatDelegationTime(currentNodeData.updatedAt)}</div>
        <Button size="small" type="primary" loading={saving} onClick={handleSave} disabled={disableEdit}>
          保存
        </Button>
      </div>

      <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--color-text-secondary)', marginBottom: 4 }}>委派历史</div>
      {currentNodeData.history && currentNodeData.history.length > 0 ? (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px' }}>
          {currentNodeData.history.slice().reverse().map((h, idx) => (
            <div key={`${h.time}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: idx === currentNodeData.history.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-primary)' }}>{h.operatorName || '-'}</div>
              <div style={{ color: 'var(--color-text-secondary)' }}>{formatDelegationTime(h.time)}</div>
              <div style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{h.changes || '-'}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          暂无委派记录
        </div>
      )}
    </div>
  );
};

export default NodeSettingsTab;
