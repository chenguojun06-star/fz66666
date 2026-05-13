import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, DatePicker, Input, Select, Space, Spin, Tag, Form, Row, Col } from 'antd';
import { QrcodeOutlined, LinkOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import SmallModal from '@/components/common/SmallModal';
import { message } from '@/utils/antdStatic';
import { useUserListColumns } from './hooks/useUserListColumns';
import { useUserListData } from './hooks/useUserListData';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { User as UserType, OrganizationUnit } from '@/types/system';
import { useUser } from '@/utils/AuthContext';
import tenantService from '@/services/tenantService';
import { LOG_COLUMNS } from './userListUtils';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import { useDebouncedValue } from '@/hooks/usePerformance';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { organizationApi } from '@/services/system/organizationApi';
import './styles.css';

const { Option } = Select;

const DepartmentTree: React.FC<{
  departments: OrganizationUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ departments, selectedId, onSelect }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set<string>();
    const collect = (nodes: OrganizationUnit[]) => {
      for (const n of nodes) {
        if (n.id) ids.add(String(n.id));
        if (n.children?.length) collect(n.children);
      }
    };
    collect(departments);
    setExpandedIds(ids);
  }, [departments]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderNode = (node: OrganizationUnit, depth: number) => {
    const id = String(node.id);
    const isSelected = id === selectedId;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(id);

    return (
      <div key={id}>
        <div
          className={`user-dept-item${isSelected ? ' user-dept-item-selected' : ''}`}
          style={{ paddingLeft: depth * 16 + 8 }}
        >
          <span
            className="user-dept-chevron"
            onClick={() => hasChildren && toggleExpand(id)}
            style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="user-dept-name" onClick={() => onSelect(isSelected ? null : id)}>
            {node.unitName}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="user-dept-tree">
      <div
        className={`user-dept-item${!selectedId ? ' user-dept-item-selected' : ''}`}
        style={{ paddingLeft: 8 }}
      >
        <span className="user-dept-chevron" style={{ opacity: 0 }}>▶</span>
        <span className="user-dept-name" onClick={() => onSelect(null)}>
          全部部门
        </span>
      </div>
      {departments.map(node => renderNode(node, 0))}
    </div>
  );
};

