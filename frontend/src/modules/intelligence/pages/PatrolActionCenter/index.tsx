/**
 * PatrolActionCenter — AI 巡检工单管理中心
 *
 * 让人员对 AI 自动创建的巡检工单进行二次处理（审批/拒绝/执行/撤销/反馈/关闭），
 * 形成人机闭环。
 *
 * 路由挂载：intelligence/patrol-action-center
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Rate, Space, Spin, Tabs, Tag, message } from 'antd';
import { CheckOutlined, CloseOutlined, PlayCircleOutlined, UndoOutlined, MessageOutlined, StopOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PatrolAction, PatrolSummary } from '@/services/intelligence/intelligenceApi';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import './index.css';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  DEADLINE_RISK: '交期风险',
  FACTORY_SILENCE: '工厂沉默',
  QUALITY_SPIKE: '质量异常',
  STAGNANT: '进度停滞',
  CORRELATED_RISK: '多重风险',
  MATERIAL_GAP: '物料缺口',
  SOURCING_SPECIALIST_JOB: '采购专家',
  PAYROLL_ANOMALY: '工资异常',
  OUTSOURCE_TIMEOUT: '外发超时',
  WAREHOUSE_DIFF: '入库差异',
};

// 可触发智能采购生成的异常类型
const SMART_SOURCING_ISSUE_TYPES = ['MATERIAL_GAP', 'SOURCING_SPECIALIST_JOB'];

const SEVERITY_TAG: Record<string, { color: string; text: string }> = {
  HIGH: { color: 'red', text: '高危' },
  MEDIUM: { color: 'orange', text: '中危' },
  LOW: { color: 'default', text: '低危' },
};

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'blue', text: '待处理' },
  APPROVED: { color: 'green', text: '已审批' },
  REJECTED: { color: 'red', text: '已拒绝' },
  EXECUTED: { color: 'green', text: '已执行' },
  AUTO_EXECUTED: { color: 'cyan', text: 'AI自动执行' },
  FAILED: { color: 'red', text: '执行失败' },
  CANCELLED: { color: 'default', text: '已撤销' },
  CLOSED: { color: 'default', text: '已关闭' },
};

type ModalType = 'approve' | 'reject' | 'execute' | 'cancel' | 'feedback' | null;

interface ModalState {
  type: ModalType;
  action: PatrolAction | null;
}

const DEFAULT_SUMMARY: PatrolSummary = { pendingCount: 0, autoExecutedToday: 0, highRiskPending: 0, recentActions: [] };

const PatrolActionCenter: React.FC = () => {
  const [list, setList] = useState<PatrolAction[]>([]);
  const [summary, setSummary] = useState<PatrolSummary>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('PENDING');
  const [modalState, setModalState] = useState<ModalState>({ type: null, action: null });
  const [submitting, setSubmitting] = useState(false);
  const [smartSourcingLoading, setSmartSourcingLoading] = useState(false);
  const [form] = Form.useForm();

  const loadList = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const data = await intelligenceApi.getPatrolActionsByStatus(status, 200);
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error('加载巡检工单失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const s = await intelligenceApi.getPatrolSummary();
      setSummary(s ?? DEFAULT_SUMMARY);
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    loadList(activeTab === 'ALL' ? undefined : activeTab);
  }, [activeTab, loadList]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const refreshAll = useCallback(() => {
    loadList(activeTab === 'ALL' ? undefined : activeTab);
    loadSummary();
  }, [activeTab, loadList, loadSummary]);

  const openModal = useCallback((type: ModalType, action: PatrolAction) => {
    setModalState({ type, action });
    form.resetFields();
  }, [form]);

  const closeModal = useCallback(() => {
    setModalState({ type: null, action: null });
    form.resetFields();
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!modalState.action || !modalState.type) return;
    const actionId = modalState.action.id;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      switch (modalState.type) {
        case 'approve':
          await intelligenceApi.approvePatrolAction(actionId, values.remark);
          message.success('已审批通过');
          break;
        case 'reject':
          await intelligenceApi.rejectPatrolAction(actionId, values.reason);
          message.success('已拒绝');
          break;
        case 'execute':
          await intelligenceApi.executePatrolAction(actionId, values.result);
          message.success('已执行');
          break;
        case 'cancel':
          await intelligenceApi.cancelPatrolAction(actionId, values.reason);
          message.success('已撤销');
          break;
        case 'feedback':
          await intelligenceApi.submitPatrolFeedback(actionId, values.feedback || '', values.rating || 5);
          message.success('反馈已提交');
          break;
      }
      closeModal();
      refreshAll();
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // 表单校验错误
      message.error('操作失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [modalState, form, closeModal, refreshAll]);

  const handleQuickAction = useCallback(async (type: 'close', action: PatrolAction) => {
    try {
      if (type === 'close') {
        await intelligenceApi.closePatrolAction(action.id);
        message.success('已关闭');
        refreshAll();
      }
    } catch {
      message.error('操作失败');
    }
  }, [refreshAll]);

  // 一键生成智能采购建议：依据工单 targetId（订单号）调用智能采购生成
  const handleGenerateSmartSourcing = useCallback(async (action: PatrolAction) => {
    const orderNo = String(action.targetId || '').trim();
    if (!orderNo) {
      message.warning('工单缺少目标订单号，无法生成采购建议');
      return;
    }
    setSmartSourcingLoading(true);
    try {
      await purchaseCartApi.generateSmartSourcing(orderNo);
      message.success('智能采购建议已生成，已加入购物车草稿');
      refreshAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '智能采购生成失败');
    } finally {
      setSmartSourcingLoading(false);
    }
  }, [refreshAll]);

  const columns = useMemo<ColumnsType<PatrolAction>>(() => [
    {
      title: '异常类型',
      dataIndex: 'issueType',
      width: 110,
      render: (v: string) => ISSUE_TYPE_LABELS[v] || v || '-',
    },
    {
      title: '严重度',
      dataIndex: 'issueSeverity',
      width: 90,
      render: (v: string) => {
        const cfg = SEVERITY_TAG[v] || { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '描述',
      dataIndex: 'detectedIssue',
      ellipsis: true,
      render: (v: string) => <span title={v}>{v || '-'}</span>,
    },
    {
      title: '目标',
      width: 180,
      render: (_, r) => `${r.targetType || '-'}: ${r.targetId || '-'}`,
    },
    {
      title: '自愈类型',
      dataIndex: 'remediationType',
      width: 100,
      render: (v?: string) => {
        if (v === 'AUTO') return <Tag color="cyan">自动修复</Tag>;
        if (v === 'SUGGESTION') return <Tag color="blue">建议</Tag>;
        return '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: string) => {
        const cfg = STATUS_TAG[v] || { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '执行人',
      dataIndex: 'executedByName',
      width: 120,
      render: (v: string, r) => r.autoExecuted === 1 ? 'AI自愈引擎' : (v || '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_, r) => {
        const btns: React.ReactNode[] = [];
        if (r.status === 'PENDING') {
          btns.push(<Button size="small" type="link" icon={<CheckOutlined />} onClick={() => openModal('approve', r)}>审批</Button>);
          btns.push(<Button size="small" type="link" danger icon={<CloseOutlined />} onClick={() => openModal('reject', r)}>拒绝</Button>);
          btns.push(<Button size="small" type="link" icon={<PlayCircleOutlined />} onClick={() => openModal('execute', r)}>执行</Button>);
          btns.push(<Button size="small" type="link" icon={<UndoOutlined />} onClick={() => openModal('cancel', r)}>撤销</Button>);
        } else if (r.status === 'APPROVED') {
          btns.push(<Button size="small" type="link" icon={<PlayCircleOutlined />} onClick={() => openModal('execute', r)}>执行</Button>);
          btns.push(<Button size="small" type="link" icon={<UndoOutlined />} onClick={() => openModal('cancel', r)}>撤销</Button>);
        } else if (r.status === 'EXECUTED' || r.status === 'AUTO_EXECUTED') {
          btns.push(<Button size="small" type="link" icon={<MessageOutlined />} onClick={() => openModal('feedback', r)}>反馈</Button>);
          btns.push(<Button size="small" type="link" icon={<StopOutlined />} onClick={() => handleQuickAction('close', r)}>关闭</Button>);
        } else if (r.status === 'FAILED') {
          btns.push(<Button size="small" type="link" icon={<PlayCircleOutlined />} onClick={() => openModal('execute', r)}>重新执行</Button>);
          btns.push(<Button size="small" type="link" icon={<UndoOutlined />} onClick={() => openModal('cancel', r)}>撤销</Button>);
        }
        // 物料缺口/采购专家类工单：增加一键生成智能采购建议按钮
        if (SMART_SOURCING_ISSUE_TYPES.includes(r.issueType)) {
          btns.push(<Button size="small" type="link" icon={<RobotOutlined />} loading={smartSourcingLoading} onClick={() => handleGenerateSmartSourcing(r)}>一键生成智能采购</Button>);
        }
        btns.push(<Button size="small" type="link" icon={<MessageOutlined />} onClick={() => openModal('feedback', r)}>反馈</Button>);
        return <Space size={0} wrap>{btns}</Space>;
      },
    },
  ], [openModal, handleQuickAction, handleGenerateSmartSourcing, smartSourcingLoading]);

  const modalTitle = useMemo(() => {
    switch (modalState.type) {
      case 'approve': return '审批通过';
      case 'reject': return '拒绝工单';
      case 'execute': return '执行工单';
      case 'cancel': return '撤销工单';
      case 'feedback': return '提交反馈';
      default: return '';
    }
  }, [modalState.type]);

  const renderModalBody = () => {
    if (!modalState.type) return null;
    switch (modalState.type) {
      case 'approve':
        return <Form.Item name="remark" label="审批备注"><Input.TextArea rows={3} placeholder="选填" maxLength={200} /></Form.Item>;
      case 'reject':
        return <Form.Item name="reason" label="拒绝原因" rules={[{ required: true, message: '请输入拒绝原因' }]}><Input.TextArea rows={3} maxLength={200} /></Form.Item>;
      case 'execute':
        return <Form.Item name="result" label="执行结果"><Input.TextArea rows={3} placeholder="选填，记录执行结果" maxLength={500} /></Form.Item>;
      case 'cancel':
        return <Form.Item name="reason" label="撤销原因" rules={[{ required: true, message: '请输入撤销原因' }]}><Input.TextArea rows={3} maxLength={200} /></Form.Item>;
      case 'feedback':
        return (
          <>
            <Form.Item name="rating" label="评分" initialValue={5} rules={[{ required: true, message: '请评分' }]}>
              <Rate />
            </Form.Item>
            <Form.Item name="feedback" label="反馈内容"><Input.TextArea rows={3} maxLength={500} /></Form.Item>
          </>
        );
    }
  };

  return (
    <div className="patrol-center">
      <Spin spinning={loading}>
        <div className="patrol-summary">
          <Card className="patrol-summary-card">
            <div className="patrol-summary-value">{summary.pendingCount}</div>
            <div className="patrol-summary-label">待处理数量</div>
          </Card>
          <Card className="patrol-summary-card">
            <div className="patrol-summary-value">{summary.autoExecutedToday}</div>
            <div className="patrol-summary-label">今日自动执行</div>
          </Card>
          <Card className="patrol-summary-card">
            <div className="patrol-summary-value" style={{ color: 'var(--color-danger, #ff4d4f)' }}>{summary.highRiskPending}</div>
            <div className="patrol-summary-label">高危待处理</div>
          </Card>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'PENDING', label: '待审批' },
            { key: 'EXECUTED', label: '已执行' },
            { key: 'CANCELLED', label: '已撤销' },
            { key: 'ALL', label: '全部' },
          ]}
        />

        <ResizableTable<PatrolAction>
          rowKey="id"
          columns={columns}
          dataSource={list}
          scroll={{ x: 1200 }}
          showIndex={false}
          storageKey="patrol-action-center-table"
        />
      </Spin>

      <Modal
        title={modalTitle}
        open={modalState.type !== null}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          {renderModalBody()}
        </Form>
      </Modal>
    </div>
  );
};

export default PatrolActionCenter;
