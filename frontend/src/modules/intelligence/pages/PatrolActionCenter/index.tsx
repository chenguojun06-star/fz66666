/**
 * PatrolActionCenter — AI 巡检工单管理中心
 *
 * 让人员对 AI 自动创建的巡检工单进行二次处理（审批/拒绝/执行/撤销/反馈/关闭），
 * 形成人机闭环。
 *
 * 路由挂载：intelligence/patrol-action-center
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Modal, Rate, Tabs, Tag, message } from 'antd';
import { BrandLoading } from '@/components/common/loading';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
// D-748：操作列改用项目标准行操作组件（AP-FE-03）——主操作常驻，其余自动折叠进「更多」
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PatrolAction, PatrolSummary } from '@/services/intelligence/intelligenceApi';
// D-626：类型/目标中文标签统一到共享映射（与顶部预警面板同源，不再各维护一份漂移表）
import { PATROL_ISSUE_TYPE_LABELS as ISSUE_TYPE_LABELS, PATROL_TARGET_TYPE_LABELS as TARGET_TYPE_LABELS } from '@/services/intelligence/patrolLabels';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import { usePersistentTab } from '@/hooks/usePersistentTab';
import './index.css';

// 可触发智能采购生成的异常类型
const SMART_SOURCING_ISSUE_TYPES = ['MATERIAL_GAP', 'SOURCING_SPECIALIST_JOB'];

/**
 * D-748：列宽集中定义。
 *
 * 背景：ResizableTable 对「未显式指定 width」的列，会按表头文字长度兜底出一个 60~200px 的固定宽
 * （见 components/common/ResizableTable/utils.ts 的 computeAdaptiveWidth）。
 * 「描述」列原先没写 width，于是被按表头「描述」两个字算成 60px，
 * 而写了固定宽的列即使没内容也占着大片空白 —— 这正是「内容多的列窄、没内容的列宽」的根因。
 *
 * 现在每列宽度集中声明，且 scroll.x 由求和得出，
 * 避免「改了列宽忘了改 scroll.x」导致表格总宽小于列宽之和、列被二次压缩。
 */
const COL_WIDTH = {
  issueType: 96,
  severity: 76,
  description: 420,
  target: 168,
  remediation: 88,
  status: 96,
  executor: 104,
  createTime: 148,
  action: 160,
} as const;

const TABLE_SCROLL_X = Object.values(COL_WIDTH).reduce((sum, w) => sum + w, 0);

