import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tag, Space, Form, Input, InputNumber, Modal, Select, Card, Typography, Alert, QRCode, Radio, Checkbox } from 'antd';
import { PlusOutlined, CopyOutlined, QrcodeOutlined, ExclamationCircleOutlined, AppstoreOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import tenantService from '@/services/tenantService';
import type { TenantInfo } from '@/services/tenantService';
import { appStoreService } from '@/services/system/appStore';
import type { ColumnsType } from 'antd/es/table';
import { message } from '@/utils/antdStatic';
import { PLAN_OPTIONS, TRIAL_OPTIONS, MODULE_OPTIONS, DURATION_OPTIONS } from './tenantModuleConfig';
import ModuleConfigPanel from './ModuleConfigPanel';
import { useTenantListData } from './hooks/useTenantListData';

const { Text } = Typography;

const TenantListTab: React.FC = () => {
  const { data, total, loading, statusTab, queryParams, setStatusTab, setQueryParams, fetchData } = useTenantListData();
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
  const [grantAppCodes, setGrantAppCodes] = useState<string[]>([]);
  const [revokeAppCodes, setRevokeAppCodes] = useState<string[]>([]);
  const [grantDuration, setGrantDuration] = useState<number>(0);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [tenantSubscriptions, setTenantSubscriptions] = useState<Array<{ app_code: string; status: string; end_time: string; subscription_type: string }>>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [approveEnabledModules, setApproveEnabledModules] = useState<string[] | null>(null);
  const moduleModal = useModal<TenantInfo>();
  const [editingEnabledModules, setEditingEnabledModules] = useState<string[] | null>(null);
  const [savingModules, setSavingModules] = useState(false);
  const webhookModal = useModal<TenantInfo>();
  const [webhookForm] = Form.useForm();
  const [savingWebhook, setSavingWebhook] = useState(false);

  const parseEnabledModules = useCallback((raw?: string | null): string[] | null => {
    if (!raw) return null;
    try { const parsed = JSON.parse(raw); if (!Array.isArray(parsed)) return null; return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0); } catch { return null; }
  }, []);

  useEffect(() => {
    if (!approveModal.visible || !approveModal.data) { setTimeout(() => approveForm?.resetFields(), 50); return; }
    setTimeout(() => approveForm?.setFieldsValue({ planType: 'TRIAL', trialDays: 30 }), 50);
  }, [approveForm, approveModal.data, approveModal.visible]);

  const handleCreatePlanChange = (value: string) => { const plan = PLAN_OPTIONS.find((item) => item.value === value); if (!plan) return; form.setFieldsValue({ maxUsers: plan.maxUsers }); };
  const handleOpenModuleConfig = (record: TenantInfo) => { setEditingEnabledModules(parseEnabledModules(record.enabledModules)); moduleModal.open(record); };
  const handleSaveModuleConfig = async () => { const record = moduleModal.data; if (!record) return; try { setSavingModules(true); const enabledModules = editingEnabledModules !== null && editingEnabledModules.length > 0 ? JSON.stringify(editingEnabledModules) : null; await tenantService.updateTenantEnabledModules(record.id, enabledModules); message.success('菜单模块配置已更新'); moduleModal.close(); fetchData(); } catch (e: unknown) { message.error(e instanceof Error ? e.message : '保存失败'); } finally { setSavingModules(false); } };

  const handleCreate = async () => {
    try { const values = await form.validateFields(); await tenantService.createTenant(values); message.success('租户创建成功'); modal.close(); form.resetFields(); fetchData(); }
    catch (e: unknown) { if (e && typeof e === 'object' && 'errorFields' in e) return; message.error(e instanceof Error ? e.message : '创建失败'); }
  };

  const handleToggleStatus = async (record: TenantInfo) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active';
    try { await tenantService.toggleTenantStatus(record.id, newStatus); message.success(newStatus === 'active' ? '已启用' : '已停用'); fetchData(); }
    catch { message.error('操作失败'); }
  };

  const handleResetOwnerPassword = async () => {
    const record = resetPwdModal.data; if (!record) return;
    try { const values = await resetPwdForm.validateFields(); if (values.newPassword !== values.confirmPassword) { message.error('两次输入密码不一致'); return; } setResettingPwd(true); const res: any = await tenantService.resetTenantOwnerPassword(record.id, values.newPassword); if (res?.code === 200 || res?.data) { message.success('密码重置成功'); resetPwdModal.close(); resetPwdForm.resetFields(); } else { message.error(res?.message || '重置失败'); } }
    catch (e: unknown) { if (e && typeof e === 'object' && 'errorFields' in e && Array.isArray((e as any).errorFields) && (e as any).errorFields.length) return; message.error(e instanceof Error ? e.message : '重置失败'); }
    finally { setResettingPwd(false); }
  };

  const handleApproveApplication = (record: TenantInfo) => { setApproveEnabledModules(null); approveModal.open(record); };
  const handleConfirmApprove = async () => {
    const record = approveModal.data; if (!record) return;
    try { const values = await approveForm.validateFields(); setProcessingId(record.id); const enabledModules = approveEnabledModules !== null && approveEnabledModules.length > 0 ? JSON.stringify(approveEnabledModules) : undefined; await tenantService.approveApplication(record.id, { planType: values.planType, trialDays: values.planType === 'TRIAL' ? values.trialDays : undefined, enabledModules }); message.success('审批通过，工厂账户已激活'); approveModal.close(); approveForm.resetFields(); fetchData(); }
    catch (e: unknown) { if (e && typeof e === 'object' && 'errorFields' in e && Array.isArray((e as any).errorFields) && (e as any).errorFields.length) return; message.error(e instanceof Error ? e.message : '审批失败'); }
    finally { setProcessingId(null); }
  };

  const handleDeleteTenant = (record: TenantInfo) => {
    const statusLabel = record.status === 'pending_review' ? '待审核' : record.status === 'active' ? '正常' : record.status;
    Modal.confirm({ width: '30vw', title: `确认删除「${record.tenantName}」`, icon: <ExclamationCircleOutlined />, content: record.status === 'active' || record.status === 'disabled' ? `该租户状态为「${statusLabel}」，删除后将同时清除其所有用户、角色、账单数据，此操作不可恢复！` : `将删除该${statusLabel}的入驻申请。`, okText: '确认删除', okButtonProps: { danger: true, type: 'default' }, cancelText: '取消', onOk: async () => { try { await tenantService.deleteTenant(record.id); message.success('已删除'); fetchData(); } catch (e: unknown) { message.error(e instanceof Error ? e.message : '删除失败'); } } });
  };

  const handleRejectApplication = async () => {
    const record = rejectModal.data; if (!record) return;
    try { const values = await rejectReasonForm.validateFields(); setProcessingId(record.id); await tenantService.rejectApplication(record.id, values.reason); message.success('已拒绝申请'); rejectModal.close(); rejectReasonForm.resetFields(); fetchData(); }
    catch (e: unknown) { if (e && typeof e === 'object' && 'errorFields' in e && Array.isArray((e as any).errorFields) && (e as any).errorFields.length) return; message.error(e instanceof Error ? e.message : '操作失败'); }
    finally { setProcessingId(null); }
  };

  const handleMarkPaid = async (record: TenantInfo) => {
    const isPaid = record.paidStatus === 'PAID';
    Modal.confirm({ width: '30vw', title: isPaid ? `取消「${record.tenantName}」的已付费状态` : `标记「${record.tenantName}」为已付费`, okText: isPaid ? '取消付费' : '标记已付费', cancelText: '取消', onOk: async () => { try { await tenantService.markTenantPaid(record.id, isPaid ? 'TRIAL' : 'PAID'); message.success(isPaid ? '已取消付费状态' : '已标记为已付费'); fetchData(); } catch (e: unknown) { message.error(e instanceof Error ? e.message : '操作失败'); } } });
  };

  const handleOpenGrantModal = async (record: TenantInfo) => {
    setGrantAppCodes([]);
    setRevokeAppCodes([]);
    setGrantDuration(0);
    setTenantSubscriptions([]);
    grantModal.open(record);
    setLoadingSubs(true);
    try {
      const res: any = await appStoreService.adminGetTenantSubscriptions(record.id);
      const subs = res?.data || res || [];
      setTenantSubscriptions(subs);
    } catch { setTenantSubscriptions([]); }
    finally { setLoadingSubs(false); }
  };

  const handleGrantModules = async () => {
    const record = grantModal.data; if (!record) return;
    if (grantAppCodes.length === 0 && revokeAppCodes.length === 0) { message.warning('请至少选择一个操作'); return; }
    setGranting(true);
    try {
      if (revokeAppCodes.length > 0) {
        const res: any = await appStoreService.adminRevokeFromTenant({ tenantId: record.id, appCodes: revokeAppCodes });
        const d = res?.data || res;
        if (d?.revoked?.length > 0) message.success(`已撤销「${d.tenantName}」的：${d.revoked.join('、')}`);
        if (d?.failed?.length > 0) message.warning(`撤销失败：${d.failed.join('；')}`);
      }
      if (grantAppCodes.length > 0) {
        const res: any = await appStoreService.adminGrantToTenant({ tenantId: record.id, appCodes: grantAppCodes, durationMonths: grantDuration });
        const d = res?.data || res;
        if (d?.activated?.length > 0) message.success(`已为「${d.tenantName}」开通：${d.activated.join('、')}`);
        if (d?.failed?.length > 0) message.warning(`开通失败：${d.failed.join('；')}`);
      }
      grantModal.close();
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '操作失败'); }
    finally { setGranting(false); }
  };

  const TENANT_TYPE_MAP: Record<string, { color: string; label: string }> = { SELF_FACTORY: { color: 'blue', label: '自建工厂' }, HYBRID: { color: 'green', label: '混合型' }, BRAND: { color: 'purple', label: '纯品牌' } };

  const columns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '类型', dataIndex: 'tenantType', width: 80, align: 'center', render: (v: string) => { const cfg = TENANT_TYPE_MAP[v] || { color: 'default', label: v || '混合型' }; return <Tag color={cfg.color}>{cfg.label}</Tag>; } },
    { title: '租户编码', dataIndex: 'tenantCode', width: 110, render: (v: string) => v || <span style={{color:'#bbb'}}>待分配</span> },
    { title: '主账号', dataIndex: 'ownerUsername', width: 110, render: (v: string, r: TenantInfo) => v || r.applyUsername || '-' },
    { title: '联系人', dataIndex: 'contactName', width: 90 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 120 },
    { title: '账户状态', dataIndex: 'status', width: 90, align: 'center', render: (s: string) => { const map: Record<string, {color:string, label:string}> = { active: {color:'green', label:'正常'}, disabled: {color:'red', label:'停用'}, pending_review: {color:'orange', label:'待审核'}, rejected: {color:'default', label:'已拒绝'} }; const cfg = map[s] || {color:'default', label: s}; return <Tag color={cfg.color}>{cfg.label}</Tag>; } },
    { title: '付费状态', dataIndex: 'paidStatus', width: 90, align: 'center', render: (s: string, r: TenantInfo) => r.status === 'active' ? <Tag color={s === 'PAID' ? 'gold' : 'default'}>{s === 'PAID' ? '已付费' : '免费试用'}</Tag> : '-' },
    { title: '最大用户数', dataIndex: 'maxUsers', width: 90, align: 'center', render: (v: number, r: TenantInfo) => r.status === 'active' ? v : '-' },
    { title: '申请时间', dataIndex: 'createTime', width: 150 },
    { title: '操作', key: 'actions', width: 200, render: (_: unknown, record: TenantInfo) => {
      if (record.status === 'pending_review') { return <RowActions actions={[{ key: 'approve', label: '审批通过', primary: true, disabled: processingId === record.id, onClick: () => handleApproveApplication(record) }, { key: 'reject', label: '拒绝', danger: true, onClick: () => { rejectReasonForm.resetFields(); rejectModal.open(record); } }, { key: 'delete', label: '删除', danger: true, onClick: () => handleDeleteTenant(record) }]} />; }
      return <RowActions actions={[{ key: 'qrcode', label: '注册码', primary: true, onClick: () => qrModal.open(record) }, { key: 'grantModules', label: '应用权限', onClick: () => handleOpenGrantModal(record) }, { key: 'menuModules', label: '菜单模块', onClick: () => handleOpenModuleConfig(record) }, { key: 'markPaid', label: record.paidStatus === 'PAID' ? '取消付费' : '标记已付费', onClick: () => handleMarkPaid(record) }, { key: 'resetPwd', label: '重置密码', onClick: () => { resetPwdForm.resetFields(); resetPwdModal.open(record); } }, { key: 'webhook', label: '企微Webhook', onClick: () => { webhookForm.setFieldsValue({ wechatWorkWebhookUrl: record.wechatWorkWebhookUrl || '' }); webhookModal.open(record); } }, { key: 'toggle', label: record.status === 'active' ? '停用' : '启用', danger: record.status === 'active', onClick: () => handleToggleStatus(record) }, { key: 'delete', label: '删除', danger: true, onClick: () => handleDeleteTenant(record) }]} />;
    }},
  ];

  const getRegisterUrl = (tenant: TenantInfo) => `${window.location.origin}/register?tenantCode=${encodeURIComponent(tenant.tenantCode)}&tenantName=${encodeURIComponent(tenant.tenantName)}`;
  const handleCopyLink = (tenant: TenantInfo) => { navigator.clipboard.writeText(getRegisterUrl(tenant)).then(() => message.success('注册链接已复制')).catch(() => { const input = document.createElement('input'); input.value = getRegisterUrl(tenant); document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input); message.success('注册链接已复制'); }); };
  const handleCopyCode = (tenantCode: string) => { navigator.clipboard.writeText(tenantCode).then(() => message.success('工厂编码已复制')).catch(() => { const input = document.createElement('input'); input.value = tenantCode; document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input); message.success('工厂编码已复制'); }); };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[{ key: '', label: '全部' }, { key: 'pending_review', label: '待审核', color: 'orange' }, { key: 'active', label: '正常', color: 'green' }, { key: 'disabled', label: '停用', color: 'red' }, { key: 'rejected', label: '已拒绝', color: 'default' }].map(tab => (
            <Tag key={tab.key} color={statusTab === tab.key ? (tab.color || 'blue') : undefined} style={{ cursor: 'pointer', padding: '3px 12px', fontSize: 14, border: statusTab === tab.key ? undefined : '1px solid #d9d9d9' }} onClick={() => { setStatusTab(tab.key); setQueryParams(p => ({ ...p, status: tab.key, page: 1 })); }}>{tab.label}</Tag>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Input.Search placeholder="搜索工厂名称" allowClear onSearch={(v) => setQueryParams(p => ({ ...p, tenantName: v, page: 1 }))} style={{ width: 200 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { modal.open(); }}>新建租户</Button>
        </div>
      </div>
      <ResizableTable storageKey="customer-tenant-list" rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, onChange: (p, ps) => setQueryParams(prev => ({ ...prev, page: p, pageSize: ps })) }} size="small" />

      <SmallModal open={rejectModal.visible} title={`拒绝入驻申请 - ${rejectModal.data?.tenantName || ''}`} onCancel={() => { rejectModal.close(); rejectReasonForm.resetFields(); }} footer={<Space><Button onClick={() => { rejectModal.close(); rejectReasonForm.resetFields(); }}>取消</Button><Button danger type="default" loading={processingId === rejectModal.data?.id} onClick={handleRejectApplication}>确认拒绝</Button></Space>}>
        <Form form={rejectReasonForm} layout="vertical"><Alert title={`申请账号：${rejectModal.data?.applyUsername || '-'}`} type="warning" showIcon style={{ marginBottom: 16 }} /><Form.Item label="拒绝原因" name="reason" rules={[{ required: true, message: '请填写拒绝原因' }]}><Input.TextArea rows={3} placeholder="请填写拒绝原因（将记录在备注中）" /></Form.Item></Form>
      </SmallModal>

      <ResizableModal open={modal.visible} title="新建租户" onCancel={modal.close} width="40vw" footer={<Space><Button onClick={modal.close}>取消</Button><Button type="primary" onClick={handleCreate}>确认创建</Button></Space>}>
        <Form form={form} layout="vertical">
          <Form.Item label="租户类型" name="tenantType" initialValue="HYBRID" rules={[{ required: true }]} style={{ marginBottom: 16 }}><Radio.Group style={{ width: '100%' }}><div style={{ display: 'flex', gap: 8 }}><Radio value="SELF_FACTORY" style={{ flex: 1, margin: 0, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}> 自建工厂</span><div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>含裁剪管理，不含外发工厂</div></Radio><Radio value="HYBRID" style={{ flex: 1, margin: 0, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}> 混合型（推荐）</span><div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>自有产线 + 外发合作，全功能</div></Radio><Radio value="BRAND" style={{ flex: 1, margin: 0, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}> 纯品牌 / 贸易</span><div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 }}>全部外发，不含裁剪管理</div></Radio></div></Radio.Group></Form.Item>
          <Form.Item label="初始套餐" name="planType" initialValue="TRIAL" rules={[{ required: true }]} style={{ marginBottom: 12 }}><Select onChange={handleCreatePlanChange}>{PLAN_OPTIONS.map(plan => (<Select.Option key={plan.value} value={plan.value}>{plan.label}（{plan.monthlyFee === 0 ? '免费试用' : `¥${plan.monthlyFee}/月`}，{plan.maxUsers}用户，{plan.storageQuotaMb >= 1024 ? `${plan.storageQuotaMb / 1024}GB` : `${plan.storageQuotaMb}MB`}）</Select.Option>))}</Select></Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.planType !== cur.planType}>{({ getFieldValue }) => { const plan = PLAN_OPTIONS.find((item) => item.value === getFieldValue('planType')); if (!plan) return null; return <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`当前套餐：${plan.label}`} description={`${plan.monthlyFee === 0 ? '免费试用' : `¥${plan.monthlyFee}/月`} · ${plan.maxUsers} 用户 · ${plan.storageQuotaMb >= 1024 ? `${plan.storageQuotaMb / 1024}GB` : `${plan.storageQuotaMb}MB`} 存储`} />; }}</Form.Item>
          <div style={{ display: 'flex', gap: 12 }}><Form.Item label="租户名称" name="tenantName" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 12 }}><Input /></Form.Item><Form.Item label="租户编码" name="tenantCode" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 12 }}><Input placeholder="唯一编码，工人注册用" /></Form.Item></div>
          <div style={{ display: 'flex', gap: 12 }}><Form.Item label="联系人" name="contactName" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 12 }}><Input /></Form.Item><Form.Item label="联系电话" name="contactPhone" style={{ flex: 1, marginBottom: 12 }}><Input /></Form.Item><Form.Item label="最大用户数" name="maxUsers" style={{ flex: '0 0 120px', marginBottom: 12 }}><InputNumber min={1} max={9999} style={{ width: '100%' }} disabled /></Form.Item></div>
          <div style={{ background: 'rgba(45, 127, 249, 0.08)', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}><div style={{ fontWeight: 600, marginBottom: 8 }}>主账号信息</div><Form.Item label="用户名" name="ownerUsername" rules={[{ required: true }]}><Input /></Form.Item><Form.Item label="密码" name="ownerPassword" rules={[{ required: true, min: 6 }]}><Input.Password autoComplete="new-password" /></Form.Item><Form.Item label="姓名" name="ownerName"><Input /></Form.Item></div>
        </Form>
      </ResizableModal>

      <ResizableModal open={qrModal.visible} title={`注册二维码 - ${qrModal.data?.tenantName || ''}`} onCancel={qrModal.close} width="40vw" footer={<Button onClick={qrModal.close}>关闭</Button>}>
        {qrModal.data && (<div style={{ textAlign: 'center', padding: '24px 0' }}><div style={{ marginBottom: 20 }}><QRCode value={getRegisterUrl(qrModal.data)} size={240} style={{ margin: '0 auto' }} /></div><div style={{ marginBottom: 16 }}><Text type="secondary">员工扫码或打开链接即可注册到该工厂</Text></div><Card size="small" style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto', background: '#f8f9fa', borderRadius: 8 }}><div style={{ marginBottom: 12 }}><Text strong>工厂名称：</Text><Text>{qrModal.data.tenantName}</Text></div><div style={{ marginBottom: 12 }}><Text strong>工厂编码：</Text><Text code copyable={{ text: qrModal.data.tenantCode }}>{qrModal.data.tenantCode}</Text></div><div style={{ marginBottom: 12 }}><Text strong>注册链接：</Text><div style={{ wordBreak: 'break-all', marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>{getRegisterUrl(qrModal.data)}</Text></div></div><Space><Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyLink(qrModal.data!)}>复制链接</Button><Button size="small" icon={<QrcodeOutlined />} onClick={() => handleCopyCode(qrModal.data!.tenantCode)}>复制编码</Button></Space></Card><div style={{ marginTop: 16 }}><Text type="secondary" style={{ fontSize: 12 }}>提示：员工注册后需要管理员在「注册审批」中审批通过后才能使用</Text></div></div>)}
      </ResizableModal>

      <SmallModal open={webhookModal.visible} title={`企业微信 Webhook - ${webhookModal.data?.tenantName || ''}`} onCancel={() => { webhookModal.close(); webhookForm.resetFields(); }} footer={<Space><Button onClick={() => { webhookModal.close(); webhookForm.resetFields(); }}>取消</Button><Button type="primary" loading={savingWebhook} onClick={async () => { const record = webhookModal.data; if (!record) return; try { setSavingWebhook(true); const values = webhookForm.getFieldsValue(); const res: any = await tenantService.updateTenant(record.id, { wechatWorkWebhookUrl: String(values.wechatWorkWebhookUrl || '').trim() }); if (res?.code === 200 || res?.data) { message.success('Webhook 已保存'); webhookModal.close(); webhookForm.resetFields(); } else { message.error(res?.message || '保存失败'); } } catch (e: unknown) { message.error(e instanceof Error ? e.message : '保存失败'); } finally { setSavingWebhook(false); } }}>保存</Button></Space>}>
        <Form form={webhookForm} layout="vertical"><Form.Item label="企业微信群机器人 Webhook URL" name="wechatWorkWebhookUrl" extra="留空则使用平台全局 Webhook"><Input placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." allowClear autoComplete="url" /></Form.Item></Form>
      </SmallModal>

      <SmallModal open={resetPwdModal.visible} title={`重置主账号密码 - ${resetPwdModal.data?.tenantName || ''}`} onCancel={() => { resetPwdModal.close(); resetPwdForm.resetFields(); }} footer={<Space><Button onClick={() => { resetPwdModal.close(); resetPwdForm.resetFields(); }}>取消</Button><Button type="default" danger loading={resettingPwd} onClick={handleResetOwnerPassword}>确认重置</Button></Space>}>
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>主账号：<strong style={{ color: 'var(--primary-color)' }}>{resetPwdModal.data?.ownerUsername || resetPwdModal.data?.applyUsername || '-'}</strong></div>
        <Form form={resetPwdForm} layout="vertical"><Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 6, message: '密码不能少于6位' }]}><Input.Password placeholder="请输入新密码（至少6位）" autoComplete="new-password" /></Form.Item><Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: '请再次输入新密码' }]}><Input.Password placeholder="请再次输入新密码" autoComplete="new-password" /></Form.Item></Form>
      </SmallModal>

      <ResizableModal open={grantModal.visible} title={<><AppstoreOutlined style={{ marginRight: 6 }} />管理「{grantModal.data?.tenantName || ''}」的应用权限</>} onCancel={grantModal.close} width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)} footer={<Space><Button onClick={grantModal.close}>取消</Button><Button type="primary" loading={granting} onClick={handleGrantModules} disabled={grantAppCodes.length === 0 && revokeAppCodes.length === 0}>{grantAppCodes.length > 0 && revokeAppCodes.length > 0 ? '开通 + 撤销' : grantAppCodes.length > 0 ? '确认开通' : '确认撤销'}</Button></Space>}>
        <Alert title="超管可直接为租户开通或撤销应用商店中的任意应用，无需租户下单付费。API 对接类应用开通后自动生成凭证。" type="info" showIcon style={{ marginBottom: 16 }} />
        {loadingSubs ? <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>加载订阅状态...</div> : (() => {
          const activeSubs = new Set(tenantSubscriptions.filter((s: any) => s.status === 'ACTIVE' || s.status === 'TRIAL').map((s: any) => s.app_code));
          const subMap = new Map(tenantSubscriptions.map((s: any) => [s.app_code, s]));
          const categories = [...new Set(MODULE_OPTIONS.map(o => o.category))];
          return (
            <div style={{ maxHeight: 'calc(82vh - 220px)', overflowY: 'auto', paddingRight: 4 }}>
              {categories.map(cat => {
                const opts = MODULE_OPTIONS.filter(o => o.category === cat);
                return (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-secondary, #666)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--color-border-light, #f0f0f0)' }}>{cat}</div>
                    {opts.map(opt => {
                      const isActive = activeSubs.has(opt.value);
                      const sub = subMap.get(opt.value);
                      const willGrant = grantAppCodes.includes(opt.value);
                      const willRevoke = revokeAppCodes.includes(opt.value);
                      return (
                        <div key={opt.value} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, marginBottom: 4, background: willGrant ? 'rgba(82,196,26,0.06)' : willRevoke ? 'rgba(255,77,79,0.06)' : 'transparent', border: willGrant ? '1px solid rgba(82,196,26,0.2)' : willRevoke ? '1px solid rgba(255,77,79,0.2)' : '1px solid transparent', transition: 'all 0.2s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 500 }}>{opt.label}</span>
                            {isActive ? <Tag color="green" style={{ margin: 0, fontSize: 11 }}>已开通</Tag> : <Tag style={{ margin: 0, fontSize: 11 }}>未开通</Tag>}
                            {sub?.end_time && isActive && <span style={{ fontSize: 11, color: '#999' }}>到期 {String(sub.end_time).substring(0, 10)}</span>}
                          </div>
                          <Space size={4}>
                            {!isActive && !willGrant && <Button size="small" type="link" onClick={() => setGrantAppCodes([...grantAppCodes, opt.value])}>开通</Button>}
                            {willGrant && <Button size="small" type="link" style={{ color: '#52c41a' }} onClick={() => setGrantAppCodes(grantAppCodes.filter(c => c !== opt.value))}>✓ 将开通</Button>}
                            {isActive && !willRevoke && <Button size="small" type="link" danger onClick={() => setRevokeAppCodes([...revokeAppCodes, opt.value])}>撤销</Button>}
                            {willRevoke && <Button size="small" type="link" style={{ color: '#ff4d4f' }} onClick={() => setRevokeAppCodes(revokeAppCodes.filter(c => c !== opt.value))}>✓ 将撤销</Button>}
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}
        {grantAppCodes.length > 0 && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(82,196,26,0.06)', borderRadius: 8, border: '1px solid rgba(82,196,26,0.15)' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>开通有效期：</div>
            <Radio.Group value={grantDuration} onChange={(e) => setGrantDuration(e.target.value)}>{DURATION_OPTIONS.map(opt => (<Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>))}</Radio.Group>
          </div>
        )}
        {(grantAppCodes.length > 0 || revokeAppCodes.length > 0) && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
            {grantAppCodes.length > 0 && <span>将开通 {grantAppCodes.length} 个应用</span>}
            {grantAppCodes.length > 0 && revokeAppCodes.length > 0 && <span> · </span>}
            {revokeAppCodes.length > 0 && <span style={{ color: '#ff4d4f' }}>将撤销 {revokeAppCodes.length} 个应用</span>}
          </div>
        )}
      </ResizableModal>

      <ResizableModal open={approveModal.visible} title={`审批通过 - ${approveModal.data?.tenantName || ''}`} onCancel={() => { approveModal.close(); approveForm.resetFields(); setApproveEnabledModules(null); }} width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)} footer={<Space><Button onClick={() => { approveModal.close(); approveForm.resetFields(); setApproveEnabledModules(null); }}>取消</Button><Button type="primary" loading={processingId === approveModal.data?.id} onClick={handleConfirmApprove}>确认审批</Button></Space>}>
        <Alert title={`将为「${approveModal.data?.tenantName || ''}」创建主账号「${approveModal.data?.applyUsername || ''}」并激活工厂账户`} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={approveForm} layout="vertical" initialValues={{ planType: 'TRIAL', trialDays: 30 }}>
          <Form.Item label="选择套餐" name="planType" rules={[{ required: true, message: '请选择套餐' }]}><Select>{PLAN_OPTIONS.map(p => (<Select.Option key={p.value} value={p.value}>{p.label}（{p.monthlyFee === 0 ? '免费试用' : `¥${p.monthlyFee}/月`}，{p.maxUsers}用户，{p.storageQuotaMb >= 1024 ? `${p.storageQuotaMb / 1024}GB` : `${p.storageQuotaMb}MB`}）</Select.Option>))}</Select></Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.planType !== cur.planType}>{({ getFieldValue }) => getFieldValue('planType') === 'TRIAL' ? (<Form.Item label="免费试用期" name="trialDays" rules={[{ required: true, message: '请选择试用期' }]}><Radio.Group>{TRIAL_OPTIONS.map(t => (<Radio.Button key={t.value} value={t.value}>{t.label}</Radio.Button>))}</Radio.Group></Form.Item>) : (<Alert title="付费套餐将在审批通过后立即生效，可在「套餐与收费」中随时调整" type="warning" showIcon style={{ marginBottom: 16 }} />)}</Form.Item>
        </Form>
        <ModuleConfigPanel selectedModules={approveEnabledModules} setSelectedModules={setApproveEnabledModules} />
      </ResizableModal>

      <ResizableModal open={moduleModal.visible} title={`编辑菜单模块 - ${moduleModal.data?.tenantName || ''}`} onCancel={() => moduleModal.close()} width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)} footer={<Space><Button onClick={() => moduleModal.close()}>取消</Button><Button type="primary" loading={savingModules} onClick={handleSaveModuleConfig}>保存配置</Button></Space>}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} title="这里修改的是租户登录后的菜单白名单。应用商店和集成中心始终可见，不在白名单范围内。" />
        <ModuleConfigPanel selectedModules={editingEnabledModules} setSelectedModules={setEditingEnabledModules} />
      </ResizableModal>
    </div>
  );
};

export default TenantListTab;
