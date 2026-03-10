import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tag, Space, message, Form, Input, InputNumber, Modal, Select, Card, Typography, Alert, QRCode, Radio, Checkbox } from 'antd';
import { PlusOutlined, CopyOutlined, QrcodeOutlined, ExclamationCircleOutlined, AppstoreOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import tenantService from '@/services/tenantService';
import type { TenantInfo } from '@/services/tenantService';
import { appStoreService } from '@/services/system/appStore';
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
  const grantModal = useModal<TenantInfo>();
  const [grantAppCodes, setGrantAppCodes] = useState<string[]>(['CRM_MODULE', 'PROCUREMENT', 'FINANCE_TAX']);
  const [grantDuration, setGrantDuration] = useState<number>(0);
  const [granting, setGranting] = useState(false);

  const MODULE_OPTIONS = [
    { value: 'CRM_MODULE', label: 'CRM 客户管理' },
    { value: 'PROCUREMENT', label: '供应商采购管理' },
    { value: 'FINANCE_TAX', label: '财税导出' },
  ];

  const DURATION_OPTIONS = [
    { value: 0, label: '永久' },
    { value: 12, label: '12个月' },
    { value: 6, label: '6个月' },
    { value: 3, label: '3个月' },
    { value: 1, label: '1个月' },
  ];

  const handleGrantModules = async () => {
    const record = grantModal.data;
    if (!record) return;
    if (grantAppCodes.length === 0) {
      message.warning('请至少选择一个付费模块');
      return;
    }
    setGranting(true);
    try {
      const res: any = await appStoreService.adminGrantToTenant({
        tenantId: record.id,
        appCodes: grantAppCodes,
        durationMonths: grantDuration,
      });
      const d = res?.data || res;
      if (d?.activated?.length > 0) {
        message.success(`已成功为「${d.tenantName}」开通：${d.activated.join('、')}`);
      }
      if (d?.failed?.length > 0) {
        message.warning(`以下模块开通失败：${d.failed.join('；')}`);
      }
      grantModal.close();
    } catch (e: any) {
      message.error(e?.message || '开通失败');
    } finally {
      setGranting(false);
    }
  };

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
      okButtonProps: { danger: true, type: 'default' },
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

  const TENANT_TYPE_MAP: Record<string, { color: string; label: string }> = {
    SELF_FACTORY: { color: 'blue', label: '自建工厂' },
    HYBRID:       { color: 'green', label: '混合型' },
    BRAND:        { color: 'purple', label: '纯品牌' },
  };

  const columns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    {
      title: '类型', dataIndex: 'tenantType', width: 80, align: 'center',
      render: (v: string) => {
        const cfg = TENANT_TYPE_MAP[v] || { color: 'default', label: v || '混合型' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
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
            key: 'grantModules', label: '付费模块',
            onClick: () => {
              setGrantAppCodes(['CRM_MODULE', 'PROCUREMENT', 'FINANCE_TAX']);
              setGrantDuration(0);
              grantModal.open(record);
            },
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
            <Button danger type="default" loading={processingId === rejectModal.data?.id} onClick={handleRejectApplication}>确认拒绝</Button>
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
          {/* 租户类型 — 3 个卡片一行 */}
          <Form.Item
            label="租户类型"
            name="tenantType"
            initialValue="HYBRID"
            rules={[{ required: true }]}
            style={{ marginBottom: 16 }}
          >
            <Radio.Group style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Radio value="SELF_FACTORY" style={{ flex: 1, margin: 0, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>🏭 自建工厂</span>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>含裁剪管理，不含外发工厂</div>
                </Radio>
                <Radio value="HYBRID" style={{ flex: 1, margin: 0, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>🔄 混合型（推荐）</span>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>自有产线 + 外发合作，全功能</div>
                </Radio>
                <Radio value="BRAND" style={{ flex: 1, margin: 0, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>🎯 纯品牌 / 贸易</span>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>全部外发，不含裁剪管理</div>
                </Radio>
              </div>
            </Radio.Group>
          </Form.Item>

          {/* 租户名称 + 租户编码 — 一行 */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="租户名称" name="tenantName" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 12 }}>
              <Input />
            </Form.Item>
            <Form.Item label="租户编码" name="tenantCode" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 12 }}>
              <Input placeholder="唯一编码，工人注册用" />
            </Form.Item>
          </div>

          {/* 联系人 + 联系电话 + 最大用户数 — 一行 */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="联系人" name="contactName" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 12 }}>
              <Input />
            </Form.Item>
            <Form.Item label="联系电话" name="contactPhone" style={{ flex: 1, marginBottom: 12 }}>
              <Input />
            </Form.Item>
            <Form.Item label="最大用户数" name="maxUsers" style={{ flex: '0 0 120px', marginBottom: 12 }}>
              <InputNumber min={1} max={9999} defaultValue={50} style={{ width: '100%' }} />
            </Form.Item>
          </div>
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
            <Button type="default" danger loading={resettingPwd} onClick={handleResetOwnerPassword}>确认重置</Button>
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

      {/* 付费模块开通弹窗 */}
      <ResizableModal
        open={grantModal.visible}
        title={<><AppstoreOutlined style={{ marginRight: 6 }} />为「{grantModal.data?.tenantName || ''}」开通付费模块</>}
        onCancel={grantModal.close}
        width="40vw"
        footer={
          <Space>
            <Button onClick={grantModal.close}>取消</Button>
            <Button type="primary" loading={granting} onClick={handleGrantModules}>确认开通</Button>
          </Space>
        }
      >
        <Alert
          message="此操作将直接为该租户创建有效订阅，无需租户下单付费，适合人工确认付款后的手动开通场景。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>选择要开通的模块（可多选）：</div>
          <Checkbox.Group
            value={grantAppCodes}
            onChange={(v) => setGrantAppCodes(v as string[])}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {MODULE_OPTIONS.map(opt => (
              <Checkbox key={opt.value} value={opt.value} style={{ marginLeft: 0 }}>
                {opt.label}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>有效期：</div>
          <Radio.Group value={grantDuration} onChange={(e) => setGrantDuration(e.target.value)}>
            {DURATION_OPTIONS.map(opt => (
              <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
            ))}
          </Radio.Group>
        </div>
      </ResizableModal>

      {/* 审批通过弹窗（含套餐选择） */}      <ResizableModal
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

export default TenantListTab;
