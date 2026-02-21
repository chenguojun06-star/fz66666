import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Tag, Space, message, Form, Input, InputNumber, Modal, Select, Card, Typography, Badge, Alert, QRCode, Row, Col, Progress, Descriptions, Divider } from 'antd';
import { PlusOutlined, CrownOutlined, TeamOutlined, CopyOutlined, QrcodeOutlined, DollarOutlined } from '@ant-design/icons';
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

  const handleApproveApplication = async (record: TenantInfo) => {
    Modal.confirm({
      title: `确认审批通过「${record.tenantName}」`,
      content: `将创建主账号「${record.applyUsername || ''}」，并激活该工厂账户。`,
      okText: '确认审批',
      cancelText: '取消',
      onOk: async () => {
        setProcessingId(record.id);
        try {
          await tenantService.approveApplication(record.id);
          message.success('审批通过，工厂账户已激活');
          fetchData();
        } catch (e: any) {
          message.error(e?.message || '审批失败');
        } finally {
          setProcessingId(null);
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
      content: `将创建主账号「${record.applyUsername || ''}」，并激活该工厂账户。`,
      okText: '确认审批',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.approveApplication(record.id);
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
    Modal.confirm({
      title: `为「${record.tenantName}」生成本月账单`,
      content: `将根据当前套餐配置（${PLAN_LABELS[record.planType]?.label || record.planType}，¥${record.monthlyFee || 0}/月）生成账单。`,
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
    { title: '账期', dataIndex: 'billingMonth', width: 90, align: 'center' },
    {
      title: '套餐', dataIndex: 'planType', width: 90, align: 'center',
      render: (v: string) => PLAN_LABELS[v]?.label || v,
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
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: BillingRecord) => {
        if (record.status === 'PAID' || record.status === 'WAIVED') return '-';
        const actions: RowAction[] = [
          { key: 'pay', label: '标记已付', primary: true, onClick: () => handleMarkBillPaid(record) },
          { key: 'waive', label: '减免', onClick: () => handleWaiveBill(record) },
        ];
        return <RowActions actions={actions} />;
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
          message="选择预设套餐会自动填充默认配置，也可手动调整各项参数。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={planForm} layout="vertical">
          <Form.Item label="套餐类型" name="planType" rules={[{ required: true }]}>
            <Select onChange={handlePlanTypeChange}>
              {plans.map(p => (
                <Select.Option key={p.code} value={p.code}>
                  {p.label}（¥{p.monthlyFee}/月，{formatStorageSize(p.storageQuotaMb)}，{p.maxUsers}用户）
                </Select.Option>
              ))}
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
        ]}
      />
    </Layout>
  );
};

export default CustomerManagement;
