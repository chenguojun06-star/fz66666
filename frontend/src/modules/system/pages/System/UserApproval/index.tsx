import React, { useMemo } from 'react';
import { Alert, Button, Card, Empty, Space, Tabs } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { useViewport } from '@/utils/useViewport';
import { useUser } from '@/utils/AuthContext';
import { useUserApprovalData } from './hooks/useUserApprovalData';
import { buildTenantColumns, buildFactoryColumns } from './columns';
import ApproveUserModal from './components/ApproveUserModal';
import RejectUserModal from './components/RejectUserModal';
import FactoryApproveModal from './components/FactoryApproveModal';
import FactoryRejectModal from './components/FactoryRejectModal';
import './styles.css';

const UserApproval: React.FC = () => {
  const { isMobile: _isMobile } = useViewport();
  const { isTenantOwner } = useUser();

  const {
    canApproveFactory,
    activeTab, setActiveTab,
    loading, pendingUsers, total, page, pageSize,
    setPage, setPageSize,
    factoryLoading, factoryPending, factoryTotal,
    approveModalVisible,
    rejectModalVisible,
    factoryApproveModalVisible,
    factoryRejectModalVisible,
    currentUser,
    rejectReason, setRejectReason,
    approveReason, setApproveReason,
    selectedRoleId, setSelectedRoleId,
    factoryRejectReason, setFactoryRejectReason,
    factorySelectedRole, setFactorySelectedRole,
    roleOptions, roleLoading,
    approveSubmitting,
    rejectSubmitting,
    factoryApproveLoading,
    handleApprove, confirmApprove,
    handleReject, confirmReject,
    handleFactoryApprove, confirmFactoryApprove,
    handleFactoryReject, confirmFactoryReject,
    navigateToFactoryWorkers,
    handleRefresh,
    closeApproveModal,
    closeRejectModal,
    closeFactoryApproveModal,
    closeFactoryRejectModal,
  } = useUserApprovalData({ isTenantOwner });

  const columns = useMemo(
    () => buildTenantColumns({ onApprove: handleApprove, onReject: handleReject }),
    [handleApprove, handleReject]
  );

  const factoryColumns = useMemo(
    () => buildFactoryColumns({
      onApprove: handleFactoryApprove,
      onReject: handleFactoryReject,
      canApproveFactory,
      onNavigateToFactoryWorkers: navigateToFactoryWorkers,
    }),
    [handleFactoryApprove, handleFactoryReject, canApproveFactory, navigateToFactoryWorkers]
  );

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
              <Alert title={`当前有 ${total} 个租户员工待审批`} type="info" showIcon style={{ marginBottom: 16 }} />
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
                scroll={{ x: 'max-content' }}
                emptyDescription="暂无用户数据"
              />
            </>
          )}
        </>
      ),
    },
    ...(isTenantOwner || canApproveFactory ? [{
      key: 'factory',
      label: `外发工厂员工审批 (${factoryTotal})`,
      children: (
        <>
          {factoryPending.length === 0 && !factoryLoading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无外发工厂待审批员工" />
          ) : (
            <>
              <Alert
                title={canApproveFactory
                  ? `当前有 ${factoryTotal} 个外发工厂员工待审批，您可以直接审批或跳转到对应工厂的人员名册管理`
                  : "以下为外发工厂的待审批员工，由各外发工厂管理员自行审批，租户仅可查看"}
                type={canApproveFactory ? "info" : "warning"}
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
                scroll={{ x: 'max-content' }}
                emptyDescription="暂无用户数据"
              />
            </>
          )}
        </>
      ),
    }] : []),
  ];

  return (
    <>
      <Card>
        <div className="page-header">
          <div>
            <h2 className="page-title">用户审批</h2>
            <p className="page-description">审批新注册的用户账号</p>
          </div>
          <Space>
            <Button onClick={handleRefresh} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <ApproveUserModal
        open={approveModalVisible}
        currentUser={currentUser}
        selectedRoleId={selectedRoleId}
        setSelectedRoleId={setSelectedRoleId}
        approveReason={approveReason}
        setApproveReason={setApproveReason}
        roleOptions={roleOptions}
        roleLoading={roleLoading}
        approveSubmitting={approveSubmitting}
        onOk={confirmApprove}
        onCancel={closeApproveModal}
      />

      <RejectUserModal
        open={rejectModalVisible}
        currentUser={currentUser}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        rejectSubmitting={rejectSubmitting}
        onOk={confirmReject}
        onCancel={closeRejectModal}
      />

      <FactoryApproveModal
        open={factoryApproveModalVisible}
        currentUser={currentUser}
        factorySelectedRole={factorySelectedRole}
        setFactorySelectedRole={setFactorySelectedRole}
        roleOptions={roleOptions}
        roleLoading={roleLoading}
        factoryApproveLoading={factoryApproveLoading}
        onOk={confirmFactoryApprove}
        onCancel={closeFactoryApproveModal}
      />

      <FactoryRejectModal
        open={factoryRejectModalVisible}
        currentUser={currentUser}
        factoryRejectReason={factoryRejectReason}
        setFactoryRejectReason={setFactoryRejectReason}
        factoryApproveLoading={factoryApproveLoading}
        onOk={confirmFactoryReject}
        onCancel={closeFactoryRejectModal}
      />
    </>
  );
};

export default UserApproval;
