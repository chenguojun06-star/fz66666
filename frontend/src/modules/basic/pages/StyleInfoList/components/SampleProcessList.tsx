import React, { useCallback, useState, useMemo } from 'react';
import { App, Button, Drawer, Modal, Table, Tag, Form, Input, InputNumber, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined, UserAddOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import InlinePurchasePanel from '@/components/common/NodeDetailModal/InlinePurchasePanel';
import type { ProcessStageProgress, ProcessNodeInfo } from './useSampleProcessProgress';

interface SampleProcessListProps {
  stages: ProcessStageProgress[];
  loading: boolean;
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
  procurement: '#1890ff',
  cutting: '#722ed1',
  secondary: '#eb2f96',
  sewing: '#fa8c16',
  tail: '#13c2c2',
  warehousing: '#52c41a',
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
  stages, loading, orderId, orderNo,
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

  const currentStage = useMemo(() => stages.find(s => s.key === activeTab) || stages[0], [stages, activeTab]);

  const subTableData = useMemo<SubProcessRow[]>(() => {
    if (!currentStage) return [];
    const isDone = currentStage.percent >= 100;
    const isActive = currentStage.percent > 0 && currentStage.percent < 100;
    let qtyLabel = '-';
    if (currentStage.key === 'procurement') {
      qtyLabel = currentStage.subProcesses.length > 0 ? `${currentStage.subProcesses.length}种面料` : '-';
    } else if (quantity != null && quantity > 0) {
      qtyLabel = String(quantity);
    }
    if (currentStage.subProcesses.length === 0) {
      return [{
        key: currentStage.key,
        name: currentStage.label,
        processCode: currentStage.key,
        styleNo,
        color,
        size,
        quantity: qtyLabel,
        receiver: isDone ? receiver : isActive ? receiver : '-',
        time: isDone ? (receiveTime || '-') : isActive ? (receiveTime || '-') : '-',
        status: isDone ? 'completed' as const : isActive ? 'in_progress' as const : 'pending' as const,
        percent: currentStage.percent,
      }];
    }
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
  }, [currentStage, styleNo, color, size, quantity, receiver, receiveTime]);

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

  const columns = useMemo<ColumnsType<SubProcessRow>>(() => [
    {
      title: '工序',
      dataIndex: 'name',
      key: 'name',
      width: 90,
      render: (val: string, record: SubProcessRow) => {
        const icon = record.status === 'completed'
          ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12, marginRight: 4 }} />
          : record.status === 'in_progress'
            ? <PlayCircleOutlined style={{ color: STAGE_COLORS[activeTab] || '#1890ff', fontSize: 12, marginRight: 4 }} />
            : <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 12, marginRight: 4 }} />;
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
        return <Tag color="default" style={{ fontSize: 11 }}>待启动</Tag>;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          工序列表 <strong style={{ color: '#1f2937' }}>{completedCount}/{stages.length}</strong> 完成
        </span>
      </div>

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
                color: isActive ? c : isDone ? '#52c41a' : 'var(--color-text-secondary)',
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
        width="50vw"
        styles={{ body: { padding: 0 } }}
      >
        {sourceType === 'sample' && patternProductionId ? (
          <InlinePurchasePanel patternId={patternProductionId} sourceType="sample" styleNo={styleNo} />
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
