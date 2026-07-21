import React, { useMemo, useState } from 'react';
import PageLayout from '@/components/common/PageLayout';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit } from '@/types/system';
import { useUser } from '@/utils/AuthContext';
import { App, Button, Empty, Input, Space, Spin } from 'antd';
import {
  ApartmentOutlined, BankOutlined, PlusOutlined, SnippetsOutlined,
} from '@ant-design/icons';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import { useOrganizationTreeData } from './hooks/useOrganizationTreeData';
import { useOrganizationModals } from './hooks/useOrganizationModals';
import { useMemberActions } from './hooks/useMemberActions';
import { useUserActions } from './hooks/useUserActions';
import { useTemplateAndQr } from './hooks/useTemplateAndQr';
import { useManagerActions } from './hooks/useManagerActions';
import { findUnit, getDescendantIds } from './helpers';
import StatsCards from './components/StatsCards';
import TreePanel from './components/TreePanel';
import MemberPanel from './components/MemberPanel';
import DepartmentDialog from './components/DepartmentDialog';
import UserDialog from './components/UserDialog';
import InviteQrModal from './components/InviteQrModal';
import AssignMemberModal from './AssignMemberModal';
import QrCodeModal from './components/QrCodeModal';
import TemplateInitModal from './TemplateInitModal';
import ProfileModal from './components/ProfileModal';
import './styles.css';

