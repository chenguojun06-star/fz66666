import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Select, Space, Tabs, Tag } from 'antd';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SmallModal from '@/components/common/SmallModal';
import { User } from '@/types/system';
import api from '@/utils/api';
import tenantService from '@/services/tenantService';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useAuth } from '@/utils/AuthContext';
import './styles.css';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';

const { TextArea } = Input;

const UserApproval: React.FC = () => {
  const { isMobile } = useViewport();
  const { isTenantOwner } = useAuth();
  const [activeTab, setActiveTab] = useState('tenant');
  const [loading, setLoading] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  const [factoryLoading, setFactoryLoading] = useState(false);
  const [factoryPending, setFactoryPending] = useState<User[]>([]);
  const [factoryTotal, setFactoryTotal] = useState(0);

  const fetchRoleOptions = useCallback(async () => {
    setRoleLoading(true);
    try {
      const response = await api.get('/system/role/list', {
        params: { page: 1, pageSize: 100 }
      });
      const result = response as any;
      if (result.code === 200) {
        setRoleOptions(Array.isArray(result.data?.records) ? result.data.records : []);
      }
    } catch (error) {
      console.error('获取角色选项失败', error);
      message.error('获取角色选项失败');
    } finally {
      setRoleLoading(false);
    }
  }, []);

  const fetchPendingUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/system/user/pending', {
        params: { page, pageSize }
      });
      const result = response as any;
      if (result.code === 200) {
        setPendingUsers(result.data?.records || []);
        setTotal(result.data?.total || 0);
      } else {
        message.error(result.message || '获取待审批用户失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取待审批用户失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const fetchFactoryPending = useCallback(async () => {
    setFactoryLoading(true);
    try {
      const response = await tenantService.listPendingRegistrations({ page: 1, pageSize: 100 });
      const result = response as any;
      if (result.code === 200) {
        setFactoryPending(result.data?.records || []);
        setFactoryTotal(result.data?.total || 0);
      } else {
        message.error(result.message || '获取外发工厂待审批员工失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取外发工厂待审批员工失败');
    } finally {
      setFactoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingUsers();
    fetchRoleOptions();
    if (isTenantOwner) {
      fetchFactoryPending();
    }
  }, [fetchPendingUsers, fetchRoleOptions, fetchFactoryPending, isTenantOwner]);

  const handleApprove = (user: User) => {
    setCurrentUser(user);
    setSelectedRoleId(user.roleId ? String(user.roleId) : '');
    setApproveReason('');
    setApproveModalVisible(true);
  };

  const confirmApprove = async () => {
    if (!currentUser) return;

    if (!selectedRoleId) {
      message.warning('请选择角色');
      return;
    }

    if (!approveReason.trim()) {
      message.warning('请输入批准原因');
      return;
    }

    try {
      const approveResponse = await api.post(`/system/user/${currentUser.id}/approval-action`, {
        operationRemark: approveReason
      }, { params: { action: 'approve' } });
      const approveResult = approveResponse as any;

      if (approveResult.code === 200) {
        const updateResponse = await api.put(`/system/user`, {
          id: currentUser.id,
          roleId: Number(selectedRoleId),
          status: 'active',
          approvalStatus: 'approved',
          operationRemark: approveReason
        });
        const updateResult = updateResponse as any;

        if (updateResult.code === 200) {
          message.success('用户已批准并分配角色');
          setApproveModalVisible(false);
          setCurrentUser(null);
          setSelectedRoleId('');
          setApproveReason('');
          fetchPendingUsers();
        } else {
          message.error(updateResult.message || '分配角色失败');
        }
      } else {
        message.error(approveResult.message || '批准失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const handleReject = (user: User) => {
    setCurrentUser(user);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const confirmReject = async () => {
    if (!currentUser) return;

    if (!rejectReason.trim()) {
      message.warning('请输入拒绝原因');
      return;
    }

    try {
      const response = await api.post(`/system/user/${currentUser.id}/approval-action`, {
        approvalRemark: rejectReason
      }, { params: { action: 'reject' } });
      const result = response as any;
      if (result.code === 200) {
        message.success('用户已拒绝');
        setRejectModalVisible(false);
        setCurrentUser(null);
        setRejectReason('');
        fetchPendingUsers();
      } else {
        message.error(result.message || '拒绝失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '拒绝失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '角色', dataIndex: 'roleName', key: 'roleName', width: 120, render: (text: string) => text || '-' },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 120, render: (text: string) => text || '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 180, render: (text: string) => text || '-' },
    { title: '注册时间', dataIndex: 'createTime', key: 'createTime', width: 160, render: (time: string) => formatDateTime(time) },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: any, record: User) => (
        <RowActions
          actions={[
            { key: 'approve', label: '批准', title: '批准', onClick: () => handleApprove(record), primary: true },
            { key: 'reject', label: '拒绝', title: '拒绝', onClick: () => handleReject(record), danger: true },
          ]}
        />
      ),
    },
  ];

  const factoryColumns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 120, render: (text: string) => text || '-' },
    {
      title: '所属工厂', dataIndex: 'factoryName', key: 'factoryName', width: 140,
      render: (v: string, record: User) => v ? <Tag color="blue">{v}</Tag> : (record.factoryId ? <Tag color="blue">外发工厂</Tag> : '-'),
    },
    { title: '注册时间', dataIndex: 'createTime', key: 'createTime', width: 160, render: (time: string) => formatDateTime(time) },
    {
      title: '状态', key: 'status', width: 100,
      render: () => <Tag color="orange">待外发工厂审批</Tag>,
    },
  ];

  const tabItems = [
    {
      key: 'tenant',
      label: `租户员工审批 (${total})`,
      children: (
        <>
          {pendingUsers.length === 0 && !loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审批用户" />
          ) : (
            <>
              <Alert message={`当前有 ${total} 个租户员工待审批`} type="info" showIcon style={{ marginBottom: 16 }} />
              <ResizableTable
                columns={columns}
                dataSource={pendingUsers}
                rowKey="id"
                loading={loading}
                pagination={{
                  current: page, pageSize, total,
                  showSizeChanger: true, showQuickJumper: true,
                  showTotal: (t) => `共 ${t} 条`,
                  pageSizeOptions: ['10', '20', '50', '100'],
                  onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                }}
                stickyHeader
                scroll={{ x: isMobile ? 'max-content' : undefined }}
              />
            </>
          )}
        </>
      ),
    },
    ...(isTenantOwner ? [{
      key: 'factory',
      label: `外发工厂员工（只读）(${factoryTotal})`,
      children: (
        <>
          {factoryPending.length === 0 && !factoryLoading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无外发工厂待审批员工" />
          ) : (
            <>
              <Alert
                message="以下为外发工厂的待审批员工，由各外发工厂管理员自行审批，租户仅可查看"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <ResizableTable
                columns={factoryColumns}
                dataSource={factoryPending}
                rowKey="id"
                loading={factoryLoading}
                pagination={false}
                stickyHeader
                scroll={{ x: isMobile ? 'max-content' : undefined }}
              />
            </>
          )}
        </>
      ),
    }] : []),
  ];

  return (
    <Layout>
        <Card>
          <div className="page-header">
            <div>
              <h2 className="page-title">用户审批</h2>
              <p className="page-description">审批新注册的用户账号</p>
            </div>
            <Space>
              <Button onClick={() => { fetchPendingUsers(); if (isTenantOwner) fetchFactoryPending(); }} loading={loading}>
                刷新
              </Button>
            </Space>
          </div>

          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        </Card>

        <Modal
          title="批准用户"
          open={approveModalVisible}
          onOk={confirmApprove}
          onCancel={() => {
            setApproveModalVisible(false);
            setCurrentUser(null);
            setSelectedRoleId('');
            setApproveReason('');
          }}
          okText="批准并分配角色"
          cancelText="取消"
          width="40vw"
        >
          <div style={{ marginBottom: 16 }}>
            <p>
              批准用户"<strong>{currentUser?.name || currentUser?.username}</strong>"
            </p>
            <p style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)", marginBottom: 16 }}>
              批准后该用户可以正常登录系统
            </p>
            <div>
              <div style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                选择角色<span style={{ color: 'var(--color-danger)' }}>*</span>
              </div>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择角色"
                value={selectedRoleId}
                onChange={setSelectedRoleId}
                loading={roleLoading}
                options={roleOptions.map(role => ({
                  label: role.roleName || role.name,
                  value: String(role.id)
                }))}
              />
              <div style={{ display: 'block', margin: '16px 0 8px', fontWeight: 500 }}>
                批准原因<span style={{ color: 'var(--color-danger)' }}>*</span>
              </div>
              <TextArea
                rows={3}
                maxLength={200}
                showCount
                value={approveReason}
                onChange={(e) => setApproveReason(e.target.value)}
                placeholder="请输入批准原因"
              />
            </div>
          </div>
        </Modal>

        <SmallModal
          title="拒绝用户"
          open={rejectModalVisible}
          onOk={confirmReject}
          onCancel={() => {
            setRejectModalVisible(false);
            setCurrentUser(null);
            setRejectReason('');
          }}
          okText="确定拒绝"
          cancelText="取消"
          okButtonProps={{ danger: true, type: 'default' }}
        >
          <div style={{ marginBottom: 16 }}>
            <p>
              确定拒绝用户"<strong>{currentUser?.name || currentUser?.username}</strong>"吗？
            </p>
            <p style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>拒绝后该用户将无法登录系统</p>
          </div>
          <TextArea
            placeholder="请输入拒绝原因"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            maxLength={200}
            showCount
          />
        </SmallModal>
    </Layout>
  );
};

export default UserApproval;
