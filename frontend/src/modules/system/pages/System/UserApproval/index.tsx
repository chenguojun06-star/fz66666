import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, message, Modal, Select, Space } from 'antd';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { User } from '@/types/system';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import './styles.css';

const { TextArea } = Input;

const UserApproval: React.FC = () => {
  const { isMobile } = useViewport();
  const [loading, setLoading] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    fetchPendingUsers();
    fetchRoleOptions();
  }, [page, pageSize]);

  const fetchRoleOptions = async () => {
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
    } finally {
      setRoleLoading(false);
    }
  };

  const fetchPendingUsers = async () => {
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
    } catch (error: any) {
      message.error(error?.message || '获取待审批用户失败');
    } finally {
      setLoading(false);
    }
  };

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
      // 先批准用户
      const approveResponse = await api.post(`/system/user/${currentUser.id}/approval-action`, {
        operationRemark: approveReason
      }, { params: { action: 'approve' } });
      const approveResult = approveResponse as any;

      if (approveResult.code === 200) {
        // 更新用户角色
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
    } catch (error: any) {
      message.error(error?.message || '操作失败');
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
    } catch (error: any) {
      message.error(error?.message || '拒绝失败');
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'roleName',
      key: 'roleName',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      render: (text: string) => text || '-',
    },
    {
      title: '注册时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (time: string) => formatDateTime(time),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: User) => (
        <RowActions
          actions={[
            {
              key: 'approve',
              label: '批准',
              title: '批准',
              onClick: () => handleApprove(record),
              primary: true,
            },
            {
              key: 'reject',
              label: '拒绝',
              title: '拒绝',
              onClick: () => handleReject(record),
              danger: true,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <div className="page-container">
        <Card>
          <div className="page-header">
            <div>
              <h2 className="page-title">用户审批</h2>
              <p className="page-description">审批新注册的用户账号</p>
            </div>
            <Space>
              <Button
                onClick={fetchPendingUsers}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>

          {pendingUsers.length === 0 && !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无待审批用户"
            />
          ) : (
            <>
              <Alert
                title={`当前有 ${total} 个用户待审批`}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <ResizableTable
                columns={columns}
                dataSource={pendingUsers}
                rowKey="id"
                loading={loading}
                pagination={{
                  current: page,
                  pageSize: pageSize,
                  total: total,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 条`,
                  pageSizeOptions: ['10', '20', '50', '100'],
                  onChange: (page, pageSize) => {
                    setPage(page);
                    setPageSize(pageSize);
                  },
                }}
                scroll={{ x: isMobile ? 'max-content' : undefined }}
              />
            </>
          )}
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

        <Modal
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
          okButtonProps={{ danger: true }}
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
        </Modal>
      </div>
    </Layout>
  );
};

export default UserApproval;
