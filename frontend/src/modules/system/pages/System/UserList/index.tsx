import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Checkbox, Empty, Input, Select, Space, Spin, Tabs, Tag, Form, Row, Col } from 'antd';
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
import { User as UserType } from '@/types/system';
import { useAuth } from '@/utils/AuthContext';
import tenantService from '@/services/tenantService';
import { LOG_COLUMNS } from './userListUtils';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import './styles.css';

const { Option } = Select;

const UserList: React.FC = () => {
  const { user, isSuperAdmin, isTenantOwner } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const userModal = useModal<UserType>();
  const logModal = useModal();

  const {
    queryParams, setQueryParams, userList, total, loading, submitLoading,
    smartError, showSmartErrorNotice, canManageUsers,
    activeEditTab, setActiveEditTab,
    remarkModalState, setRemarkModalState, remarkLoading,
    roleOptions, roleOptionsLoading,
    permTree: _permTree, permCheckedIds, setPermCheckedIds, permLoading, permSaving,
    pendingUserCount,
    logLoading, logRecords, setLogRecords, logTitle,
    inviteQr, setInviteQr,
    formRules, selectedRoleId, selectedRoleName, permissionsByModule,
    getUserList, openDialog, closeDialog, handleGenerateInvite,
    openRemarkModal: _openRemarkModal, handleRemarkConfirm, openLogModal,
    toggleUserStatus, applyRoleToUser, handleSubmit, savePerms,
    loadPermTreeAndChecked,
  } = useUserListData({ user, isSuperAdmin, isTenantOwner, form, userModal, logModal, navigate });

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<{ id: string; name: string }>({ id: '', name: '' });

  // 表格列定义
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
  });

  return (
    <>
        <PageLayout
          title="人员管理"
          headerContent={
            <>
              {showSmartErrorNotice && smartError ? (
                <Card size="small" style={{ marginBottom: 12 }}>
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
                      size="small"
                      type="primary"
                      onClick={() => {
                        navigate(isSuperAdmin ? '/system/user-approval' : '/system/tenant?tab=registrations');
                      }}
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

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
              <Space wrap size={12}>
                <Input
                  value={queryParams.username || ''}
                  onChange={(e) => setQueryParams({ ...queryParams, username: e.target.value, page: 1 })}
                  placeholder="搜索用户名/姓名"
                  allowClear
                  style={{ width: 220 }}
                />
                <Select
                  value={queryParams.status || ''}
                  onChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                  options={[
                    { label: '启用', value: 'active' },
                    { label: '停用', value: 'inactive' },
                  ]}
                  placeholder="状态"
                  allowClear
                  style={{ width: 140 }}
                />
                <Button type="primary" onClick={() => getUserList()}>
                  查询
                </Button>
                <Button onClick={() => {
                  setQueryParams({ page: 1, pageSize: queryParams.pageSize });
                }}>
                  重置
                </Button>
              </Space>
              {canManageUsers && (
                <Space>
                  <Button
                    icon={<QrcodeOutlined />}
                    onClick={handleGenerateInvite}
                  >
                    邀请员工
                  </Button>
                  <Button type="primary" onClick={() => openDialog()}>
                    新增用户
                  </Button>
                </Space>
              )}
            </div>
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={userList}
            rowKey="id"
            loading={loading}
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
        </PageLayout>

        {/* 用户编辑弹窗 */}
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
            <Tabs
              activeKey={activeEditTab}
              onChange={(k) => setActiveEditTab(k as 'base' | 'perm')}
              items={[
                {
                  key: 'base',
                  label: '基本信息',
                  children: (
                    <div>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="username" label="用户名" rules={formRules.username}>
                            <Input placeholder="请输入用户名" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="name" label="姓名" rules={formRules.name}>
                            <Input placeholder="请输入姓名" />
                          </Form.Item>
                        </Col>
                        {!userModal.data && (
                          <Col span={8}>
                            <Form.Item name="password" label="密码" rules={formRules.password}>
                              <Input.Password placeholder="请输入密码" />
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
                        <Col span={16}>
                          <Form.Item name="permissionRange" label="数据权限" rules={formRules.permissionRange}>
                            <Select id="permissionRange" placeholder="请选择数据权限范围">
                              <Option value="all">
                                <Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>
                                查看全厂数据
                              </Option>
                              <Option value="team">
                                <Tag color="green" style={{ marginRight: 4 }}>团队</Tag>
                                查看团队数据
                              </Option>
                              <Option value="own">
                                <Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>
                                仅查看自己数据
                              </Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="status" label="状态" rules={formRules.status}>
                            <Select id="status" placeholder="请选择状态">
                              <Option value="active">启用</Option>
                              <Option value="inactive">停用</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16} className="mt-sm">
                        <Col span={12}>
                          <Form.Item name="phone" label="手机号" rules={formRules.phone}>
                            <Input id="phone" placeholder="请输入手机号" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="email" label="邮箱" rules={formRules.email}>
                            <Input id="email" placeholder="请输入邮箱" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                {
                  key: 'perm',
                  label: '权限配置',
                  children: (
                    <div className="user-perm-panel">
                      <Alert
                        type="info"
                        showIcon
                        title="权限基于角色生效"
                        description="此处修改会影响所有使用该角色的人员。若只想调整个人权限，建议新增一个角色再分配给该人员。"
                      />

                      <div className="user-perm-toolbar">
                        <Space wrap>
                          <span className="user-perm-role">当前角色：{selectedRoleName || '未选择'}</span>
                          <Button
                            disabled={!String(selectedRoleId || '').trim()}
                            loading={permLoading}
                            onClick={() => loadPermTreeAndChecked(String(selectedRoleId || ''))}
                          >
                            刷新权限
                          </Button>
                          <Button
                            type="primary"
                            disabled={!String(selectedRoleId || '').trim()}
                            loading={permSaving}
                            onClick={savePerms}
                          >
                            保存权限
                          </Button>
                        </Space>
                      </div>

                      <div className="user-perm-tree">
                        {permLoading ? (
                          <div className="user-perm-loading">
                            <Spin />
                          </div>
                        ) : permissionsByModule.length ? (
                          <div style={{
                            marginTop: 12,
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            alignItems: 'flex-start'
                          }}>
                            {permissionsByModule.map((module) => {
                              const allBtnIds = [
                                ...module.groups.flatMap((g: any) => [g.groupId, ...g.buttons.map((b: any) => b.id)]),
                                ...module.directButtons.map((b: any) => b.id),
                              ];
                              return (
                                <div key={module.moduleId} style={{ minWidth: 130, maxWidth: 200, border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden', fontSize: 12, flexShrink: 0 }}>
                                  {/* 模块头 - 主色背景 */}
                                  <div style={{ background: 'var(--primary-color, #1677ff)', padding: '4px 8px' }}>
                                    <Checkbox
                                      checked={permCheckedIds.has(module.moduleId)}
                                      onChange={(e) => {
                                        const next = new Set(permCheckedIds);
                                        if (e.target.checked) { next.add(module.moduleId); allBtnIds.forEach((id: number) => next.add(id)); }
                                        else { next.delete(module.moduleId); allBtnIds.forEach((id: number) => next.delete(id)); }
                                        setPermCheckedIds(next);
                                      }}
                                      style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}
                                    >{module.moduleName}</Checkbox>
                                  </div>
                                  {/* 子模块分组 */}
                                  {module.groups.map((group: any) => (
                                    <div key={group.groupId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                      <div style={{ background: '#f0f4ff', padding: '2px 6px', borderBottom: '1px solid #e8eaf0' }}>
                                        <Checkbox
                                          checked={permCheckedIds.has(group.groupId)}
                                          onChange={(e) => {
                                            const next = new Set(permCheckedIds);
                                            const ids = [group.groupId, ...group.buttons.map((b: any) => b.id)];
                                            if (e.target.checked) ids.forEach((id: number) => next.add(id));
                                            else ids.forEach((id: number) => next.delete(id));
                                            setPermCheckedIds(next);
                                          }}
                                          style={{ fontSize: 11, fontWeight: 500 }}
                                        >{group.groupName}</Checkbox>
                                      </div>
                                      <div style={{ padding: '2px 4px 4px 16px' }}>
                                        {group.buttons.map((btn: any) => (
                                          <div key={btn.id}>
                                            <Checkbox
                                              checked={permCheckedIds.has(btn.id)}
                                              onChange={(e) => {
                                                const next = new Set(permCheckedIds);
                                                if (e.target.checked) next.add(btn.id); else next.delete(btn.id);
                                                setPermCheckedIds(next);
                                              }}
                                              style={{ fontSize: 10 }}
                                            >{btn.name}</Checkbox>
                                          </div>
                                        ))}
                                        {group.buttons.length === 0 && <span style={{ color: '#bbb', fontSize: 10 }}>仅菜单权限</span>}
                                      </div>
                                    </div>
                                  ))}
                                  {/* 直属功能按钮 */}
                                  {module.directButtons.length > 0 && (
                                    <div style={{ padding: '4px 6px' }}>
                                      {module.directButtons.map((btn: any) => (
                                        <div key={btn.id}>
                                          <Checkbox
                                            checked={permCheckedIds.has(btn.id)}
                                            onChange={(e) => {
                                              const next = new Set(permCheckedIds);
                                              if (e.target.checked) next.add(btn.id); else next.delete(btn.id);
                                              setPermCheckedIds(next);
                                            }}
                                            style={{ fontSize: 10 }}
                                          >{btn.name}</Checkbox>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {module.groups.length === 0 && module.directButtons.length === 0 && (
                                    <div style={{ padding: '4px 8px', color: '#aaa', fontSize: 10 }}>仅页面入口</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <Empty description={String(selectedRoleId || '').trim() ? '暂无可配置权限' : '请先选择角色'} />
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </Form>
        </ResizableModal>

        <ResizableModal
          open={logModal.visible}
          title={logTitle}
          onCancel={() => {
            logModal.close();
            setLogRecords([]);
          }}
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

        {/* 收款账户管理弹窗 */}
        <PaymentAccountManager
          open={accountModalOpen}
          ownerType="WORKER"
          ownerId={accountUser.id}
          ownerName={accountUser.name}
          onClose={() => setAccountModalOpen(false)}
        />

        {/* 邀请员工二维码弹窗 */}
        <SmallModal
          title="邀请员工扫码绑定微信"
          open={inviteQr.open}
          onCancel={() => setInviteQr({ open: false, loading: false })}
          footer={null}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {inviteQr.loading ? (
              <div style={{ padding: '48px 0' }}>
                <Spin tip="正在生成二维码..." />
              </div>
            ) : inviteQr.qrBase64 ? (
              <>
                <img
                  src={inviteQr.qrBase64}
                  alt="邀请二维码"
                  style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }}
                />
                <div style={{ color: '#666', fontSize: 13 }}>
                  员工用微信扫码后，输入系统账号密码即可完成绑定
                </div>
                {inviteQr.expiresAt && (
                  <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                    有效期至：{inviteQr.expiresAt.replace('T', ' ').slice(0, 16)}
                  </div>
                )}
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <Button
                    icon={<LinkOutlined />}
                    size="small"
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
                      } catch {
                        message.error('复制失败，请稍后重试');
                      }
                    }}
                  >
                    复制注册链接
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ color: '#999', padding: '24px 0' }}>二维码生成失败，请重试</div>
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
