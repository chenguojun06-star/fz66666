import React from 'react';
import { Alert, App, Card, Typography } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { Role } from '@/types/system';
import TenantSetupGuide from './components/TenantSetupGuide';
import { useRoleListData } from './useRoleListData';
import RoleListPanel from './RoleListPanel';
import PermissionMatrix from './PermissionMatrix';
import RoleFormModal from './RoleFormModal';
import EmployeeListModal from './EmployeeListModal';
import OperationLogModal from './OperationLogModal';
import RoleTemplateModal from './RoleTemplateModal';
import type { RoleTemplate } from './components/RoleTemplateSelector';
import './styles.css';

const { Text } = Typography;

const RoleList: React.FC = () => {
  const { message } = App.useApp();
  const {
    // form & modals
    form,
    roleModal,
    // state
    templateModalOpen,
    setTemplateModalOpen,
    selectedTemplate,
    setSelectedTemplate,
    roleList,
    selectedRole,
    smartError,
    showSmartErrorNotice,
    showSystemGuard,
    checkedPermIds,
    permLoading,
    permSaving,
    permKeywordInput,
    setPermKeywordInput,
    editingRoleName,
    setEditingRoleName,
    employeeModalOpen,
    setEmployeeModalOpen,
    employeeList,
    employeeLoading,
    logVisible,
    setLogVisible,
    logLoading,
    logRecords,
    setLogRecords,
    logTitle,
    remarkModalState,
    setRemarkModalState,
    remarkLoading,
    showSetupGuide,
    setShowSetupGuide,
    // computed
    sectionsComputed,
    totalPermCount,
    // actions
    fetchRoles,
    handleRoleSelect,
    savePerms,
    toggleIds,
    openDialog,
    handleApplyTemplate,
    closeDialog,
    handleRemarkConfirm,
    handleSave,
    handleDelete,
    handleOpenEmployeeList,
    handleRemoveEmployeeFromRole,
  } = useRoleListData();

  return (
    <>
      <PageLayout
        title="岗位管理"
        headerContent={
          <>
            {showSmartErrorNotice && smartError ? (
              <Card style={{ marginBottom: 12 }}>
                <SmartErrorNotice error={smartError} onFix={fetchRoles} />
              </Card>
            ) : null}
            {showSystemGuard && roleList.length > 0 && (() => {
              const broadRoles = roleList.filter((r) => String(r.status || 'active') === 'active' && String(r.dataScope || '') === 'all');
              if (broadRoles.length === 0) return null;
              return (
                <Alert
                  style={{ marginBottom: 12 }}
                  type="warning"
                  showIcon
                  message="权限防呆检测"
                  description={
                    <span>
                      当前有 <Text strong>{broadRoles.length}</Text> 个启用角色使用"全部数据"范围
                      （{broadRoles.slice(0, 3).map((r) => String(r.roleName || r.roleCode)).join('、')}{broadRoles.length > 3 ? '等' : ''}），建议审查。
                    </span>
                  }
                />
              );
            })()}
          </>
        }
      >
        <div className="role-split-layout">
          <RoleListPanel
            roleList={roleList}
            selectedRoleId={selectedRole?.id}
            onSelect={handleRoleSelect}
            onEdit={(role: Role) => openDialog(role)}
            onDelete={handleDelete}
            onCreate={() => openDialog()}
            onOpenTemplate={() => setTemplateModalOpen(true)}
          />
          <div className="role-perm-panel">
            <PermissionMatrix
              selectedRole={selectedRole}
              permLoading={permLoading}
              sectionsComputed={sectionsComputed}
              totalPermCount={totalPermCount}
              checkedPermIds={checkedPermIds}
              permKeywordInput={permKeywordInput}
              editingRoleName={editingRoleName}
              permSaving={permSaving}
              onPermKeywordChange={setPermKeywordInput}
              onEditingRoleNameChange={setEditingRoleName}
              onToggleIds={toggleIds}
              onSavePerms={savePerms}
              onOpenEmployeeList={handleOpenEmployeeList}
            />
          </div>
        </div>
      </PageLayout>

      <RoleFormModal
        open={roleModal.visible}
        isEdit={!!roleModal.data}
        form={form}
        onCancel={closeDialog}
        onOk={handleSave}
      />

      <EmployeeListModal
        open={employeeModalOpen}
        roleName={selectedRole?.roleName || ''}
        employeeList={employeeList}
        loading={employeeLoading}
        onCancel={() => setEmployeeModalOpen(false)}
        onRemoveEmployee={handleRemoveEmployeeFromRole}
      />

      <OperationLogModal
        open={logVisible}
        title={logTitle}
        records={logRecords}
        loading={logLoading}
        onCancel={() => { setLogVisible(false); setLogRecords([]); }}
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

      {/* 角色模板选择弹窗 */}
      <RoleTemplateModal
        open={templateModalOpen}
        selectedTemplate={selectedTemplate}
        onSelect={(_id, template: RoleTemplate | undefined) => setSelectedTemplate(template)}
        onCancel={() => { setTemplateModalOpen(false); setSelectedTemplate(undefined); }}
        onApply={handleApplyTemplate}
      />

      {/* 新租户开户向导 */}
      <TenantSetupGuide
        visible={showSetupGuide}
        onComplete={() => {
          setShowSetupGuide(false);
          message.success('基础角色已创建，请继续完善配置');
          fetchRoles();
        }}
        onSkip={() => {
          setShowSetupGuide(false);
        }}
      />
    </>
  );
};

export default RoleList;
