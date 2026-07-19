import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Alert, App, Button, Drawer, Modal, Table, Tag, Form, Input, InputNumber, Select, Space, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined, UserAddOutlined, EditOutlined, CloseOutlined, SaveOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import InlinePurchasePanel from '@/components/common/NodeDetailModal/InlinePurchasePanel';
import type { ProcessStageProgress, ProcessNodeInfo } from './useSampleProcessProgress';

const InlineEditableField: React.FC<{
  label: string;
  value: string;
  editable: boolean;
  onSave: (value: string) => void;
  saving?: boolean;
}> = ({ label, value, editable, onSave, saving }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (!editable) {
    return (
      <span style={{ fontSize: 13, lineHeight: '22px' }}>
        {value || '-'}
      </span>
    );
  }

  if (editing) {
    return (
      <Space size={4}>
        <input
          ref={inputRef as any}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { setEditing(false); setDraft(value); }}
          disabled={saving}
          style={{
            width: 100,
            border: '1px solid var(--color-primary)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <Tooltip title="确定">
          <Button size="small" type="link" icon={<SaveOutlined />} onClick={handleSave} loading={saving} style={{ padding: 0, color: 'var(--color-success)' }} />
        </Tooltip>
        <Tooltip title="取消">
          <Button size="small" type="link" icon={<CloseOutlined />} onClick={() => { setEditing(false); setDraft(value); }} style={{ padding: 0, color: '#999' }} />
        </Tooltip>
      </Space>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        fontSize: 13,
        lineHeight: '22px',
        borderBottom: '1px dashed var(--color-primary)',
        cursor: 'pointer',
        padding: '2px 2px',
        transition: 'background 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e6f4ff'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {value || '-'}
    </span>
  );
};

interface SampleProcessListProps {
  stages: ProcessStageProgress[];
  loading: boolean;
  needsConfig?: boolean;
  orderId: string | null;
  orderNo: string | null;
  styleNo?: string;
  color?: string;
  quantity?: number;
  size?: string;
  receiver?: string;
  receiveTime?: string;
  patternProductionId?: string;
  onCompleteProcess?: (processCode: string) => Promise<void>;
  onRefresh?: () => void;
}

function parseSizeDisplay(sizeRaw: string | undefined): string {
  if (!sizeRaw) return '-';
  if (sizeRaw.startsWith('{')) {
    try {
      const parsed = JSON.parse(sizeRaw);
      if (Array.isArray(parsed.sizes) && parsed.sizes.length > 0) {
        return parsed.sizes.join(', ');
      }
      if (Array.isArray(parsed.commonSizes) && parsed.commonSizes.length > 0) {
        return parsed.commonSizes.join(', ');
      }
    } catch {
      // ignore parse error
    }
    return '-';
  }
  return sizeRaw || '-';
}

const STAGE_COLORS: Record<string, string> = {
  procurement: 'var(--color-info)',
  cutting: 'var(--color-accent-purple)',
  secondary: '#eb2f96',
  sewing: 'var(--color-warning)',
  tail: 'var(--color-accent-cyan)',
  warehousing: 'var(--color-success)',
};

const OPERATION_TYPE_MAP: Record<string, string> = {
  procurement: 'PROCUREMENT',
  cutting: 'CUTTING',
  secondary: 'SECONDARY',
  sewing: 'SEWING',
  tail: 'TAIL',
  warehousing: 'WAREHOUSE_IN',
};

interface SubProcessRow {
  key: string;
  name: string;
  processCode: string;
  styleNo: string;
  color: string;
  size: string;
  quantity: string;
  receiver: string;
  time: string;
  status: 'completed' | 'in_progress' | 'pending';
  percent: number;
  unitPrice?: number;
}

export default function SampleProcessList({
  stages, loading, needsConfig, orderId, orderNo,
  styleNo = '', color = '', quantity, size = '',
  receiver = '', receiveTime = '',
  patternProductionId,
  onCompleteProcess, onRefresh,
}: SampleProcessListProps) {
  const { modal, message } = App.useApp();
  const [activeTab, setActiveTab] = useState<string>(stages[0]?.key || 'procurement');
  const [actioningKey, setActioningKey] = useState('');
  const [purchaseDrawerOpen, setPurchaseDrawerOpen] = useState(false);
  const sourceType = patternProductionId ? 'sample' as const : 'order' as const;
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningRow, setAssigningRow] = useState<SubProcessRow | null>(null);
  const [assignForm] = Form.useForm();
  const [assignLoading, setAssignLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  const hasScanRecords = useMemo(() => {
    return stages.some(s => s.percent > 0 || s.subProcesses.some(sp => sp.completed));
  }, [stages]);

  const currentStage = useMemo(() => stages.find(s => s.key === activeTab) || stages[0], [stages, activeTab]);

  const subTableData = useMemo<SubProcessRow[]>(() => {
    if (!currentStage) return [];
    if (needsConfig) return [];
    // 该阶段未配置子工序时返回空数组，不生成占位假工序（历史bug：切换tab会出现一行假工序，刷新消失）
    if (currentStage.subProcesses.length === 0) return [];
    const isDone = currentStage.percent >= 100;
    const isActive = currentStage.percent > 0 && currentStage.percent < 100;
    return currentStage.subProcesses.map((sub) => {
      const subDone = isDone;
      const subActive = isActive;
      let subQty = '-';
      if (currentStage.key === 'procurement') {
        subQty = '1种面料';
      } else if (quantity != null && quantity > 0) {
        subQty = String(quantity);
      }
      return {
        key: sub.id || sub.processCode || sub.name,
        name: sub.name,
        processCode: sub.processCode || sub.id || sub.name,
        styleNo,
        color,
        size,
        quantity: subQty,
        receiver: subDone ? receiver : subActive ? receiver : '-',
        time: subDone ? (receiveTime || '-') : subActive ? (receiveTime || '-') : '-',
        status: subDone ? 'completed' as const : subActive ? 'in_progress' as const : 'pending' as const,
        percent: currentStage.percent,
        unitPrice: sub.unitPrice,
      };
    });
  }, [currentStage, needsConfig, styleNo, color, size, quantity, receiver, receiveTime]);

  const handleManualComplete = useCallback(async (row: SubProcessRow) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    const opType = OPERATION_TYPE_MAP[currentStage?.key || ''] || 'PLATE';
    modal.confirm({
      title: '确认手动完成',
      content: `确定将「${row.name}」标记为完成？`,
      okText: '确认完成',
      cancelText: '取消',
      onOk: async () => {
        setActioningKey(row.key);
        try {
          const { default: api } = await import('@/utils/api');
          await api.post('/production/pattern/scan', {
            patternId: patternProductionId,
            operationType: opType,
            operatorRole: 'PLATE_WORKER',
            remark: 'PC手动完成',
            manual: true,
          });
          message.success(`${row.name}已完成`);
          if (onCompleteProcess) await onCompleteProcess(currentStage?.key || '');
          if (onRefresh) await onRefresh();
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '操作失败');
        } finally {
          setActioningKey('');
        }
      },
    });
  }, [patternProductionId, currentStage, modal, message, onCompleteProcess, onRefresh]);

  const handleUndo = useCallback(async (row: SubProcessRow) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    modal.confirm({
      title: '确认撤回',
      content: `确定撤回「${row.name}」的完成记录？`,
      okText: '确认撤回',
      cancelText: '取消',
      onOk: async () => {
        setActioningKey(row.key);
        try {
          const { default: api } = await import('@/utils/api');
          const opType = OPERATION_TYPE_MAP[currentStage?.key || ''] || '';
          const scanRes: any = await api.get(`/production/pattern/${patternProductionId}/scan-records`);
          const records = Array.isArray(scanRes?.data) ? scanRes.data : Array.isArray(scanRes) ? scanRes : [];
          const matched = records.find((r: any) =>
            r.operationType === opType || r.processName === row.name
          );
          if (matched?.id) {
            await api.delete(`/production/pattern/${patternProductionId}/scan-records/${matched.id}`);
            message.success('撤回成功');
            if (onCompleteProcess) await onCompleteProcess(currentStage?.key || '');
            if (onRefresh) await onRefresh();
          } else {
            message.warning('未找到对应的扫码记录');
          }
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '撤回失败');
        } finally {
          setActioningKey('');
        }
      },
    });
  }, [patternProductionId, currentStage, modal, message, onCompleteProcess, onRefresh]);

  const handleAssign = useCallback((row: SubProcessRow) => {
    setAssigningRow(row);
    assignForm.resetFields();
    setAssignModalOpen(true);
  }, [assignForm]);

  const handleAssignSubmit = useCallback(async () => {
    if (!patternProductionId || !assigningRow) return;
    try {
      const values = await assignForm.validateFields();
      setAssignLoading(true);
      const { default: api } = await import('@/utils/api');
      await api.put(`/production/pattern/${patternProductionId}/assignee`, {
        assignee: values.assignee,
        processName: assigningRow.name,
        processCode: assigningRow.processCode,
      });
      message.success(`已将「${assigningRow.name}」指派给 ${values.assignee}`);
      setAssignModalOpen(false);
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || e?.message || '指派失败');
    } finally {
      setAssignLoading(false);
    }
  }, [patternProductionId, assigningRow, assignForm, message, onRefresh]);

  const handlePurchaseClick = useCallback(() => {
    setPurchaseDrawerOpen(true);
  }, []);

  const handleFieldSave = useCallback(async (value: string) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    const field = savingField;
    if (!field) return;
    try {
      const { default: api } = await import('@/utils/api');
      await api.put(`/production/pattern/${patternProductionId}/basic-info`, { field, value });
      message.success(`${field === 'styleNo' ? '款号' : field === 'color' ? '颜色' : '尺码'}已更新`);
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '更新失败');
    } finally {
      setSavingField(null);
    }
  }, [patternProductionId, savingField, message, onRefresh]);

  const handleStartEdit = useCallback(() => {
    if (hasScanRecords) {
      message.warning('已有扫码记录，不可编辑基本字段');
      return;
    }
    setEditing(true);
  }, [hasScanRecords, message]);

  const columns = useMemo<ColumnsType<SubProcessRow>>(() => [
    {
      title: '工序',
      dataIndex: 'name',
      key: 'name',
      width: 90,
      render: (val: string, record: SubProcessRow) => {
        const icon = record.status === 'completed'
          ? <CheckCircleOutlined style={{ color: 'var(--color-success)', fontSize: 12, marginRight: 4 }} />
          : record.status === 'in_progress'
            ? <PlayCircleOutlined style={{ color: STAGE_COLORS[activeTab] || 'var(--color-info)', fontSize: 12, marginRight: 4 }} />
            : <ClockCircleOutlined style={{ color: 'var(--color-text-quaternary)', fontSize: 12, marginRight: 4 }} />;
        return <span>{icon}{val}</span>;
      },
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 85,
      render: (val: string) => val || '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 65,
      render: (val: string) => val ? <Tag color="blue" style={{ fontSize: 11 }}>{val}</Tag> : '-',
    },
    {
      title: '码数',
      dataIndex: 'size',
      key: 'size',
      width: 60,
      render: (val: string) => <span style={{ fontSize: 12 }}>{parseSizeDisplay(val)}</span>,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 65,
      align: 'right' as const,
      render: (val: string) => <span style={{ fontWeight: 600 }}>{val}</span>,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (v: number | null | undefined) =>
        v != null && v > 0 ? `¥${Number(v).toFixed(2)}` : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>,
    },
    {
      title: '领取人',
      dataIndex: 'receiver',
      key: 'receiver',
      width: 65,
      render: (val: string) => val || '-',
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 100,
      render: (val: string) => <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{val || '-'}</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 65,
      render: (_: any, record: SubProcessRow) => {
        if (record.status === 'completed') return <Tag color="success" style={{ fontSize: 11 }}>已完成</Tag>;
        if (record.status === 'in_progress') return <Tag color="processing" style={{ fontSize: 11 }}>{record.percent}%</Tag>;
        return <Tag color="default" style={{ fontSize: 11 }}>待领取</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: SubProcessRow) => {
        const actions: RowAction[] = [];
        actions.push({
          key: 'assign',
          label: '指派',
          onClick: () => handleAssign(record),
        });
        if (currentStage?.key === 'procurement' && record.status !== 'completed') {
          actions.push({
            key: 'purchase',
            label: '采购',
            primary: true,
            onClick: handlePurchaseClick,
          });
        }
        if (record.status !== 'completed') {
          const acting = actioningKey === record.key;
          actions.push({
            key: 'complete',
            label: acting ? '完成中...' : '手动完成',
            primary: currentStage?.key !== 'procurement',
            disabled: acting,
            onClick: () => handleManualComplete(record),
          });
        }
        if (record.status === 'completed') {
          actions.push({
            key: 'undo',
            label: '撤回',
            danger: true,
            onClick: () => handleUndo(record),
          });
        }
        return <RowActions actions={actions} />;
      },
    },
  ], [activeTab, currentStage, actioningKey, handleManualComplete, handleUndo, handleAssign, handlePurchaseClick]);

  const completedCount = stages.filter(s => s.percent >= 100).length;

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          工序列表 <strong style={{ color: '#1f2937' }}>{completedCount}/{stages.length}</strong> 完成
        </span>
        {patternProductionId ? (
          <Button
            size="small"
            icon={editing ? <CloseOutlined /> : <EditOutlined />}
            onClick={() => editing ? setEditing(false) : handleStartEdit()}
            type={editing ? 'default' : 'link'}
          >
            {editing ? '取消编辑' : '编辑基本信息'}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div style={{
          background: 'var(--color-bg-container)',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>款号</span>
          <InlineEditableField
            label="款号"
            value={styleNo}
            editable
            saving={savingField === 'styleNo'}
            onSave={(v) => { setSavingField('styleNo'); handleFieldSave(v); }}
          />
          <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>颜色</span>
          <InlineEditableField
            label="颜色"
            value={color}
            editable
            saving={savingField === 'color'}
            onSave={(v) => { setSavingField('color'); handleFieldSave(v); }}
          />
          <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>尺码</span>
          <InlineEditableField
            label="尺码"
            value={parseSizeDisplay(size)}
            editable
            saving={savingField === 'size'}
            onSave={(v) => { setSavingField('size'); handleFieldSave(v); }}
          />
        </div>
      ) : (
        <div style={{
          display: 'flex',
          gap: 24,
          marginBottom: 8,
          padding: '4px 0',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
        }}>
          <span>款号: <strong style={{ color: '#1f2937' }}>{styleNo || '-'}</strong></span>
          <span>颜色: <strong style={{ color: '#1f2937' }}>{color || '-'}</strong></span>
          <span>尺码: <strong style={{ color: '#1f2937' }}>{parseSizeDisplay(size)}</strong></span>
        </div>
      )}

      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--color-border-light)',
        marginBottom: 12,
        gap: 4,
      }}>
        {stages.map((stage) => {
          const isActive = activeTab === stage.key;
          const c = STAGE_COLORS[stage.key] || '#8c8c8c';
          const isDone = stage.percent >= 100;
          return (
            <div
              key={stage.key}
              onClick={() => setActiveTab(stage.key)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? c : isDone ? 'var(--color-success)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? `2px solid ${c}` : '2px solid transparent',
                marginBottom: -2,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {isDone && <CheckCircleOutlined style={{ fontSize: 11 }} />}
              {stage.label}
              {stage.subProcesses.length > 0 && (
                <Tag color={isActive ? 'blue' : 'default'} style={{ marginLeft: 2, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                  {stage.subProcesses.length}
                </Tag>
              )}
            </div>
          );
        })}
      </div>

      {needsConfig ? (
        <Alert
          type="warning"
          showIcon
          message="该款号尚未配置子工序"
          description="请先在「款式工序配置」中添加子工序，配置后才会显示工序列表。"
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <Table<SubProcessRow>
        columns={columns}
        dataSource={subTableData}
        rowKey="key"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: 720 }}
        style={{ fontSize: 13 }}
      />

      <Drawer
        title="面辅料采购"
        open={purchaseDrawerOpen}
        onClose={() => setPurchaseDrawerOpen(false)}
        size="large"
        styles={{ wrapper: { width: '50vw' }, body: { padding: 0 } }}
      >
        {sourceType === 'sample' && patternProductionId ? (
          <InlinePurchasePanel patternId={patternProductionId} sourceType="sample" styleNo={styleNo} color={color} quantity={quantity} />
        ) : orderId ? (
          <InlinePurchasePanel orderId={orderId} orderNo={orderNo || ''} />
        ) : null}
      </Drawer>

      <Modal
        title={`指派 — ${assigningRow?.name || ''}`}
        open={assignModalOpen}
        onCancel={() => setAssignModalOpen(false)}
        onOk={handleAssignSubmit}
        confirmLoading={assignLoading}
        okText="确认指派"
        cancelText="取消"
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item name="assignee" label="指派人员" rules={[{ required: true, message: '请输入指派人员' }]}>
            <Input placeholder="输入人员姓名" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