const OrganizationTreePage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user, isSuperAdmin, isTenantOwner } = useUser();
  const canManageUsers = isSuperAdmin || isTenantOwner;

  const {
    loading, treeData, visibleTreeData, departments, membersMap, setMembersMap,
    assignableUsers, loadData, loadAssignableUsers, totalMembers, unitNameMap, isFactoryAccount,
  } = useOrganizationTreeData();

  const {
    form: deptForm, dialogOpen, dialogMode, currentRecord, submitLoading: deptSubmitLoading,
    openCreate, openEdit, closeDialog, handleSubmit: handleDeptSubmit,
  } = useOrganizationModals(loadData);

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [includeSubUnits, setIncludeSubUnits] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // PaymentAccountManager：当前未触发打开（保留以兼容外部钩子）
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountUser, _setAccountUser] = useState<{ id: string; name: string }>({ id: '', name: '' });

  const {
    tplModal, setTplModal, tplLoading, factories, handleInitTemplate,
    qrModal, setQrModal, handleShowQRCode,
    inviteQr, setInviteQr, handleGenerateInvite,
  } = useTemplateAndQr(loadData);

  const { managerLoading, handleSetManager } = useManagerActions(loadData);

  const {
    userForm, userModalOpen, editingUser, userSubmitLoading,
    roleOptions, roleOptionsLoading,
    openUserDialog, closeUserDialog, handleUserSubmit,
    handleToggleUserStatus, handleResetPassword,
  } = useUserActions(loadData, selectedUnitId);

  const {
    assignModal, setAssignModal,
    assignSearch, setAssignSearch,
    batchSelectedIds, setBatchSelectedIds,
    batchAssignLoading,
    setOwnerLoading,
    profileUser, setProfileUser,
    handleOpenAssign,
    handleBatchAssign,
    handleRemoveMember,
    handleSetFactoryOwner,
    currentNodeMemberIds,
    filteredAssignableUsers,
  } = useMemberActions(membersMap, setMembersMap, assignableUsers, loadAssignableUsers);

  const currentFactoryName = String((user as any)?.tenantName || '').trim();

  // ===== 删除部门（modal.confirm 收集删除原因）=====
  const handleDelete = (record: OrganizationUnit) => {
    let remarkValue = '';
    modal.confirm({
      width: '30vw',
      title: `删除部门「${record.unitName}」`,
      content: (
        <div>
          <p>仅允许删除没有子节点的部门，删除后该部门下成员将自动释放。</p>
          <p style={{ color: 'var(--color-error, var(--color-danger))', fontWeight: 500 }}>若该部门/工厂有未完成的生产订单，将无法删除。</p>
          <div style={{ marginTop: 16 }}>
            <span style={{ color: 'var(--color-error, var(--color-danger))' }}>*</span> 删除原因：
            <Input.TextArea
              id="deleteDeptReason"
              rows={3}
              placeholder="请输入删除原因（必填）"
              onChange={e => { remarkValue = e.target.value; }}
            />
          </div>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        if (!remarkValue.trim()) {
          message.error('请填写删除原因');
          return Promise.reject(new Error('未填写原因'));
        }
        try {
          const remark = remarkValue.trim();
          await organizationApi.delete(String(record.id), remark);
          message.success('删除成功');
          if (selectedUnitId === String(record.id)) setSelectedUnitId(null);
          await loadData();
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : '删除失败，请检查该部门是否还有子节点或成员';
          message.error(errorMsg);
        }
      },
    });
  };

  const departmentOptions = useMemo(() => {
    return departments
      .map((item) => ({
        value: String(item.id ?? '').trim(),
        label: String(item.unitName ?? '未命名'),
      }))
      .filter((item) => item.value);
  }, [departments]);

  const managerSelectOptions = useMemo(() => {
    return assignableUsers.map(u => ({
      value: String(u.id),
      label: u.name || u.username,
    }));
  }, [assignableUsers]);

  const selectedUnit = useMemo(() => findUnit(treeData, selectedUnitId), [treeData, selectedUnitId]);
  const isExternalSelected = selectedUnit?.ownerType === 'EXTERNAL';

  // ===== 每个部门的人数计算（递归）=====
  const unitMemberCount = useMemo(() => {
    const countMap: Record<string, number> = {};
    const subUnitsMap: Record<string, number> = {};

    // 先计算每个部门的人数（包括其所有子部门）
    const calculateCount = (nodes: OrganizationUnit[]): number => {
      let total = 0;
      nodes.forEach(node => {
        const nodeId = String(node.id);
        // 当前节点的直接成员数
        let nodeCount = Array.isArray(membersMap[nodeId]) ? membersMap[nodeId].length : 0;
        // 递归计算子部门人数
        if (node.children && node.children.length > 0) {
          const subCount = calculateCount(node.children);
          nodeCount += subCount;
        }
        countMap[nodeId] = nodeCount;
        subUnitsMap[nodeId] = node.children?.length || 0;
        total += nodeCount;
      });
      return total;
    };
    calculateCount(treeData);
    return { countMap, subUnitsMap };
  }, [treeData, membersMap]);

  const displayedMembers = useMemo(() => {
    if (!selectedUnitId || !selectedUnit) return [];
    const unitIds = includeSubUnits ? getDescendantIds(selectedUnit) : [selectedUnitId];
    const allMembers = unitIds.flatMap(id => membersMap[id] || []);
    if (!memberSearch.trim()) return allMembers;
    const q = memberSearch.toLowerCase();
    return allMembers.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    );
  }, [selectedUnitId, selectedUnit, includeSubUnits, membersMap, memberSearch]);

  // MemberPanel 列定义需要的 handlers（用 useMemo 保证 columns 依赖稳定）
  const columnHandlers = useMemo(() => ({
    openUserDialog,
    handleResetPassword,
    handleToggleUserStatus,
    handleRemoveMember,
    handleSetFactoryOwner,
    setOwnerLoading,
    setProfileUser,
    unitNameMap,
  }), [
    openUserDialog, handleResetPassword, handleToggleUserStatus,
    handleRemoveMember, handleSetFactoryOwner, setOwnerLoading, setProfileUser, unitNameMap,
  ]);

  return (
    <>
      <PageLayout
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {currentFactoryName ? (
              <>
                <BankOutlined style={{ marginRight: 6, color: 'var(--primary-color, var(--color-primary))', fontSize: 22 }} />
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-color, var(--color-primary))', marginRight: 14 }}>
                  {currentFactoryName}
                </span>
                <span style={{ color: 'var(--color-border-antd, var(--color-border-antd))', fontWeight: 300, fontSize: 20, marginRight: 14 }}>|</span>
              </>
            ) : null}
            <ApartmentOutlined style={{ marginRight: 8 }} />
            部门和成员
          </span>
        }
        titleExtra={
          !isFactoryAccount ? (
            <Space>
              <Button
                icon={<SnippetsOutlined />}
                onClick={() => setTplModal({ open: true, type: null, rootName: '' })}
              >
                使用模板
              </Button>
              <Button type="primary" ghost icon={<PlusOutlined />} onClick={() => openCreate()}>
                新增部门
              </Button>
            </Space>
          ) : undefined
        }
        headerContent={
          !isFactoryAccount ? (
            <div style={{ color: 'var(--neutral-text-secondary)', marginTop: 4 }}>
              管理公司组织结构与人员，包含部门、成员分配、职位权限。
            </div>
          ) : undefined
        }
      >
        {/* 顶部统计卡片 */}
        {treeData.length > 0 && (
          <StatsCards departments={departments} totalMembers={totalMembers} />
        )}
        <Spin spinning={loading}>
          {visibleTreeData.length === 0 && !loading ? (
            <Empty description="暂无组织架构数据" style={{ padding: '60px 0' }}>
              {!isFactoryAccount && (
                <Button type="primary" ghost icon={<SnippetsOutlined />} onClick={() => setTplModal({ open: true, type: null, rootName: '' })}>
                  从模板导入
                </Button>
              )}
            </Empty>
          ) : (
            <div className="org-split-layout" style={{ height: 'calc(100vh - 180px)' }}>
              <TreePanel
                visibleTreeData={visibleTreeData}
                selectedUnitId={selectedUnitId}
                onSelect={setSelectedUnitId}
                isFactoryAccount={isFactoryAccount}
                onAdd={openCreate}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAddMember={handleOpenAssign}
                onShowQRCode={handleShowQRCode}
                unitMemberCount={unitMemberCount}
              />

              <MemberPanel
                selectedUnitId={selectedUnitId}
                selectedUnit={selectedUnit}
                isExternalSelected={isExternalSelected}
                isFactoryAccount={isFactoryAccount}
                canManageUsers={canManageUsers}
                unitMemberCount={unitMemberCount}
                displayedMembers={displayedMembers}
                memberSearch={memberSearch}
                setMemberSearch={setMemberSearch}
                includeSubUnits={includeSubUnits}
                setIncludeSubUnits={setIncludeSubUnits}
                selectedRowKeys={selectedRowKeys}
                setSelectedRowKeys={setSelectedRowKeys}
                managerLoading={managerLoading}
                managerSelectOptions={managerSelectOptions}
                loadAssignableUsers={loadAssignableUsers}
                handleSetManager={handleSetManager}
                handleOpenAssign={handleOpenAssign}
                handleShowQRCode={handleShowQRCode}
                handleGenerateInvite={handleGenerateInvite}
                openUserDialog={openUserDialog}
                columnHandlers={columnHandlers}
              />
            </div>
          )}
        </Spin>
      </PageLayout>

      <DepartmentDialog
        open={dialogOpen}
        mode={dialogMode}
        form={deptForm}
        currentRecord={currentRecord}
        submitLoading={deptSubmitLoading}
        departmentOptions={departmentOptions}
        onClose={closeDialog}
        onOk={handleDeptSubmit}
      />

      <UserDialog
        open={userModalOpen}
        form={userForm}
        editingUser={editingUser}
        submitLoading={userSubmitLoading}
        roleOptions={roleOptions}
        roleOptionsLoading={roleOptionsLoading}
        departmentOptions={departmentOptions}
        onClose={closeUserDialog}
        onOk={handleUserSubmit}
      />

      <AssignMemberModal
        assignModal={assignModal}
        setAssignModal={setAssignModal}
        assignSearch={assignSearch}
        setAssignSearch={setAssignSearch}
        filteredAssignableUsers={filteredAssignableUsers}
        batchSelectedIds={batchSelectedIds}
        setBatchSelectedIds={setBatchSelectedIds}
        currentNodeMemberIds={currentNodeMemberIds}
        unitNameMap={unitNameMap}
        batchAssignLoading={batchAssignLoading}
        handleBatchAssign={handleBatchAssign}
      />

      <QrCodeModal
        open={qrModal.open}
        unit={qrModal.unit}
        tenantCode={qrModal.tenantCode}
        onClose={() => setQrModal({ open: false, unit: null, tenantCode: '' })}
      />

      <TemplateInitModal
        tplModal={tplModal}
        setTplModal={setTplModal}
        handleInitTemplate={handleInitTemplate}
        tplLoading={tplLoading}
        factories={factories}
      />

      <ProfileModal
        open={!!profileUser}
        user={profileUser}
        unitNameMap={unitNameMap}
        onClose={() => setProfileUser(null)}
        onResetPwd={async (userId, newPwd) => {
          await organizationApi.adminResetMemberPwd(userId, newPwd);
        }}
      />

      <InviteQrModal inviteQr={inviteQr} setInviteQr={setInviteQr} />

      <PaymentAccountManager
        open={accountModalOpen}
        ownerType="WORKER"
        ownerId={accountUser.id}
        ownerName={accountUser.name}
        onClose={() => setAccountModalOpen(false)}
      />
    </>
  );
};

export default OrganizationTreePage;