const SEVERITY_TAG: Record<string, { color: string; text: string }> = {
  // D-513：补 CRITICAL——数据库实有 118 条，原先缺映射直接显示英文「CRITICAL」
  CRITICAL: { color: 'magenta', text: '紧急' },
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
  const [activeTab, setActiveTab] = usePersistentTab<string>('tab', 'PENDING');
  const [modalState, setModalState] = useState<ModalState>({ type: null, action: null });
  const [submitting, setSubmitting] = useState(false);
  // D-748：记录「哪一行」正在生成智能采购——原先的全局 loading 会让所有行的该按钮一起转圈
  const [smartSourcingId, setSmartSourcingId] = useState<number | null>(null);
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
    setSmartSourcingId(action.id);
    try {
      await purchaseCartApi.generateSmartSourcing(orderNo);
      message.success('智能采购建议已生成，已加入购物车草稿');
      refreshAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '智能采购生成失败');
    } finally {
      setSmartSourcingId(null);
    }
  }, [refreshAll]);

  /**
   * D-748：构造行操作项（交给 RowActions 渲染）。
   *
   * 原实现直接往操作列塞 5~6 个 Button，把列宽撑到 280px；
   * 且 EXECUTED 分支已 push「反馈」后，函数末尾又无条件 push 一次 —— 同一行会出现两个「反馈」按钮。
   */
  const buildRowActions = useCallback((r: PatrolAction): RowAction[] => {
    const actions: RowAction[] = [];
    if (r.status === 'PENDING') {
      actions.push({ key: 'approve', label: '审批', primary: true, onClick: () => openModal('approve', r) });
      actions.push({ key: 'execute', label: '执行', primary: true, onClick: () => openModal('execute', r) });
      actions.push({ key: 'reject', label: '拒绝', danger: true, onClick: () => openModal('reject', r) });
      actions.push({ key: 'cancel', label: '撤销', onClick: () => openModal('cancel', r) });
    } else if (r.status === 'APPROVED') {
      actions.push({ key: 'execute', label: '执行', primary: true, onClick: () => openModal('execute', r) });
      actions.push({ key: 'cancel', label: '撤销', onClick: () => openModal('cancel', r) });
    } else if (r.status === 'EXECUTED' || r.status === 'AUTO_EXECUTED') {
      actions.push({ key: 'close', label: '关闭', primary: true, onClick: () => handleQuickAction('close', r) });
    } else if (r.status === 'FAILED') {
      actions.push({ key: 'execute', label: '重新执行', primary: true, onClick: () => openModal('execute', r) });
      actions.push({ key: 'cancel', label: '撤销', onClick: () => openModal('cancel', r) });
    }
    // 物料缺口/采购专家类工单：增加一键生成智能采购建议
    if (SMART_SOURCING_ISSUE_TYPES.includes(r.issueType)) {
      actions.push({
        key: 'smartSourcing',
        label: '一键生成智能采购',
        loading: smartSourcingId === r.id,
        onClick: () => handleGenerateSmartSourcing(r),
      });
    }
    // 所有状态都保留「反馈」入口，但避免与上面的分支重复
    if (!actions.some((a) => a.key === 'feedback')) {
      actions.push({ key: 'feedback', label: '反馈', onClick: () => openModal('feedback', r) });
    }
    return actions;
  }, [openModal, handleQuickAction, handleGenerateSmartSourcing, smartSourcingId]);

  const columns = useMemo<ColumnsType<PatrolAction>>(() => [
    {
      title: '异常类型',
      dataIndex: 'issueType',
      width: COL_WIDTH.issueType,
      render: (v: string) => ISSUE_TYPE_LABELS[v] || v || '-',
    },
    {
      title: '严重度',
      dataIndex: 'issueSeverity',
      width: COL_WIDTH.severity,
      render: (v: string) => {
        const cfg = SEVERITY_TAG[v] || { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      // D-748：全表唯一的长文本列，给足宽度；此前因未声明 width 被兜底成 60px
      title: '描述',
      dataIndex: 'detectedIssue',
      width: COL_WIDTH.description,
      ellipsis: true,
      render: (v: string) => <span title={v}>{v || '-'}</span>,
    },
    {
      title: '目标',
      width: COL_WIDTH.target,
      // D-513：原直接拼 `${targetType}: ${targetId}`，用户看到「order: UNKNOWN」看不懂。
      // 现：targetType 转中文；D-626 起后端富化 targetLabel（订单→订单号、样衣→款号），
      //     富化失败回落原始 ID；targetId 为空或 UNKNOWN 时显示「未关联」。
      render: (_, r) => {
        const typeLabel = TARGET_TYPE_LABELS[r.targetType] || r.targetType || '-';
        const rawId = r.targetId == null ? '' : String(r.targetId).trim();
        const idLabel = (!rawId || rawId.toUpperCase() === 'UNKNOWN') ? '未关联' : (r.targetLabel || rawId);
        return `${typeLabel}: ${idLabel}`;
      },
    },
    {
      title: '自愈类型',
      dataIndex: 'remediationType',
      width: COL_WIDTH.remediation,
      render: (v?: string) => {
        if (v === 'AUTO') return <Tag color="cyan">自动修复</Tag>;
        if (v === 'SUGGESTION') return <Tag color="blue">建议</Tag>;
        return '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: COL_WIDTH.status,
      render: (v: string) => {
        const cfg = STATUS_TAG[v] || { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '执行人',
      dataIndex: 'executedByName',
      width: COL_WIDTH.executor,
      render: (v: string, r) => r.autoExecuted === 1 ? 'AI自愈引擎' : (v || '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: COL_WIDTH.createTime,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: COL_WIDTH.action,
      fixed: 'right',
      render: (_, r) => <RowActions actions={buildRowActions(r)} maxInline={2} />,
    },
  ], [buildRowActions]);

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
      <BrandLoading spinning={loading}>
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
          scroll={{ x: TABLE_SCROLL_X }}
          showIndex={false}
          storageKey="patrol-action-center-table"
        />
      </BrandLoading>

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
