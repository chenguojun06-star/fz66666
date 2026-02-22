import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Tag, Space, message, Form, Input, InputNumber, Modal, Select, Card, Typography, Badge, Alert, QRCode, Row, Col, Progress, Descriptions, Divider, Radio, Statistic } from 'antd';
import { PlusOutlined, CrownOutlined, TeamOutlined, CopyOutlined, QrcodeOutlined, DollarOutlined, ExclamationCircleOutlined, MessageOutlined, DashboardOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import { useAuth } from '@/utils/AuthContext';
import tenantService from '@/services/tenantService';
import type { TenantInfo, PlanDefinition, BillingRecord } from '@/services/tenantService';
import feedbackService from '@/services/feedbackService';
import type { UserFeedback, FeedbackStats } from '@/services/feedbackService';
import systemStatusService from '@/services/systemStatusService';
import type { SystemStatusOverview } from '@/services/systemStatusService';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// ========== 客户管理 Tab ==========
const TenantListTab: React.FC = () => {
  const [data, setData] = useState<TenantInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusTab, setStatusTab] = useState<string>('');
  const [queryParams, setQueryParams] = useState({ page: 1, pageSize: 20, tenantName: '', status: '' });
  const modal = useModal<TenantInfo>();
  const qrModal = useModal<TenantInfo>();
  const resetPwdModal = useModal<TenantInfo>();
  const rejectModal = useModal<TenantInfo>();
  const [form] = Form.useForm();
  const [resetPwdForm] = Form.useForm();
  const [rejectReasonForm] = Form.useForm();
  const [resettingPwd, setResettingPwd] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const approveModal = useModal<TenantInfo>();
  const [approveForm] = Form.useForm();

  const PLAN_OPTIONS = [
    { value: 'TRIAL', label: '免费试用', description: '5用户 / 1GB存储' },
    { value: 'BASIC', label: '基础版 ¥199/月', description: '20用户 / 5GB存储' },
    { value: 'PRO', label: '专业版 ¥499/月', description: '50用户 / 20GB存储' },
    { value: 'ENTERPRISE', label: '企业版 ¥999/月', description: '200用户 / 100GB存储' },
  ];

  const TRIAL_OPTIONS = [
    { value: 15, label: '15天' },
    { value: 30, label: '30天' },
    { value: 90, label: '90天' },
    { value: 0, label: '永久免费' },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantService.listTenants(queryParams);
      const d = res?.data || res;
      setData(d?.records || []);
      setTotal(d?.total || 0);
    } catch {
      message.error('加载租户列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await tenantService.createTenant(values);
      message.success('租户创建成功');
      modal.close();
      form.resetFields();
      fetchData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建失败');
    }
  };

  const handleToggleStatus = async (record: TenantInfo) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active';
    try {
      await tenantService.toggleTenantStatus(record.id, newStatus);
      message.success(newStatus === 'active' ? '已启用' : '已停用');
      fetchData();
    } catch {
      message.error('操作失败');
    }
  };

  const handleResetOwnerPassword = async () => {
    const record = resetPwdModal.data;
    if (!record) return;
    try {
      const values = await resetPwdForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入密码不一致');
        return;
      }
      setResettingPwd(true);
      const res: any = await tenantService.resetTenantOwnerPassword(record.id, values.newPassword);
      if (res?.code === 200 || res?.data) {
        message.success('密码重置成功');
        resetPwdModal.close();
        resetPwdForm.resetFields();
      } else {
        message.error(res?.message || '重置失败');
      }
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '重置失败');
    } finally {
      setResettingPwd(false);
    }
  };

  const handleApproveApplication = (record: TenantInfo) => {
    approveForm.setFieldsValue({ planType: 'TRIAL', trialDays: 30 });
    approveModal.open(record);
  };

  const handleConfirmApprove = async () => {
    const record = approveModal.data;
    if (!record) return;
    try {
      const values = await approveForm.validateFields();
      setProcessingId(record.id);
      await tenantService.approveApplication(record.id, {
        planType: values.planType,
        trialDays: values.planType === 'TRIAL' ? values.trialDays : undefined,
      });
      message.success('审批通过，工厂账户已激活');
      approveModal.close();
      approveForm.resetFields();
      fetchData();
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '审批失败');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteTenant = (record: TenantInfo) => {
    const statusLabel = record.status === 'pending_review' ? '待审核' : record.status === 'active' ? '正常' : record.status;
    Modal.confirm({
      title: `确认删除「${record.tenantName}」`,
      icon: <ExclamationCircleOutlined />,
      content: record.status === 'active' || record.status === 'disabled'
        ? `该租户状态为「${statusLabel}」，删除后将同时清除其所有用户、角色、账单数据，此操作不可恢复！`
        : `将删除该${statusLabel}的入驻申请。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.deleteTenant(record.id);
          message.success('已删除');
          fetchData();
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  };

  const handleRejectApplication = async () => {
    const record = rejectModal.data;
    if (!record) return;
    try {
      const values = await rejectReasonForm.validateFields();
      setProcessingId(record.id);
      await tenantService.rejectApplication(record.id, values.reason);
      message.success('已拒绝申请');
      rejectModal.close();
      rejectReasonForm.resetFields();
      fetchData();
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '操作失败');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaid = async (record: TenantInfo) => {
    const isPaid = record.paidStatus === 'PAID';
    Modal.confirm({
      title: isPaid ? `取消「${record.tenantName}」的已付费状态` : `标记「${record.tenantName}」为已付费`,
      okText: isPaid ? '取消付费' : '标记已付费',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.markTenantPaid(record.id, isPaid ? 'TRIAL' : 'PAID');
          message.success(isPaid ? '已取消付费状态' : '已标记为已付费');
          fetchData();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const columns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '租户编码', dataIndex: 'tenantCode', width: 110, render: (v: string) => v || <span style={{color:'#bbb'}}>待分配</span> },
    { title: '主账号', dataIndex: 'ownerUsername', width: 110, render: (v: string, r: TenantInfo) => v || r.applyUsername || '-' },
    { title: '联系人', dataIndex: 'contactName', width: 90 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 120 },
    {
      title: '账户状态', dataIndex: 'status', width: 90, align: 'center',
      render: (s: string) => {
        const map: Record<string, {color:string, label:string}> = {
          active: {color:'green', label:'正常'},
          disabled: {color:'red', label:'停用'},
          pending_review: {color:'orange', label:'待审核'},
          rejected: {color:'default', label:'已拒绝'},
        };
        const cfg = map[s] || {color:'default', label: s};
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '付费状态', dataIndex: 'paidStatus', width: 90, align: 'center',
      render: (s: string, r: TenantInfo) => r.status === 'active'
        ? <Tag color={s === 'PAID' ? 'gold' : 'default'}>{s === 'PAID' ? '已付费' : '免费试用'}</Tag>
        : '-',
    },
    { title: '最大用户数', dataIndex: 'maxUsers', width: 90, align: 'center', render: (v: number, r: TenantInfo) => r.status === 'active' ? v : '-' },
    { title: '申请时间', dataIndex: 'createTime', width: 150 },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: TenantInfo) => {
        if (record.status === 'pending_review') {
          const actions: RowAction[] = [
            {
              key: 'approve', label: '审批通过', primary: true,
              disabled: processingId === record.id,
              onClick: () => handleApproveApplication(record),
            },
            {
              key: 'reject', label: '拒绝',
              danger: true,
              onClick: () => { rejectReasonForm.resetFields(); rejectModal.open(record); },
            },
            {
              key: 'delete', label: '删除',
              danger: true,
              onClick: () => handleDeleteTenant(record),
            },
          ];
          return <RowActions actions={actions} />;
        }
        const actions: RowAction[] = [
          {
            key: 'qrcode', label: '注册码',
            primary: true,
            onClick: () => qrModal.open(record),
          },
          {
            key: 'markPaid', label: record.paidStatus === 'PAID' ? '取消付费' : '标记已付费',
            onClick: () => handleMarkPaid(record),
          },
          {
            key: 'resetPwd', label: '重置密码',
            onClick: () => { resetPwdForm.resetFields(); resetPwdModal.open(record); },
          },
          {
            key: 'toggle', label: record.status === 'active' ? '停用' : '启用',
            danger: record.status === 'active',
            onClick: () => handleToggleStatus(record),
          },
          {
            key: 'delete', label: '删除',
            danger: true,
            onClick: () => handleDeleteTenant(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  // 生成注册链接
  const getRegisterUrl = (tenant: TenantInfo) => {
    const origin = window.location.origin;
    return `${origin}/register?tenantCode=${encodeURIComponent(tenant.tenantCode)}&tenantName=${encodeURIComponent(tenant.tenantName)}`;
  };

  const handleCopyLink = (tenant: TenantInfo) => {
    const url = getRegisterUrl(tenant);
    navigator.clipboard.writeText(url).then(() => {
      message.success('注册链接已复制');
    }).catch(() => {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      message.success('注册链接已复制');
    });
  };

  const handleCopyCode = (tenantCode: string) => {
    navigator.clipboard.writeText(tenantCode).then(() => {
      message.success('工厂编码已复制');
    }).catch(() => {
      message.success('工厂编码已复制');
    });
  };

  return (
    <div>
      {/* 标签筛选 + 操作栏 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { key: '', label: '全部' },
            { key: 'pending_review', label: '待审核', color: 'orange' },
            { key: 'active', label: '正常', color: 'green' },
            { key: 'disabled', label: '停用', color: 'red' },
            { key: 'rejected', label: '已拒绝', color: 'default' },
          ].map(tab => (
            <Tag
              key={tab.key}
              color={statusTab === tab.key ? (tab.color || 'blue') : undefined}
              style={{
                cursor: 'pointer',
                padding: '3px 12px',
                fontSize: 14,
                border: statusTab === tab.key ? undefined : '1px solid #d9d9d9',
              }}
              onClick={() => {
                setStatusTab(tab.key);
                setQueryParams(p => ({ ...p, status: tab.key, page: 1 }));
              }}
            >
              {tab.label}
            </Tag>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Input.Search
            placeholder="搜索工厂名称"
            allowClear
            onSearch={(v) => setQueryParams(p => ({ ...p, tenantName: v, page: 1 }))}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); modal.open(); }}>
            新建租户
          </Button>
        </div>
      </div>

      <ResizableTable
        storageKey="customer-tenant-list"
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: queryParams.page, pageSize: queryParams.pageSize, total,
          onChange: (p, ps) => setQueryParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}
        size="small"
      />

      {/* 拒绝申请弹窗 */}
      <ResizableModal
        open={rejectModal.visible}
        title={`拒绝入驻申请 - ${rejectModal.data?.tenantName || ''}`}
        onCancel={() => { rejectModal.close(); rejectReasonForm.resetFields(); }}
        width="30vw"
        footer={
          <Space>
            <Button onClick={() => { rejectModal.close(); rejectReasonForm.resetFields(); }}>取消</Button>
            <Button danger type="primary" loading={processingId === rejectModal.data?.id} onClick={handleRejectApplication}>确认拒绝</Button>
          </Space>
        }
      >
        <Form form={rejectReasonForm} layout="vertical">
          <Alert message={`申请账号：${rejectModal.data?.applyUsername || '-'}`} type="warning" showIcon style={{ marginBottom: 16 }} />
          <Form.Item label="拒绝原因" name="reason" rules={[{ required: true, message: '请填写拒绝原因' }]}>
            <Input.TextArea rows={3} placeholder="请填写拒绝原因（将记录在备注中）" />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 新建租户弹窗 */}
      <ResizableModal
        open={modal.visible}
        title="新建租户"
        onCancel={modal.close}
        width="40vw"
        footer={
          <Space>
            <Button onClick={modal.close}>取消</Button>
            <Button type="primary" onClick={handleCreate}>确认创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="租户名称" name="tenantName" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="租户编码" name="tenantCode" rules={[{ required: true }]}><Input placeholder="唯一编码，工人注册用" /></Form.Item>
          <Form.Item label="联系人" name="contactName" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="联系电话" name="contactPhone"><Input /></Form.Item>
          <Form.Item label="最大用户数" name="maxUsers"><InputNumber min={1} max={9999} defaultValue={50} style={{ width: '100%' }} /></Form.Item>
          <div style={{ background: 'rgba(45, 127, 249, 0.08)', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>主账号信息</div>
            <Form.Item label="用户名" name="ownerUsername" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="密码" name="ownerPassword" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>
            <Form.Item label="姓名" name="ownerName"><Input /></Form.Item>
          </div>
        </Form>
      </ResizableModal>

      {/* 注册二维码弹窗 */}
      <ResizableModal
        open={qrModal.visible}
        title={`注册二维码 - ${qrModal.data?.tenantName || ''}`}
        onCancel={qrModal.close}
        width="40vw"
        footer={<Button onClick={qrModal.close}>关闭</Button>}
      >
        {qrModal.data && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ marginBottom: 20 }}>
              <QRCode
                value={getRegisterUrl(qrModal.data)}
                size={240}
                style={{ margin: '0 auto' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">员工扫码或打开链接即可注册到该工厂</Text>
            </div>
            <Card size="small" style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto', background: '#f8f9fa', borderRadius: 8 }}>
              <div style={{ marginBottom: 12 }}>
                <Text strong>工厂名称：</Text>
                <Text>{qrModal.data.tenantName}</Text>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Text strong>工厂编码：</Text>
                <Text code copyable={{ text: qrModal.data.tenantCode }}>{qrModal.data.tenantCode}</Text>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Text strong>注册链接：</Text>
                <div style={{ wordBreak: 'break-all', marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{getRegisterUrl(qrModal.data)}</Text>
                </div>
              </div>
              <Space>
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyLink(qrModal.data!)}>
                  复制链接
                </Button>
                <Button size="small" icon={<QrcodeOutlined />} onClick={() => handleCopyCode(qrModal.data!.tenantCode)}>
                  复制编码
                </Button>
              </Space>
            </Card>
            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                提示：员工注册后需要管理员在「注册审批」中审批通过后才能使用
              </Text>
            </div>
          </div>
        )}
      </ResizableModal>

      {/* 重置主账号密码弹窗 */}
      <ResizableModal
        open={resetPwdModal.visible}
        title={`重置主账号密码 - ${resetPwdModal.data?.tenantName || ''}`}
        onCancel={() => { resetPwdModal.close(); resetPwdForm.resetFields(); }}
        width="30vw"
        footer={
          <Space>
            <Button onClick={() => { resetPwdModal.close(); resetPwdForm.resetFields(); }}>取消</Button>
            <Button type="primary" danger loading={resettingPwd} onClick={handleResetOwnerPassword}>确认重置</Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          主账号：<strong style={{ color: 'var(--primary-color)' }}>{resetPwdModal.data?.ownerUsername || '-'}</strong>
        </div>
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 6, message: '密码不能少于6位' }]}>
            <Input.Password placeholder="请输入新密码（至少6位）" autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 审批通过弹窗（含套餐选择） */}
      <ResizableModal
        open={approveModal.visible}
        title={`审批通过 - ${approveModal.data?.tenantName || ''}`}
        onCancel={() => { approveModal.close(); approveForm.resetFields(); }}
        width="40vw"
        footer={
          <Space>
            <Button onClick={() => { approveModal.close(); approveForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={processingId === approveModal.data?.id} onClick={handleConfirmApprove}>确认审批</Button>
          </Space>
        }
      >
        <Alert
          message={`将为「${approveModal.data?.tenantName || ''}」创建主账号「${approveModal.data?.applyUsername || ''}」并激活工厂账户`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={approveForm} layout="vertical" initialValues={{ planType: 'TRIAL', trialDays: 30 }}>
          <Form.Item label="选择套餐" name="planType" rules={[{ required: true, message: '请选择套餐' }]}>
            <Select>
              {PLAN_OPTIONS.map(p => (
                <Select.Option key={p.value} value={p.value}>
                  {p.label}（{p.description}）
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.planType !== cur.planType}>
            {({ getFieldValue }) => getFieldValue('planType') === 'TRIAL' ? (
              <Form.Item label="免费试用期" name="trialDays" rules={[{ required: true, message: '请选择试用期' }]}>
                <Radio.Group>
                  {TRIAL_OPTIONS.map(t => (
                    <Radio.Button key={t.value} value={t.value}>{t.label}</Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
            ) : (
              <Alert
                message="付费套餐将在审批通过后立即生效，可在「套餐与收费」中随时调整"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

// ========== 注册审批 Tab ==========
const RegistrationTab: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [tenantApps, setTenantApps] = useState<TenantInfo[]>([]);
  const [tenantAppsLoading, setTenantAppsLoading] = useState(false);
  const editModal = useModal<TenantInfo>();
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  const fetchTenantApps = useCallback(async () => {
    if (!isSuperAdmin) { setTenantApps([]); return; }
    setTenantAppsLoading(true);
    try {
      const res: any = await tenantService.listTenants({ page: 1, pageSize: 100, status: 'pending_review' });
      const d = res?.data || res;
      setTenantApps(d?.records || []);
    } catch { /* ignore */ }
    finally { setTenantAppsLoading(false); }
  }, [isSuperAdmin]);

  const handleApproveTenant = async (record: TenantInfo) => {
    Modal.confirm({
      title: `确认审批通过「${record.tenantName}」`,
      content: `将创建主账号「${record.applyUsername || ''}」，并激活该工厂账户（默认免费试用30天，可在「客户管理」中调整套餐）。`,
      okText: '确认审批',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.approveApplication(record.id, { planType: 'TRIAL', trialDays: 30 });
          message.success('审批通过，工厂账户已激活');
          fetchTenantApps();
        } catch (e: any) {
          message.error(e?.message || '审批失败');
        }
      },
    });
  };

  const handleRejectTenant = async (record: TenantInfo) => {
    Modal.confirm({
      title: `拒绝「${record.tenantName}」的入驻申请`,
      content: <Input.TextArea placeholder="请输入拒绝原因" id="reject-tenant-reason" />,
      okText: '确认拒绝',
      cancelText: '取消',
      onOk: async () => {
        const reason = (document.getElementById('reject-tenant-reason') as HTMLTextAreaElement)?.value || '不符合要求';
        try {
          await tenantService.rejectApplication(record.id, reason);
          message.success('已拒绝');
          fetchTenantApps();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const handleEditApplication = (record: TenantInfo) => {
    editForm.setFieldsValue({
      applyUsername: record.applyUsername,
      contactName: record.contactName,
      contactPhone: record.contactPhone,
    });
    editModal.open(record);
  };

  const handleSaveApplication = async () => {
    const record = editModal.data;
    if (!record) return;
    try {
      const values = await editForm.validateFields();
      setEditSaving(true);
      await tenantService.updateApplication(record.id, values);
      message.success('申请信息已更新');
      editModal.close();
      editForm.resetFields();
      fetchTenantApps();
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '修改失败');
    } finally {
      setEditSaving(false);
    }
  };

  const tenantAppColumns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '申请账号', dataIndex: 'applyUsername', width: 120 },
    { title: '联系人', dataIndex: 'contactName', width: 100 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 130 },
    {
      title: '状态', dataIndex: 'status', width: 90, align: 'center',
      render: () => <Tag color="orange">待审核</Tag>,
    },
    { title: '申请时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: TenantInfo) => {
        const actions: RowAction[] = [
          { key: 'approve', label: '通过', primary: true, onClick: () => handleApproveTenant(record) },
          { key: 'edit', label: '编辑', onClick: () => handleEditApplication(record) },
          { key: 'reject', label: '拒绝', danger: true, onClick: () => handleRejectTenant(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  useEffect(() => { fetchTenantApps(); }, [fetchTenantApps]);

  return (
    <div>
      <Alert
        message="功能说明"
        description={'此页面用于审批新工厂的入驻申请。审批通过后工厂主账号将自动创建，工厂即可登录使用。员工注册审批由各工厂在「人员管理」中自行处理。'}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          🏭 工厂入驻申请 {tenantApps.length > 0 && <Badge count={tenantApps.length} style={{ marginLeft: 8 }} />}
        </Typography.Title>
        {tenantApps.length > 0 ? (
          <ResizableTable
            storageKey="customer-registration-audit"
            rowKey="id"
            columns={tenantAppColumns}
            dataSource={tenantApps}
            loading={tenantAppsLoading}
            pagination={false}
            size="small"
          />
        ) : (
          <Card size="small" style={{ textAlign: 'center', color: '#999' }}>
            {tenantAppsLoading ? '加载中...' : '暂无待审核的工厂入驻申请'}
          </Card>
        )}
      </div>

      {/* 编辑申请信息弹窗 */}
      <ResizableModal
        open={editModal.visible}
        title={`编辑申请信息 - ${editModal.data?.tenantName || ''}`}
        onCancel={() => { editModal.close(); editForm.resetFields(); }}
        width="30vw"
        footer={
          <Space>
            <Button onClick={() => { editModal.close(); editForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={editSaving} onClick={handleSaveApplication}>保存</Button>
          </Space>
        }
      >
        <Alert
          message="如果申请账号已被其他工厂占用，可以在此修改后再审批通过。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={editForm} layout="vertical">
          <Form.Item label="申请账号" name="applyUsername" rules={[{ required: true, message: '账号不能为空' }]}>
            <Input placeholder="修改后将用此账号创建主账号" />
          </Form.Item>
          <Form.Item label="联系人" name="contactName">
            <Input />
          </Form.Item>
          <Form.Item label="联系电话" name="contactPhone">
            <Input />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

// ========== 套餐与收费 Tab ==========
const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  TRIAL: { label: '免费试用', color: 'default' },
  BASIC: { label: '基础版', color: 'blue' },
  PRO: { label: '专业版', color: 'gold' },
  ENTERPRISE: { label: '企业版', color: 'purple' },
};

const BILL_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待支付', color: 'orange' },
  PAID: { label: '已支付', color: 'green' },
  OVERDUE: { label: '逾期', color: 'red' },
  WAIVED: { label: '已减免', color: 'default' },
};

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: '月付',
  YEARLY: '年付',
};

const formatStorageSize = (mb: number): string => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
};

const BillingTab: React.FC = () => {
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const planModal = useModal<TenantInfo>();
  const overviewModal = useModal<TenantInfo>();
  const [planForm] = Form.useForm();
  const [planSaving, setPlanSaving] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // 账单列表
  const [bills, setBills] = useState<BillingRecord[]>([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billParams, setBillParams] = useState({ page: 1, pageSize: 20, tenantId: undefined as number | undefined, status: '' });

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantService.listTenants({ page: 1, pageSize: 200, status: 'active' });
      const d = res?.data || res;
      setTenants(d?.records || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchPlans = useCallback(async () => {
    try {
      const res: any = await tenantService.getPlanDefinitions();
      setPlans(res?.data || res || []);
    } catch { /* ignore */ }
  }, []);

  const fetchBills = useCallback(async () => {
    setBillsLoading(true);
    try {
      const params: any = { page: billParams.page, pageSize: billParams.pageSize };
      if (billParams.tenantId) params.tenantId = billParams.tenantId;
      if (billParams.status) params.status = billParams.status;
      const res: any = await tenantService.listBillingRecords(params);
      const d = res?.data || res;
      setBills(d?.records || []);
      setBillsTotal(d?.total || 0);
    } catch { /* ignore */ }
    finally { setBillsLoading(false); }
  }, [billParams]);

  useEffect(() => { fetchTenants(); fetchPlans(); }, [fetchTenants, fetchPlans]);
  useEffect(() => { fetchBills(); }, [fetchBills]);

  const handleOpenPlanModal = (record: TenantInfo) => {
    planForm.setFieldsValue({
      planType: record.planType || 'TRIAL',
      billingCycle: record.billingCycle || 'MONTHLY',
      monthlyFee: record.monthlyFee || 0,
      storageQuotaMb: record.storageQuotaMb || 1024,
      maxUsers: record.maxUsers || 50,
    });
    planModal.open(record);
  };

  const handlePlanTypeChange = (value: string) => {
    const plan = plans.find(p => p.code === value);
    if (plan) {
      planForm.setFieldsValue({
        monthlyFee: plan.monthlyFee,
        storageQuotaMb: plan.storageQuotaMb,
        maxUsers: plan.maxUsers,
      });
    }
  };

  const handleBillingCycleChange = () => {
    // 切换月付/年付时，重新填充预设费用
    const currentPlan = planForm.getFieldValue('planType');
    const plan = plans.find(p => p.code === currentPlan);
    if (plan) {
      planForm.setFieldsValue({ monthlyFee: plan.monthlyFee });
    }
  };

  const handleSavePlan = async () => {
    const record = planModal.data;
    if (!record) return;
    try {
      const values = await planForm.validateFields();
      setPlanSaving(true);
      await tenantService.updateTenantPlan(record.id, values);
      message.success('套餐已更新');
      planModal.close();
      fetchTenants();
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '保存失败');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleOpenOverview = async (record: TenantInfo) => {
    overviewModal.open(record);
    setOverviewLoading(true);
    setOverview(null);
    try {
      const res: any = await tenantService.getTenantBillingOverview(record.id);
      setOverview(res?.data || res);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setOverviewLoading(false);
    }
  };

  const handleGenerateBill = async (record: TenantInfo) => {
    const isYearly = record.billingCycle === 'YEARLY';
    const plan = plans.find(p => p.code === record.planType);
    const feeLabel = isYearly
      ? `¥${plan?.yearlyFee || record.monthlyFee * 10}/年`
      : `¥${record.monthlyFee || 0}/月`;
    Modal.confirm({
      title: `为「${record.tenantName}」生成${isYearly ? '年度' : '本月'}账单`,
      content: `将根据当前套餐配置（${PLAN_LABELS[record.planType]?.label || record.planType}，${feeLabel}，${isYearly ? '年付' : '月付'}）生成账单。`,
      okText: '确认生成',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.generateMonthlyBill(record.id);
          message.success('账单已生成');
          fetchBills();
        } catch (e: any) {
          message.error(e?.message || '生成失败');
        }
      },
    });
  };

  const handleMarkBillPaid = async (bill: BillingRecord) => {
    Modal.confirm({
      title: `确认标记账单 ${bill.billingNo} 已支付`,
      content: `金额：¥${bill.totalAmount}，租户：${bill.tenantName}`,
      okText: '确认支付',
      onOk: async () => {
        try {
          await tenantService.markBillPaid(bill.id);
          message.success('已标记为已支付');
          fetchBills();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const handleWaiveBill = async (bill: BillingRecord) => {
    Modal.confirm({
      title: `减免账单 ${bill.billingNo}`,
      content: <Input.TextArea placeholder="减免原因（选填）" id="waive-remark" />,
      okText: '确认减免',
      onOk: async () => {
        const remark = (document.getElementById('waive-remark') as HTMLTextAreaElement)?.value || '';
        try {
          await tenantService.waiveBill(bill.id, remark);
          message.success('已减免');
          fetchBills();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const handleIssueInvoice = async (bill: BillingRecord) => {
    Modal.confirm({
      title: `确认开票 - ${bill.billingNo}`,
      content: (
        <div>
          <p>租户：{bill.tenantName}，金额：¥{bill.totalAmount}</p>
          <p>抬头：{(bill as any).invoiceTitle || '—'}</p>
          <p>税号：{(bill as any).invoiceTaxNo || '—'}</p>
          <Input placeholder="请输入发票号码" id="invoice-no-input" style={{ marginTop: 8 }} />
        </div>
      ),
      okText: '确认开票',
      onOk: async () => {
        const invoiceNo = (document.getElementById('invoice-no-input') as HTMLInputElement)?.value || '';
        if (!invoiceNo.trim()) { message.warning('请输入发票号码'); throw new Error('cancel'); }
        try {
          await tenantService.issueInvoice(bill.id, invoiceNo.trim());
          message.success('已确认开票');
          fetchBills();
        } catch (e: any) {
          if (e?.message === 'cancel') throw e;
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const tenantColumns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '租户编码', dataIndex: 'tenantCode', width: 100 },
    {
      title: '当前套餐', dataIndex: 'planType', width: 100, align: 'center',
      render: (v: string) => {
        const cfg = PLAN_LABELS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '月费', dataIndex: 'monthlyFee', width: 90, align: 'right',
      render: (v: number) => v > 0 ? `¥${v}` : <span style={{ color: '#999' }}>免费</span>,
    },
    {
      title: '计费', dataIndex: 'billingCycle', width: 70, align: 'center',
      render: (v: string) => {
        if (v === 'YEARLY') return <Tag color="blue">年付</Tag>;
        return <Tag>月付</Tag>;
      },
    },
    {
      title: '存储配额', width: 140,
      render: (_: unknown, r: TenantInfo) => {
        const used = r.storageUsedMb || 0;
        const quota = r.storageQuotaMb || 1024;
        const percent = quota > 0 ? Math.round(used * 100 / quota) : 0;
        return (
          <div style={{ minWidth: 100 }}>
            <Progress
              percent={percent}
              size="small"
              status={percent >= 90 ? 'exception' : 'normal'}
              format={() => `${formatStorageSize(used)}/${formatStorageSize(quota)}`}
              style={{ marginBottom: 0 }}
            />
          </div>
        );
      },
    },
    {
      title: '用户数', dataIndex: 'maxUsers', width: 80, align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: TenantInfo) => {
        const actions: RowAction[] = [
          { key: 'plan', label: '设置套餐', primary: true, onClick: () => handleOpenPlanModal(record) },
          { key: 'overview', label: '账单详情', onClick: () => handleOpenOverview(record) },
          { key: 'generate', label: '生成账单', onClick: () => handleGenerateBill(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  const billColumns: ColumnsType<BillingRecord> = [
    { title: '账单编号', dataIndex: 'billingNo', width: 150 },
    { title: '租户', dataIndex: 'tenantName', width: 130 },
    { title: '账期', dataIndex: 'billingMonth', width: 100, align: 'center' },
    {
      title: '套餐', dataIndex: 'planType', width: 90, align: 'center',
      render: (v: string) => PLAN_LABELS[v]?.label || v,
    },
    {
      title: '周期', dataIndex: 'billingCycle', width: 60, align: 'center',
      render: (v: string) => CYCLE_LABELS[v] || v || '月付',
    },
    { title: '基础费', dataIndex: 'baseFee', width: 90, align: 'right', render: (v: number) => `¥${v}` },
    { title: '合计', dataIndex: 'totalAmount', width: 90, align: 'right',
      render: (v: number) => <strong>¥{v}</strong>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (v: string) => {
        const cfg = BILL_STATUS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '支付时间', dataIndex: 'paidTime', width: 150 },
    {
      title: '发票', dataIndex: 'invoiceStatus', width: 80, align: 'center',
      render: (v: string) => {
        const map: Record<string, { label: string; color: string }> = {
          NOT_REQUIRED: { label: '无需', color: 'default' },
          PENDING: { label: '待开票', color: 'processing' },
          ISSUED: { label: '已开', color: 'success' },
          MAILED: { label: '已寄', color: 'success' },
        };
        const cfg = map[v] || { label: v || '—', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: BillingRecord) => {
        const actions: RowAction[] = [];
        if (record.status !== 'PAID' && record.status !== 'WAIVED') {
          actions.push({ key: 'pay', label: '标记已付', primary: true, onClick: () => handleMarkBillPaid(record) });
          actions.push({ key: 'waive', label: '减免', onClick: () => handleWaiveBill(record) });
        }
        if ((record as any).invoiceStatus === 'PENDING') {
          actions.push({ key: 'invoice', label: '确认开票', onClick: () => handleIssueInvoice(record) });
        }
        return actions.length > 0 ? <RowActions actions={actions} /> : '-';
      },
    },
  ];

  return (
    <div>
      {/* 租户套餐列表 */}
      <Typography.Title level={5} style={{ marginBottom: 12 }}>🏭 租户套餐一览</Typography.Title>
      <ResizableTable
        storageKey="customer-billing-tenants"
        rowKey="id"
        columns={tenantColumns}
        dataSource={tenants}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ y: 300 }}
      />

      <Divider />

      {/* 账单列表 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>📋 账单记录</Typography.Title>
        <Space>
          <Select
            placeholder="筛选租户"
            allowClear
            style={{ width: 160 }}
            onChange={(v) => setBillParams(p => ({ ...p, tenantId: v, page: 1 }))}
            options={tenants.map(t => ({ label: t.tenantName, value: t.id }))}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            onChange={(v) => setBillParams(p => ({ ...p, status: v || '', page: 1 }))}
            options={Object.entries(BILL_STATUS).map(([k, v]) => ({ label: v.label, value: k }))}
          />
        </Space>
      </div>
      <ResizableTable
        storageKey="customer-billing-records"
        rowKey="id"
        columns={billColumns}
        dataSource={bills}
        loading={billsLoading}
        pagination={{
          current: billParams.page, pageSize: billParams.pageSize, total: billsTotal,
          onChange: (p, ps) => setBillParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}
        size="small"
      />

      {/* 设置套餐弹窗 */}
      <ResizableModal
        open={planModal.visible}
        title={`设置套餐 - ${planModal.data?.tenantName || ''}`}
        onCancel={() => { planModal.close(); planForm.resetFields(); }}
        width="40vw"
        footer={
          <Space>
            <Button onClick={() => { planModal.close(); planForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={planSaving} onClick={handleSavePlan}>保存</Button>
          </Space>
        }
      >
        <Alert
          message="选择预设套餐会自动填充默认配置，也可手动调整各项参数。年付享8.3折优惠（买10个月送2个月）。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={planForm} layout="vertical">
          <Form.Item label="计费周期" name="billingCycle" rules={[{ required: true }]}>
            <Radio.Group onChange={handleBillingCycleChange}>
              <Radio.Button value="MONTHLY">月付</Radio.Button>
              <Radio.Button value="YEARLY">年付（8.3折）</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="套餐类型" name="planType" rules={[{ required: true }]}>
            <Select onChange={handlePlanTypeChange}>
              {plans.map(p => {
                const cycle = planForm.getFieldValue('billingCycle');
                const priceLabel = cycle === 'YEARLY'
                  ? `¥${p.yearlyFee}/年（省¥${p.monthlyFee * 12 - p.yearlyFee}）`
                  : `¥${p.monthlyFee}/月`;
                return (
                  <Select.Option key={p.code} value={p.code}>
                    {p.label}（{priceLabel}，{formatStorageSize(p.storageQuotaMb)}，{p.maxUsers}用户）
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="月费(元)" name="monthlyFee" rules={[{ required: true }]}>
                <InputNumber min={0} step={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="存储配额(MB)" name="storageQuotaMb" rules={[{ required: true }]}>
                <InputNumber min={100} step={1024} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="最大用户数" name="maxUsers" rules={[{ required: true }]}>
                <InputNumber min={1} max={9999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </ResizableModal>

      {/* 账单详情弹窗 */}
      <ResizableModal
        open={overviewModal.visible}
        title={`账单详情 - ${overviewModal.data?.tenantName || ''}`}
        onCancel={overviewModal.close}
        width="40vw"
        footer={<Button onClick={overviewModal.close}>关闭</Button>}
      >
        {overviewLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
        ) : overview ? (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="套餐类型">
                <Tag color={PLAN_LABELS[overview.planType]?.color || 'default'}>
                  {PLAN_LABELS[overview.planType]?.label || overview.planType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="计费周期">
                <Tag color={overview.billingCycle === 'YEARLY' ? 'blue' : 'default'}>
                  {CYCLE_LABELS[overview.billingCycle] || '月付'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="月费">¥{overview.monthlyFee || 0}</Descriptions.Item>
              <Descriptions.Item label="存储配额">
                {formatStorageSize(overview.storageQuotaMb || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="已用存储">
                <Progress
                  percent={overview.storageUsedPercent || 0}
                  size="small"
                  status={(overview.storageUsedPercent || 0) >= 90 ? 'exception' : 'normal'}
                  style={{ width: 150, display: 'inline-flex' }}
                />
                <span style={{ marginLeft: 8 }}>
                  {formatStorageSize(overview.storageUsedMb || 0)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="最大用户数">{overview.maxUsers}</Descriptions.Item>
              <Descriptions.Item label="当前用户数">{overview.currentUsers}</Descriptions.Item>
              <Descriptions.Item label="付费状态">
                <Tag color={overview.paidStatus === 'PAID' ? 'gold' : 'default'}>
                  {overview.paidStatus === 'PAID' ? '已付费' : '免费试用'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="到期时间">
                {overview.expireTime || '永不过期'}
              </Descriptions.Item>
            </Descriptions>

            {overview.recentBills?.length > 0 && (
              <>
                <Divider style={{ marginTop: 24 }}>最近账单</Divider>
                <ResizableTable
                  storageKey="customer-billing-overview-bills"
                  rowKey="id"
                  columns={[
                    { title: '账期', dataIndex: 'billingMonth', width: 90 },
                    { title: '金额', dataIndex: 'totalAmount', width: 80, render: (v: number) => `¥${v}` },
                    { title: '状态', dataIndex: 'status', width: 80,
                      render: (v: string) => <Tag color={BILL_STATUS[v]?.color || 'default'}>{BILL_STATUS[v]?.label || v}</Tag>,
                    },
                    { title: '支付时间', dataIndex: 'paidTime', width: 150 },
                  ]}
                  dataSource={overview.recentBills}
                  pagination={false}
                  size="small"
                />
              </>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
        )}
      </ResizableModal>
    </div>
  );
};

// ========== 用户反馈管理 Tab ==========
const FEEDBACK_CATEGORY: Record<string, { label: string; color: string }> = {
  BUG: { label: '缺陷', color: 'red' },
  SUGGESTION: { label: '建议', color: 'blue' },
  QUESTION: { label: '咨询', color: 'orange' },
  OTHER: { label: '其他', color: 'default' },
};
const FEEDBACK_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'default' },
  PROCESSING: { label: '处理中', color: 'processing' },
  RESOLVED: { label: '已解决', color: 'success' },
  CLOSED: { label: '已关闭', color: 'default' },
};

const FeedbackTab: React.FC = () => {
  const [data, setData] = useState<UserFeedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [queryParams, setQueryParams] = useState({ page: 1, pageSize: 20, status: '', tenantName: '', category: '' });
  const replyModal = useModal<UserFeedback>();
  const detailModal = useModal<UserFeedback>();
  const [replyForm] = Form.useForm();
  const [replying, setReplying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await feedbackService.list(queryParams);
      const d = res?.data || res;
      setData(d?.records || []);
      setTotal(d?.total || 0);
    } catch { message.error('加载反馈列表失败'); } finally { setLoading(false); }
  }, [queryParams]);

  const fetchStats = async () => {
    try {
      const res: any = await feedbackService.stats();
      const d = res?.data || res;
      setStats(d);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchData(); fetchStats(); }, [fetchData]);

  const handleReply = async () => {
    const record = replyModal.data;
    if (!record?.id) return;
    try {
      const values = await replyForm.validateFields();
      setReplying(true);
      await feedbackService.reply(record.id, values.reply, values.status || 'RESOLVED');
      message.success('回复成功');
      replyModal.close();
      replyForm.resetFields();
      fetchData();
      fetchStats();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '回复失败');
    } finally { setReplying(false); }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await feedbackService.updateStatus(id, status);
      message.success('状态已更新');
      fetchData();
      fetchStats();
    } catch { message.error('操作失败'); }
  };

  const columns: ColumnsType<UserFeedback> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '租户', dataIndex: 'tenantName', width: 120, ellipsis: true },
    { title: '提交人', dataIndex: 'userName', width: 80 },
    { title: '来源', dataIndex: 'source', width: 70,
      render: (v: string) => <Tag color={v === 'MINIPROGRAM' ? 'green' : 'blue'}>{v === 'MINIPROGRAM' ? '小程序' : 'PC'}</Tag>,
    },
    { title: '分类', dataIndex: 'category', width: 70,
      render: (v: string) => <Tag color={FEEDBACK_CATEGORY[v]?.color}>{FEEDBACK_CATEGORY[v]?.label || v}</Tag>,
    },
    { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={FEEDBACK_STATUS[v]?.color}>{FEEDBACK_STATUS[v]?.label || v}</Tag>,
    },
    { title: '提交时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: UserFeedback) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '查看', primary: true, onClick: () => detailModal.open(record) },
          { key: 'reply', label: '回复', onClick: () => { replyModal.open(record); replyForm.setFieldsValue({ reply: record.reply || '', status: 'RESOLVED' }); } },
        ];
        if (record.status === 'PENDING') {
          actions.push({ key: 'processing', label: '处理中', onClick: () => handleUpdateStatus(record.id!, 'PROCESSING') });
        }
        if (record.status !== 'CLOSED') {
          actions.push({ key: 'close', label: '关闭', onClick: () => handleUpdateStatus(record.id!, 'CLOSED') });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card size="small"><Statistic title="总反馈" value={stats.total} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="待处理" value={stats.pending} valueStyle={{ color: stats.pending > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="处理中" value={stats.processing} valueStyle={{ color: '#1890ff' }} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="已解决" value={stats.resolved} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        </Row>
      )}

      {/* 筛选 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select style={{ width: 120 }} placeholder="状态" allowClear value={queryParams.status || undefined}
            onChange={v => setQueryParams(p => ({ ...p, page: 1, status: v || '' }))}
            options={[
              { value: 'PENDING', label: '待处理' },
              { value: 'PROCESSING', label: '处理中' },
              { value: 'RESOLVED', label: '已解决' },
              { value: 'CLOSED', label: '已关闭' },
            ]}
          />
          <Select style={{ width: 120 }} placeholder="分类" allowClear value={queryParams.category || undefined}
            onChange={v => setQueryParams(p => ({ ...p, page: 1, category: v || '' }))}
            options={[
              { value: 'BUG', label: '缺陷' },
              { value: 'SUGGESTION', label: '建议' },
              { value: 'QUESTION', label: '咨询' },
              { value: 'OTHER', label: '其他' },
            ]}
          />
          <Input.Search style={{ width: 200 }} placeholder="搜索租户名称" allowClear
            onSearch={v => setQueryParams(p => ({ ...p, page: 1, tenantName: v }))}
          />
          <Button onClick={() => { fetchData(); fetchStats(); }}>刷新</Button>
        </Space>
      </Card>

      <ResizableTable
        storageKey="customer-feedback-list"
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: queryParams.page,
          pageSize: queryParams.pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => setQueryParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}
        size="small"
      />

      {/* 详情弹窗 */}
      <ResizableModal open={detailModal.visible} title="反馈详情" onCancel={detailModal.close} width="40vw"
        footer={<Button onClick={detailModal.close}>关闭</Button>}
      >
        {detailModal.data && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="ID">{detailModal.data.id}</Descriptions.Item>
            <Descriptions.Item label="来源">
              <Tag color={detailModal.data.source === 'MINIPROGRAM' ? 'green' : 'blue'}>
                {detailModal.data.source === 'MINIPROGRAM' ? '小程序' : 'PC'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="租户">{detailModal.data.tenantName || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交人">{detailModal.data.userName || '-'}</Descriptions.Item>
            <Descriptions.Item label="分类">
              <Tag color={FEEDBACK_CATEGORY[detailModal.data.category]?.color}>
                {FEEDBACK_CATEGORY[detailModal.data.category]?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={FEEDBACK_STATUS[detailModal.data.status || 'PENDING']?.color}>
                {FEEDBACK_STATUS[detailModal.data.status || 'PENDING']?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="标题" span={2}>{detailModal.data.title}</Descriptions.Item>
            <Descriptions.Item label="详细描述" span={2}>
              <div style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{detailModal.data.content}</div>
            </Descriptions.Item>
            <Descriptions.Item label="联系方式" span={2}>{detailModal.data.contact || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交时间">{detailModal.data.createTime}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{detailModal.data.updateTime}</Descriptions.Item>
            {detailModal.data.reply && (
              <>
                <Descriptions.Item label="管理员回复" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#1890ff' }}>{detailModal.data.reply}</div>
                </Descriptions.Item>
                <Descriptions.Item label="回复时间" span={2}>{detailModal.data.replyTime}</Descriptions.Item>
              </>
            )}
          </Descriptions>
        )}
      </ResizableModal>

      {/* 回复弹窗 */}
      <ResizableModal open={replyModal.visible} title={`回复反馈 - ${replyModal.data?.title || ''}`}
        onCancel={replyModal.close} width="40vw" onOk={handleReply} confirmLoading={replying} okText="提交回复"
      >
        {replyModal.data && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{replyModal.data.title}</div>
            <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap' }}>{replyModal.data.content}</div>
          </div>
        )}
        <Form form={replyForm} layout="vertical">
          <Form.Item label="回复内容" name="reply" rules={[{ required: true, message: '请输入回复内容' }]}>
            <Input.TextArea rows={4} placeholder="请输入回复内容" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="设置状态" name="status" initialValue="RESOLVED">
            <Select options={[
              { value: 'PROCESSING', label: '处理中' },
              { value: 'RESOLVED', label: '已解决' },
              { value: 'CLOSED', label: '已关闭' },
            ]} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

// ========== 系统运维面板 Tab ==========
const SystemStatusTab: React.FC = () => {
  const [overview, setOverview] = useState<SystemStatusOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tenantStats, setTenantStats] = useState<any>(null);
  const [loadingTenantStats, setLoadingTenantStats] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await systemStatusService.overview();
      const d = res?.data || res;
      setOverview(d);
    } catch { message.error('加载系统状态失败'); } finally { setLoading(false); }
  }, []);

  const fetchTenantStats = useCallback(async () => {
    setLoadingTenantStats(true);
    try {
      const res: any = await systemStatusService.tenantUserStats();
      setTenantStats(res?.data || res);
    } catch { /* ignore */ } finally { setLoadingTenantStats(false); }
  }, []);

  useEffect(() => { fetchOverview(); fetchTenantStats(); }, [fetchOverview, fetchTenantStats]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(fetchOverview, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchOverview]);

  const heapPercent = overview?.heapUsedPercent || 0;
  const heapColor = heapPercent >= 90 ? '#ff4d4f' : heapPercent >= 70 ? '#faad14' : '#52c41a';
  const dbUp = overview?.database?.status === 'UP';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Badge status={overview ? 'success' : 'default'} text={overview ? '系统运行中' : '加载中...'} />
          {overview && <Text type="secondary" style={{ fontSize: 12 }}>运行时长：{overview.uptime}</Text>}
        </Space>
        <Space>
          <Button size="small" onClick={() => setAutoRefresh(!autoRefresh)} type={autoRefresh ? 'primary' : 'default'}>
            {autoRefresh ? '自动刷新中(15s)' : '开启自动刷新'}
          </Button>
          <Button size="small" onClick={fetchOverview} loading={loading}>刷新</Button>
        </Space>
      </div>

      {overview && (
        <>
          {/* 核心指标 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="JVM 堆内存" value={overview.heapUsedMb} suffix={`/ ${overview.heapMaxMb > 0 ? overview.heapMaxMb : '∞'} MB`}
                  valueStyle={{ color: heapColor, fontSize: 20 }}
                />
                <Progress percent={heapPercent} size="small" strokeColor={heapColor} showInfo={false} style={{ marginTop: 8 }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="线程数" value={overview.threadCount} suffix={`/ 峰值 ${overview.peakThreadCount}`}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="CPU 负载" value={overview.systemLoadAverage} precision={2}
                  suffix={`/ ${overview.availableProcessors} 核`}
                  valueStyle={{ fontSize: 20, color: overview.systemLoadAverage > overview.availableProcessors ? '#ff4d4f' : undefined }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="数据库"
                  value={dbUp ? '正常' : '异常'}
                  valueStyle={{ color: dbUp ? '#52c41a' : '#ff4d4f', fontSize: 20 }}
                />
                {dbUp && <Text type="secondary" style={{ fontSize: 11 }}>{overview.database.product} {overview.database.version?.split('-')[0]}</Text>}
              </Card>
            </Col>
          </Row>

          {/* 详细信息 */}
          <Card size="small" title="系统详情">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="应用名称">{overview.applicationName}</Descriptions.Item>
              <Descriptions.Item label="Java 版本">{overview.javaVersion}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{overview.osName} ({overview.osArch})</Descriptions.Item>
              <Descriptions.Item label="CPU 核心数">{overview.availableProcessors}</Descriptions.Item>
              <Descriptions.Item label="启动时间">{overview.startTime}</Descriptions.Item>
              <Descriptions.Item label="当前时间">{overview.currentTime}</Descriptions.Item>
              <Descriptions.Item label="堆内存(已用/最大)">{overview.heapUsedMb}MB / {overview.heapMaxMb > 0 ? overview.heapMaxMb + 'MB' : '无限制'}</Descriptions.Item>
              <Descriptions.Item label="非堆内存">{overview.nonHeapUsedMb}MB</Descriptions.Item>
              <Descriptions.Item label="数据库状态">
                <Badge status={dbUp ? 'success' : 'error'} text={dbUp ? '连接正常' : '连接异常'} />
              </Descriptions.Item>
              <Descriptions.Item label="数据库版本">{overview.database?.product} {overview.database?.version?.split('-')[0] || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}

      {!overview && !loading && (
        <Alert type="warning" message="无法获取系统状态" description="请检查后端服务是否正常运行" />
      )}

      {/* 租户人员统计 */}
      <Card size="small" title={<span>租户人员统计{tenantStats ? <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>共 {tenantStats.totalTenants} 个租户，{tenantStats.totalUsers} 名用户</Text> : null}</span>} style={{ marginTop: 16 }}
        extra={<Button size="small" onClick={fetchTenantStats} loading={loadingTenantStats}>刷新</Button>}
      >
        {tenantStats?.tenants?.length > 0 ? (
          <ResizableTable
            dataSource={tenantStats.tenants}
            rowKey="tenantId"
            size="small"
            pagination={false}
            columns={[
              { title: '租户ID', dataIndex: 'tenantId', width: 80 },
              { title: '租户名称', dataIndex: 'tenantName', ellipsis: true },
              {
                title: '人员数量', dataIndex: 'userCount', width: 120,
                sorter: (a: any, b: any) => a.userCount - b.userCount,
                render: (v: number) => <Text strong style={{ color: v > 0 ? undefined : '#999' }}>{v}</Text>,
              },
            ]}
          />
        ) : (
          <Text type="secondary">暂无租户数据</Text>
        )}
      </Card>
    </div>
  );
};

// ========== 主页面 ==========
const CustomerManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'tenants';

  return (
    <Layout>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
        items={[
          {
            key: 'tenants',
            label: <span><CrownOutlined /> 客户管理</span>,
            children: <TenantListTab />,
          },
          {
            key: 'registrations',
            label: <span><TeamOutlined /> 注册审批</span>,
            children: <RegistrationTab />,
          },
          {
            key: 'billing',
            label: <span><DollarOutlined /> 套餐与收费</span>,
            children: <BillingTab />,
          },
          {
            key: 'feedback',
            label: <span><MessageOutlined /> 问题反馈</span>,
            children: <FeedbackTab />,
          },
          {
            key: 'system-status',
            label: <span><DashboardOutlined /> 系统运维</span>,
            children: <SystemStatusTab />,
          },
        ]}
      />
    </Layout>
  );
};

export default CustomerManagement;
