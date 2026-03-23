import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tag, Space, message, Form, Input, Modal, Card, Typography, Alert, Badge } from 'antd';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import { useAuth } from '@/utils/AuthContext';
import tenantService from '@/services/tenantService';
import type { TenantInfo } from '@/services/tenantService';
import type { ColumnsType } from 'antd/es/table';

// ========== 注册审批 Tab ==========
const RegistrationTab: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [tenantApps, setTenantApps] = useState<TenantInfo[]>([]);
  const [tenantAppsLoading, setTenantAppsLoading] = useState(false);
  const editModal = useModal<TenantInfo>();
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  // 拒绝入驻弹窗状态
  const [pendingRejectTenant, setPendingRejectTenant] = useState<TenantInfo | null>(null);
  const [rejectTenantLoading, setRejectTenantLoading] = useState(false);

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
      width: '30vw',
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

  const handleRejectTenant = (record: TenantInfo) => {
    setPendingRejectTenant(record);
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!pendingRejectTenant) return;
    setRejectTenantLoading(true);
    try {
      await tenantService.rejectApplication(pendingRejectTenant.id, reason || '不符合要求');
      message.success('已拒绝');
      setPendingRejectTenant(null);
      fetchTenantApps();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setRejectTenantLoading(false);
    }
  };

  useEffect(() => {
    if (!editModal.visible || !editModal.data) {
      editForm.resetFields();
      return;
    }
    const record = editModal.data;
    editForm.setFieldsValue({
      applyUsername: record.applyUsername,
      contactName: record.contactName,
      contactPhone: record.contactPhone,
    });
  }, [editForm, editModal.data, editModal.visible]);

  const handleEditApplication = (record: TenantInfo) => {
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
        title="功能说明"
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
          title="如果申请账号已被其他工厂占用，可以在此修改后再审批通过。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={editForm} layout="vertical">
          <Form.Item label="申请账号" name="applyUsername" rules={[{ required: true, message: '账号不能为空' }]}>
            <Input id="applyUsername" placeholder="修改后将用此账号创建主账号" />
          </Form.Item>
          <Form.Item label="联系人" name="contactName">
            <Input id="contactName" />
          </Form.Item>
          <Form.Item label="联系电话" name="contactPhone">
            <Input id="contactPhone" />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 拒绝原因弹窗 */}
      <RejectReasonModal
        open={pendingRejectTenant !== null}
        title={`拒绝「${pendingRejectTenant?.tenantName || ''}」的入驻申请`}
        fieldLabel="拒绝原因"
        okText="确认拒绝"
        loading={rejectTenantLoading}
        onOk={handleRejectConfirm}
        onCancel={() => setPendingRejectTenant(null)}
      />
    </div>
  );
};

export default RegistrationTab;
