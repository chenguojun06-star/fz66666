import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Button, Card, DatePicker, Input, Select, Space, Spin, Tag, Form, Row, Col, Typography, Tooltip } from 'antd';
import { QrcodeOutlined, LinkOutlined, TeamOutlined, UserOutlined, ShopOutlined, ApartmentOutlined, SafetyCertificateOutlined, CheckOutlined, CloseOutlined, UnorderedListOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import SmallModal from '@/components/common/SmallModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
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
import { formatDateTime } from '@/utils/datetime';

const { Text } = Typography;
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
    handleResetPassword, changeEmploymentStatus,
  } = useUserListData({ user, isSuperAdmin, isTenantOwner, form, userModal, logModal, navigate });

  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  const debouncedKeyword = useDebouncedValue(keywordInput, 300);

  // ===== 人员统计（用于顶部简洁统计条）=====
  // 优化：使用 permissionRange 和 factoryId 判断用户类型，更准确
  const userStats = useMemo(() => {
    let internal = 0;
    let externalFactory = 0;
    let supplier = 0;
    let activeCount = 0;

    userList.forEach((u) => {
      // 优先用 permissionRange 判断
      const permRange = String(u.permissionRange || '').toLowerCase();
      const roleName = String(u.roleName || '').toLowerCase();
      const roleCode = String((u as any).roleCode || '').toLowerCase();
      const factoryId = u.factoryId;
      const isFactoryOwner = u.isFactoryOwner;

      // 判断是否为外发工厂用户：有factoryId 或 permissionRange包含external/factory
      const isExternalFactory = (factoryId && String(factoryId).length > 0) ||
                                 isFactoryOwner ||
                                 permRange.includes('external') ||
                                 permRange.includes('factory') ||
                                 roleName.includes('factory') ||
                                 roleName.includes('外发') ||
                                 roleName.includes('外包') ||
                                 roleCode.includes('factory_owner') ||
                                 roleCode.includes('external');

      // 判断是否为供应商用户
      const isSupplier = permRange.includes('supplier') ||
                         roleName.includes('supplier') ||
                         roleName.includes('vendor') ||
                         roleName.includes('供应商') ||
                         roleName.includes('面辅料') ||
                         roleName.includes('物料');

      if (isExternalFactory && !isSupplier) {
        externalFactory++;
      } else if (isSupplier) {
        supplier++;
      } else {
        // 其他默认为内部员工
        internal++;
      }

      if (String(u.status || 'active') === 'active') {
        activeCount++;
      }
    });

    return { internal, externalFactory, supplier, activeCount };
  }, [userList]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    onChangeEmploymentStatus: changeEmploymentStatus,
  });

  // 顶部统计条
  const renderStatsBar = () => (
    <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '10px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Space size={16} wrap>
          <Space size={4}>
            <TeamOutlined style={{ fontSize: 14, color: 'var(--color-text-secondary, #666)' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>总人数</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--primary-color, var(--color-primary))' }}>{total}</Text>
          </Space>
          <Space size={4}>
            <UserOutlined style={{ fontSize: 14, color: 'var(--color-success, var(--color-success))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>内部</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-success, var(--color-success))' }}>{userStats.internal}</Text>
          </Space>
          <Space size={4}>
            <ApartmentOutlined style={{ fontSize: 14, color: 'var(--color-info, var(--color-info))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>外发工厂</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-info, var(--color-info))' }}>{userStats.externalFactory}</Text>
          </Space>
          <Space size={4}>
            <ShopOutlined style={{ fontSize: 14, color: 'var(--color-warning, var(--color-warning))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>供应商</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-warning, var(--color-warning))' }}>{userStats.supplier}</Text>
          </Space>
          <Space size={4}>
            <SafetyCertificateOutlined style={{ fontSize: 14, color: 'var(--color-success, var(--color-success))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>启用</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-success, var(--color-success))' }}>{userStats.activeCount}</Text>
          </Space>
          {pendingUserCount > 0 && (
            <Tag color="orange" style={{ fontSize: 11, padding: '2px 8px' }}>
              {pendingUserCount} 人待审批
            </Tag>
          )}
        </Space>
        {canManageUsers && (
          <Space size={8}>
            <Tooltip title="生成邀请码，员工扫码绑定微信">
              <Button icon={<QrcodeOutlined />} onClick={handleGenerateInvite}>邀请员工</Button>
            </Tooltip>
            <Button type="primary" ghost onClick={() => openDialog()}>新增人员</Button>
          </Space>
        )}
      </div>
    </Card>
  );

  return (
    <>
        <PageLayout
          title="人员管理"
          titleExtra={null}
          headerContent={
            <>
              {showSmartErrorNotice && smartError ? (
                <Card style={{ marginBottom: 12 }}>
                  <SmartErrorNotice error={smartError} onFix={() => { void getUserList(); }} />
                </Card>
              ) : null}
              {pendingUserCount > 0 && canManageUsers && (
                <Alert
                  message={`有 ${pendingUserCount} 个新用户待审批`}
                  description="点击前往审批页面，为新用户分配角色和权限"
                  type="info"
                  showIcon
                  closable
                  action={
                    <Button type="primary" ghost onClick={() => navigate('/system/user-approval')}>
                      立即审批
                    </Button>
                  }
                  style={{ marginBottom: 12 }}
                />
              )}
              {renderStatsBar()}
            </>
          }
        >
          <div className="user-split-layout">
            <div className="user-dept-panel">
              <div className="user-dept-header">
                <Text strong style={{ fontSize: 13 }}>部门</Text>
              </div>
              <DepartmentTree
                departments={departments}
                selectedId={selectedDeptId}
                onSelect={setSelectedDeptId}
              />
            </div>

            <div className="user-list-panel">
              <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '10px 16px' } }}>
                <StandardToolbar
                  left={
                    <StandardSearchBar
                      searchValue={keywordInput}
                      onSearchChange={setKeywordInput}
                      searchPlaceholder="搜索姓名/手机号"
                      showDate={false}
                      showStatus={false}
                      extraFilters={[
                        {
                          key: 'employment',
                          label: '在职状态',
                          type: 'select',
                          width: 120,
                          options: [
                            { label: '全部', value: '' },
                            { label: '正式', value: 'normal' },
                            { label: '试用期', value: 'probation' },
                            { label: '临时工', value: 'temporary' },
                            { label: '调岗', value: 'transferred' },
                            { label: '离职', value: 'resigned' },
                            { label: '已归档', value: 'archived' },
                          ],
                        },
                        {
                          key: 'role',
                          label: '角色',
                          type: 'select',
                          width: 140,
                          options: [
                            { label: '全部角色', value: '' },
                            ...roleOptions.map(r => ({
                              label: r.roleName || '系统角色',
                              value: String(r.id),
                            })),
                          ],
                        },
                      ]}
                      onFilterChange={(key, value) => {
                        if (key === 'employment') setEmploymentFilter(value || '');
                        if (key === 'role') setRoleFilter(value || '');
                      }}
                    />
                  }
                  right={
                    <Space size={8}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        显示 {userList.length} / {total} 人
                      </Text>
                    </Space>
                  }
                />
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
                  pageSizeOptions: ['20', '50', '100', '200'],
                  onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
                }}
                emptyDescription="暂无用户数据"
                emptyActionText="去添加用户"
                onEmptyAction={() => { userModal.open({} as UserType); }}
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
                <Form.Item name="position" label="职位">
                  <Input placeholder="如：缝纫一组组长、车间主任" />
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
                    <Option value="transferred">调岗</Option>
                    <Option value="resigned">离职</Option>
                    <Option value="archived">已归档</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16} className="mt-sm">
              <Col span={8}>
                <Form.Item name="permissionRange" label="数据权限" rules={formRules.permissionRange}>
                  <Select placeholder="请选择数据权限范围">
                    <Option value="all"><Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>查看全厂数据</Option>
                    <Option value="team"><Tag color="green" style={{ marginRight: 4 }}>团队</Tag>查看团队数据</Option>
                    <Option value="own"><Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>仅查看自己数据</Option>
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
            emptyDescription="暂无日志数据"
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
                <img src={inviteQr.qrBase64} alt="邀请二维码" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 12px' }} />
                <div style={{ color: 'var(--color-text-secondary, #666)', fontSize: 13 }}>
                  员工用微信扫码后，输入系统账号密码即可完成绑定
                </div>
                {inviteQr.expiresAt && (
                  <div style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12, marginTop: 6 }}>
                    有效期至：{formatDateTime(inviteQr.expiresAt)}
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
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