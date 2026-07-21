import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Form, Space, Typography } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { User as UserType, OrganizationUnit } from '@/types/system';
import { useUser } from '@/utils/AuthContext';
import { LOG_COLUMNS } from './userListUtils';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import { useDebouncedValue } from '@/hooks/usePerformance';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { organizationApi } from '@/services/system/organizationApi';
import { computeUserStats } from './helpers';
import { useUserListColumns } from './hooks/useUserListColumns';
import { useUserListData } from './hooks/useUserListData';
import DepartmentTree from './components/DepartmentTree';
import StatsBar from './components/StatsBar';
import UserFormModal from './components/UserFormModal';
import LogModal from './components/LogModal';
import InviteQrModal from './components/InviteQrModal';
import './styles.css';

const { Text } = Typography;

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

  const userStats = useMemo(() => computeUserStats(userList), [userList]);

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
              <StatsBar
                total={total}
                userStats={userStats}
                pendingUserCount={pendingUserCount}
                canManageUsers={canManageUsers}
                onGenerateInvite={handleGenerateInvite}
                onAddUser={() => openDialog()}
              />
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

        <UserFormModal
          userModal={userModal}
          form={form}
          formRules={formRules}
          roleOptions={roleOptions}
          roleOptionsLoading={roleOptionsLoading}
          submitLoading={submitLoading}
          modalWidth={modalWidth}
          modalInitialHeight={modalInitialHeight}
          isMobile={isMobile}
          onCancel={closeDialog}
          onOk={handleSubmit}
        />

        <LogModal
          logModal={logModal}
          logTitle={logTitle}
          logRecords={logRecords}
          logLoading={logLoading}
          logColumns={logColumns}
          modalWidth={modalWidth}
          isMobile={isMobile}
          onClose={() => { logModal.close(); setLogRecords([]); }}
        />

        <PaymentAccountManager
          open={accountModalOpen}
          ownerType="WORKER"
          ownerId={accountUser.id}
          ownerName={accountUser.name}
          onClose={() => setAccountModalOpen(false)}
        />

        <InviteQrModal
          inviteQr={inviteQr}
          onClose={() => setInviteQr({ open: false, loading: false })}
          user={user}
        />

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