const UserList: React.FC = () => {
  const { user, isSuperAdmin, isTenantOwner } = useUser();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const userModal = useModal<UserType>();
  const logModal = useModal();

  const {
    queryParams, setQueryParams, userList, total, loading, submitLoading,
    smartError, showSmartErrorNotice, canManageUsers,
    remarkModalState, setRemarkModalState, remarkLoading,
    roleOptions, roleOptionsLoading,
    pendingUserCount,
    logLoading, logRecords, setLogRecords, logTitle,
    inviteQr, setInviteQr,
    formRules,
    getUserList, openDialog, closeDialog, handleGenerateInvite,
    handleRemarkConfirm, openLogModal,
    toggleUserStatus, applyRoleToUser, handleSubmit,
    handleResetPassword,
  } = useUserListData({ user, isSuperAdmin, isTenantOwner, form, userModal, logModal, navigate });

  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  const debouncedKeyword = useDebouncedValue(keywordInput, 300);

  useEffect(() => {
    organizationApi.departments().then(list => {
      setDepartments(Array.isArray(list) ? list : []);
    }).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    const params: any = { page: 1, pageSize: queryParams.pageSize };
    if (debouncedKeyword) {
      params.username = debouncedKeyword;
      params.name = debouncedKeyword;
    } else {
      params.username = undefined;
      params.name = undefined;
    }
    params.employmentStatus = employmentFilter || undefined;
    params.roleId = roleFilter || undefined;
    params.orgUnitId = selectedDeptId || undefined;
    setQueryParams(prev => ({ ...prev, ...params, page: 1 }));
  }, [debouncedKeyword, employmentFilter, roleFilter, selectedDeptId]);

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<{ id: string; name: string }>({ id: '', name: '' });

  const logColumns = LOG_COLUMNS;
  const { columns } = useUserListColumns({
    openDialog,
    applyRoleToUser,
    roleOptions,
    roleOptionsLoading,
    setAccountUser,
    setAccountModalOpen,
    openLogModal,
    toggleUserStatus,
    isTenantOwner,
    onResetPassword: handleResetPassword,
  });

  return (
    <>
        <PageLayout
          title="人员管理"
          headerContent={
            <>
              {showSmartErrorNotice && smartError ? (
                <Card style={{ marginBottom: 12 }}>
                  <SmartErrorNotice error={smartError} onFix={() => { void getUserList(); }} />
                </Card>
              ) : null}
              {pendingUserCount > 0 && canManageUsers && (
                <Alert
                  title={`有 ${pendingUserCount} 个新用户待审批`}
                  description="点击前往审批页面，为新用户分配角色和权限"
                  type="info"
                  showIcon
                  closable
                  action={
                    <Button
                      type="primary"
                      onClick={() => { navigate('/system/user-approval'); }}
                    >
                      立即审批
                    </Button>
                  }
                  style={{ marginBottom: 16 }}
                />
              )}
            </>
          }
        >
          <div className="user-split-layout">
            <div className="user-dept-panel">
              <div className="user-dept-header">部门</div>
              <DepartmentTree
                departments={departments}
                selectedId={selectedDeptId}
                onSelect={setSelectedDeptId}
              />
            </div>

            <div className="user-list-panel">
              <Card className="filter-card mb-sm">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
                  <Space wrap size={12}>
                    <Input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="搜索姓名/手机号"
                      allowClear
                      style={{ width: 200 }}
                    />
                    <Select
                      value={employmentFilter || undefined}
                      onChange={(value) => setEmploymentFilter(value || '')}
                      options={[
                        { label: '全部', value: '' },
                        { label: '正式', value: 'normal' },
                        { label: '试用期', value: 'probation' },
                        { label: '临时工', value: 'temporary' },
                      ]}
                      placeholder="在职状态"
                      allowClear
                      style={{ width: 130 }}
                    />
                    <Select
                      value={roleFilter || undefined}
                      onChange={(value) => setRoleFilter(value || '')}
                      options={[
                        { label: '全部职位', value: '' },
                        ...roleOptions.map(r => ({
                          label: r.roleName || '系统角色',
                          value: String(r.id),
                        })),
                      ]}
                      placeholder="职位"
                      allowClear
                      loading={roleOptionsLoading}
                      style={{ width: 150 }}
                    />
                  </Space>
                  {canManageUsers && (
                    <Space>
                      <Button icon={<QrcodeOutlined />} onClick={handleGenerateInvite}>
                        邀请员工
                      </Button>
                      <Button type="primary" onClick={() => openDialog()}>
                        新增用户
                      </Button>
                    </Space>
                  )}
                </div>
              </Card>

              <ResizableTable
                storageKey="system-user-list"
                columns={columns}
                dataSource={userList}
                rowKey="id"
                loading={loading}
                scroll={{ x: 'max-content' }}
                pagination={{
                  current: queryParams.page,
                  pageSize: queryParams.pageSize,
                  total: total,
                  showTotal: (total) => `共 ${total} 条`,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100'],
                  onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
                }}
              />
            </div>
          </div>
        </PageLayout>

        <ResizableModal
          title={userModal.data ? '编辑人员' : '新增人员'}
          open={userModal.visible}
          onCancel={closeDialog}
          onOk={handleSubmit}
          okText="保存"
          cancelText="取消"
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
          confirmLoading={submitLoading}
        >
          <Form form={form} layout="vertical" autoComplete="off">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="username" label="用户名" rules={formRules.username}>
                  <Input placeholder="请输入用户名" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="name" label="姓名" rules={formRules.name}>
                  <Input placeholder="请输入姓名" autoComplete="name" />
                </Form.Item>
              </Col>
              {!userModal.data && (
                <Col span={8}>
                  <Form.Item name="password" label="密码" rules={formRules.password}>
                    <Input.Password placeholder="请输入密码" autoComplete="new-password" />
                  </Form.Item>
                </Col>
              )}
            </Row>

            <Row gutter={16} className="mt-sm">
              <Col span={8}>
                <Form.Item name="roleId" label="角色" rules={formRules.roleId}>
                  <Select placeholder="请选择角色" loading={roleOptionsLoading}>
                    {roleOptions.map((r) => (
                      <Option key={String(r.id)} value={String(r.id)}>
                        {r.roleName || '系统角色'}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="gender" label="性别">
                  <Select placeholder="请选择性别" allowClear>
                    <Option value="male">男</Option>
                    <Option value="female">女</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="status" label="状态" rules={formRules.status}>
                  <Select placeholder="请选择状态">
                    <Option value="active">启用</Option>
                    <Option value="inactive">停用</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16} className="mt-sm">
              <Col span={8}>
                <Form.Item name="phone" label="手机号" rules={formRules.phone}>
                  <Input placeholder="请输入手机号" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="hireDate" label="入职日期">
                  <DatePicker style={{ width: '100%' }} placeholder="请选择入职日期" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="employmentStatus" label="在职状态">
                  <Select placeholder="请选择在职状态" allowClear>
                    <Option value="normal">正式</Option>
                    <Option value="probation">试用期</Option>
                    <Option value="temporary">临时工</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16} className="mt-sm">
              <Col span={16}>
                <Form.Item name="permissionRange" label="数据权限" rules={formRules.permissionRange}>
                  <Select placeholder="请选择数据权限范围">
                    <Option value="all"><Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>查看全厂数据</Option>
                    <Option value="team"><Tag color="green" style={{ marginRight: 4 }}>团队</Tag>查看团队数据</Option>
                    <Option value="own"><Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>仅查看自己数据</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="email" label="邮箱" rules={formRules.email}>
                  <Input placeholder="请输入邮箱" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </ResizableModal>

        <ResizableModal
          open={logModal.visible}
          title={logTitle}
          onCancel={() => { logModal.close(); setLogRecords([]); }}
          footer={null}
          width={modalWidth}
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
        >
          <ResizableTable
            columns={logColumns as any}
            dataSource={logRecords}
            rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
            loading={logLoading}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </ResizableModal>

        <PaymentAccountManager
          open={accountModalOpen}
          ownerType="WORKER"
          ownerId={accountUser.id}
          ownerName={accountUser.name}
          onClose={() => setAccountModalOpen(false)}
        />

        <SmallModal
          title="邀请员工扫码绑定微信"
          open={inviteQr.open}
          onCancel={() => setInviteQr({ open: false, loading: false })}
          footer={null}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {inviteQr.loading ? (
              <Spin tip="正在生成二维码..."><div style={{ padding: '48px 0' }} /></Spin>
            ) : inviteQr.qrBase64 ? (
              <>
                <img src={inviteQr.qrBase64} alt="邀请二维码" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }} />
                <div style={{ color: 'var(--color-text-secondary, #666)', fontSize: 13 }}>
                  员工用微信扫码后，输入系统账号密码即可完成绑定
                </div>
                {inviteQr.expiresAt && (
                  <div style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12, marginTop: 8 }}>
                    有效期至：{inviteQr.expiresAt.replace('T', ' ').slice(0, 16)}
                  </div>
                )}
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <Button
                    icon={<LinkOutlined />}
                    onClick={async () => {
                      try {
                        const res: any = await tenantService.myTenant();
                        const tc = res?.data?.tenantCode || res?.tenantCode || '';
                        const tn = res?.data?.tenantName || res?.tenantName || user?.tenantName || '';
                        if (!tc) { message.warning('未获取到工厂码，请稍后重试'); return; }
                        const origin = window.location.origin;
                        const url = `${origin}/register?tenantCode=${encodeURIComponent(tc)}&tenantName=${encodeURIComponent(tn)}`;
                        await navigator.clipboard.writeText(url);
                        message.success('注册链接已复制');
                      } catch { message.error('复制失败，请稍后重试'); }
                    }}
                  >
                    复制注册链接
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--color-text-tertiary, #999)', padding: '24px 0' }}>二维码生成失败，请重试</div>
            )}
          </div>
        </SmallModal>

      <RejectReasonModal
        open={remarkModalState?.open === true}
        title={remarkModalState?.title ?? ''}
        okText={remarkModalState?.okText}
        okDanger={remarkModalState?.okDanger ?? false}
        fieldLabel="操作原因"
        placeholder="请输入操作原因（必填）"
        required
        loading={remarkLoading}
        onOk={handleRemarkConfirm}
        onCancel={() => setRemarkModalState(null)}
      />
    </>
  );
};

export default UserList;
