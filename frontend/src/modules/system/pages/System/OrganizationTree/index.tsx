import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import { organizationApi } from '@/services/system/organizationApi';
import { factoryApi } from '@/services/system/factoryApi';
import tenantService from '@/services/tenantService';
import type { Factory } from '@/services/system/factoryApi';
import type { ApiResult } from '@/utils/api';
import type { OrganizationUnit, User } from '@/types/system';
import { useUser } from '@/utils/AuthContext';
import {
  App, Avatar, Button, Checkbox, Col, DatePicker, Empty, Form, Input,
  InputNumber, Row, Select, Space, Spin, Switch, Tag,
} from 'antd';
import type { TableColumnsType } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SmallModal from '@/components/common/SmallModal';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import {
  ApartmentOutlined, BankOutlined, CrownFilled,
  PlusOutlined, QrcodeOutlined, SafetyCertificateOutlined,
  SnippetsOutlined, UserAddOutlined, UserOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import { getEmploymentStatusConfig, getGenderText } from '../UserList/hooks/useUserListColumns';
import { formatDate } from '@/utils/datetime';
import './styles.css';
import TemplateInitModal from './TemplateInitModal';
import AssignMemberModal from './AssignMemberModal';
import QrCodeModal from './components/QrCodeModal';
import ProfileModal from './components/ProfileModal';
import { useOrganizationTreeData } from './hooks/useOrganizationTreeData';
import { useOrganizationModals } from './hooks/useOrganizationModals';
import { useMemberActions } from './hooks/useMemberActions';
import { TreeItem } from './components/TreeItem';

const { Option } = Select;

const ownerTypeOptions = [
  { value: 'NONE', label: '通用部门' },
  { value: 'INTERNAL', label: '内部' },
  { value: 'EXTERNAL', label: '外部' },
];

const categoryOptions = [
  { value: '生产', label: '生产' },
  { value: '管理', label: '管理' },
  { value: '财务', label: '财务' },
  { value: '行政', label: '行政' },
  { value: '质检', label: '质检' },
  { value: '仓储', label: '仓储' },
  { value: '采购', label: '采购' },
  { value: '设计', label: '设计' },
];

function findUnit(nodes: OrganizationUnit[], id: string | null): OrganizationUnit | null {
  if (!id) return null;
  for (const node of nodes) {
    if (String(node.id) === id) return node;
    if (node.children?.length) {
      const found = findUnit(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getDescendantIds(node: OrganizationUnit): string[] {
  const ids: string[] = [String(node.id)];
  if (Array.isArray(node.children)) {
    node.children.forEach(child => ids.push(...getDescendantIds(child)));
  }
  return ids;
}

const OrganizationTreePage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user, isSuperAdmin, isTenantOwner } = useUser();
  const canManageUsers = isSuperAdmin || isTenantOwner;

  const {
    loading,
    treeData,
    visibleTreeData,
    departments,
    membersMap,
    setMembersMap,
    assignableUsers,
    loadData,
    loadAssignableUsers,
    totalMembers,
    unitNameMap,
    isFactoryAccount,
  } = useOrganizationTreeData();

  const {
    form: deptForm,
    dialogOpen,
    dialogMode,
    currentRecord,
    submitLoading: deptSubmitLoading,
    openCreate,
    openEdit,
    closeDialog,
    handleSubmit: handleDeptSubmit,
  } = useOrganizationModals(loadData);

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [includeSubUnits, setIncludeSubUnits] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const [qrModal, setQrModal] = useState<{ open: boolean; unit: OrganizationUnit | null; tenantCode: string }>(
    { open: false, unit: null, tenantCode: '' },
  );

  const [tplModal, setTplModal] = useState<{ open: boolean; type: 'FACTORY' | 'INTERNAL' | null; rootName: string; factoryId?: string }>(
    { open: false, type: null, rootName: '' },
  );
  const [tplLoading, setTplLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);

  const [managerLoading, setManagerLoading] = useState(false);

  const [userForm] = Form.useForm();
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSubmitLoading, setUserSubmitLoading] = useState(false);
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);

  const [inviteQr, setInviteQr] = useState<{ open: boolean; loading: boolean; qrBase64?: string; expiresAt?: string }>({ open: false, loading: false });

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<{ id: string; name: string }>({ id: '', name: '' });

  useEffect(() => {
    if (tplModal.open) {
      factoryApi.list({ pageSize: 500, status: 'active' }).then((res: ApiResult<{ records: Factory[] }>) => {
        setFactories(res?.data?.records ?? []);
      }).catch(() => setFactories([]));
    }
  }, [tplModal.open]);

  useEffect(() => {
    const loadRoles = async () => {
      setRoleOptionsLoading(true);
      try {
        const tenantId = (user as any)?.tenantId ? Number((user as any).tenantId) : null;
        if (tenantId) {
          const res: any = await api.get('/system/role/list', { params: { page: 1, pageSize: 500 } });
          if (res?.code === 200) {
            setRoleOptions(Array.isArray(res.data?.records) ? res.data.records : []);
          }
        }
      } catch { /* ignore */ } finally {
        setRoleOptionsLoading(false);
      }
    };
    void loadRoles();
  }, [user?.tenantId]);

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

  const handleInitTemplate = async () => {
    if (!tplModal.type) { message.warning('请选择一个模板类型'); return; }
    if (!tplModal.rootName.trim()) { message.warning('请输入根节点名称'); return; }
    setTplLoading(true);
    try {
      await organizationApi.initTemplate(tplModal.type, tplModal.rootName.trim(), tplModal.factoryId);
      message.success('模板初始化成功！组织架构已创建');
      setTplModal({ open: false, type: null, rootName: '' });
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setTplLoading(false);
    }
  };

  const handleSetManager = useCallback(async (unitId: string, managerUserId: string) => {
    setManagerLoading(true);
    try {
      await organizationApi.setManager(unitId, managerUserId);
      message.success(managerUserId ? '审批负责人已设置' : '审批负责人已清除');
      await loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '设置失败');
    } finally {
      setManagerLoading(false);
    }
  }, [message, loadData]);

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

  const handleDelete = (record: OrganizationUnit) => {
    let remarkValue = '';
    modal.confirm({
      width: '30vw',
      title: `删除部门「${record.unitName}」`,
      content: (
        <div>
          <p>仅允许删除没有子节点的部门，删除后该部门下成员将自动释放。</p>
          <p style={{ color: 'var(--color-error, #ff4d4f)', fontWeight: 500 }}>若该部门/工厂有未完成的生产订单，将无法删除。</p>
          <div style={{ marginTop: 16 }}>
            <span style={{ color: 'var(--color-error, #ff4d4f)' }}>*</span> 删除原因：
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

  const handleShowQRCode = useCallback(async (node: OrganizationUnit) => {
    let tenantCode = '';
    try {
      const res = await (tenantService as any).myTenant() as ApiResult<{ tenantCode?: string }> & { tenantCode?: string };
      tenantCode = res?.data?.tenantCode || res?.tenantCode || '';
    } catch { /* 静默 */ }
    setQrModal({ open: true, unit: node, tenantCode });
  }, []);

  const handleGenerateInvite = useCallback(async () => {
    setInviteQr({ open: true, loading: true });
    try {
      const res: any = await api.post('/system/user/invite-qr');
      if (res?.code === 200 && res?.data) {
        setInviteQr({ open: true, loading: false, qrBase64: res.data.qrCodeBase64 || res.data.qrBase64, expiresAt: res.data.expiresAt });
      } else {
        message.error(res?.message || '生成邀请二维码失败');
        setInviteQr({ open: false, loading: false });
      }
    } catch {
      message.error('生成邀请二维码失败');
      setInviteQr({ open: false, loading: false });
    }
  }, [message]);

  const openUserDialog = useCallback((u?: User) => {
    setEditingUser(u ?? null);
    if (u) {
      userForm.setFieldsValue({
        username: u.username,
        name: u.name,
        phone: u.phone,
        email: (u as any).email,
        gender: (u as any).gender,
        status: u.status,
        roleId: String((u as any).roleId || ''),
        employmentStatus: (u as any).employmentStatus,
        hireDate: (u as any).hireDate,
        permissionRange: (u as any).permissionRange,
      });
    } else {
      userForm.resetFields();
      if (selectedUnitId) {
        userForm.setFieldsValue({ orgUnitId: selectedUnitId });
      }
    }
    setUserModalOpen(true);
  }, [userForm, selectedUnitId]);

  const closeUserDialog = useCallback(() => {
    setUserModalOpen(false);
    setEditingUser(null);
    userForm.resetFields();
  }, [userForm]);

  const handleUserSubmit = useCallback(async () => {
    try {
      const values = await userForm.validateFields();
      setUserSubmitLoading(true);
      const payload = { ...values, id: editingUser?.id };
      const res: any = editingUser
        ? await api.put('/system/user', payload)
        : await api.post('/system/user', payload);
      if (res?.code === 200) {
        message.success(editingUser ? '保存成功' : '新增成功');
        closeUserDialog();
        await loadData();
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setUserSubmitLoading(false);
    }
  }, [editingUser, userForm, closeUserDialog, loadData, message]);

  const handleToggleUserStatus = useCallback(async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? '停用' : '启用';
    try {
      const res: any = await api.put('/system/user', { id: userId, status: newStatus });
      if (res?.code === 200) {
        message.success(`已${action}`);
        await loadData();
      } else {
        message.error(res?.message || `${action}失败`);
      }
    } catch {
      message.error(`${action}失败`);
    }
  }, [loadData, message]);

  const handleResetPassword = useCallback(async (record: User) => {
    modal.confirm({
      width: '30vw',
      title: `重置「${record.name || record.username}」的密码`,
      content: <div>确认重置该用户密码为默认密码？</div>,
      okText: '确认重置',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res: any = await api.post(`/system/user/${record.id}/reset-password`);
          if (res?.code === 200) {
            message.success('密码已重置');
          } else {
            message.error(res?.message || '重置失败');
          }
        } catch {
          message.error('重置失败');
        }
      },
    });
  }, [modal, message]);

  const selectedUnit = useMemo(() => findUnit(treeData, selectedUnitId), [treeData, selectedUnitId]);
  const isExternalSelected = selectedUnit?.ownerType === 'EXTERNAL';

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

  const externalMemberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar
            size={24}
            icon={<UserOutlined />}
            style={{ backgroundColor: r.isFactoryOwner ? 'var(--color-warning, #faad14)' : 'var(--color-success, #52c41a)', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setProfileUser(r)}
          />
          {v || r.username}
          {r.isFactoryOwner && (
            <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 2 }}>老板</Tag>
          )}
        </Space>
      ),
    },
    { title: '手机号码', dataIndex: 'phone', render: (v: string) => v || '—' },
    { title: '所属部门', dataIndex: 'orgUnitId', render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—' },
    {
      title: '在职状态',
      dataIndex: 'employmentStatus',
      width: 90,
      render: (v: string) => {
        const cfg = getEmploymentStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, r: User) => r.isFactoryOwner ? (
        <Tag color="gold"><CrownFilled /> 主账号</Tag>
      ) : (
        <Space size={4}>
          <Button
            icon={<CrownFilled />}
            loading={setOwnerLoading === String(r.id)}
            onClick={() => handleSetFactoryOwner(r)}
            size="small"
          >
            设为老板
          </Button>
          <Button
            danger
            size="small"
            onClick={() => handleRemoveMember(String(r.id), r.name || r.username || '')}
          >
            移出
          </Button>
        </Space>
      ),
    },
  ];

  const internalMemberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 120,
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar size={24} icon={<UserOutlined />} style={{ backgroundColor: 'var(--primary-color, #1677ff)', flexShrink: 0, cursor: 'pointer' }} onClick={() => setProfileUser(r)} />
          {v || r.username}
          {selectedUnit?.managerUserId && String(r.id) === String(selectedUnit.managerUserId) && (
            <Tag color="blue" style={{ fontSize: 10 }}>负责人</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '部门',
      dataIndex: 'orgUnitId',
      width: 120,
      render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—',
    },
    {
      title: '职位权限',
      dataIndex: 'roleName',
      width: 120,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '—',
    },
    {
      title: '性别',
      dataIndex: 'gender',
      width: 70,
      render: (v: string) => getGenderText(v),
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      width: 130,
      render: (v: string) => v || '—',
    },
    {
      title: '入职日期',
      dataIndex: 'hireDate',
      width: 110,
      render: (v: string) => v ? formatDate(v) : '—',
    },
    {
      title: '在职状态',
      dataIndex: 'employmentStatus',
      width: 90,
      render: (v: string) => {
        const cfg = getEmploymentStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '部门负责人',
      width: 90,
      render: (_: unknown, r: User) => {
        if (!selectedUnit?.managerUserId) return '—';
        return String(r.id) === String(selectedUnit.managerUserId) ? <Tag color="blue">是</Tag> : '—';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, r: User) => (
        <RowActions
          maxInline={2}
          actions={[
            {
              key: 'edit',
              label: '修改',
              title: '修改',
              onClick: () => openUserDialog(r),
              primary: true,
            },
            {
              key: 'resetPwd',
              label: '改密',
              title: '改密',
              onClick: () => handleResetPassword(r),
            },
            {
              key: 'toggleStatus',
              label: r.status === 'active' ? '停用' : '启用',
              title: r.status === 'active' ? '停用' : '启用',
              danger: r.status === 'active',
              onClick: () => handleToggleUserStatus(String(r.id), r.status),
            },
            {
              key: 'remove',
              label: '移出',
              title: '移出部门',
              danger: true,
              onClick: () => handleRemoveMember(String(r.id), r.name || r.username || ''),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageLayout
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {currentFactoryName ? (
              <>
                <BankOutlined style={{ marginRight: 6, color: 'var(--primary-color, #1677ff)', fontSize: 22 }} />
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-color, #1677ff)', marginRight: 14 }}>
                  {currentFactoryName}
                </span>
                <span style={{ color: 'var(--color-border-antd, #d9d9d9)', fontWeight: 300, fontSize: 20, marginRight: 14 }}>|</span>
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
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
                新增部门
              </Button>
            </Space>
          ) : undefined
        }
        headerContent={
          !isFactoryAccount ? (
            <div style={{ color: 'var(--neutral-text-secondary)', marginTop: 4 }}>
              管理公司组织结构与人员，包含部门、成员分配、职位权限。
              <span style={{ marginLeft: 12 }}>
                共 <strong>{departments.length}</strong> 个部门 · <strong>{totalMembers}</strong> 名人员
              </span>
            </div>
          ) : undefined
        }
      >
        <Spin spinning={loading}>
        {visibleTreeData.length === 0 && !loading ? (
          <Empty description="暂无组织架构数据" style={{ padding: '60px 0' }}>
            {!isFactoryAccount && (
              <Button type="primary" icon={<SnippetsOutlined />} onClick={() => setTplModal({ open: true, type: null, rootName: '' })}>
                使用模板快速创建
              </Button>
            )}
          </Empty>
        ) : (
          <div className="org-split-layout" style={{ height: 'calc(100vh - 180px)' }}>
            <div className="org-tree-panel" style={{ width: 240 }}>
              {visibleTreeData.map((node) => (
                <TreeItem
                  key={node.id ?? node.unitName}
                  node={node}
                  depth={0}
                  selectedId={selectedUnitId}
                  onSelect={setSelectedUnitId}
                  onAdd={openCreate}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onAddMember={handleOpenAssign}
                  onShowQRCode={handleShowQRCode}
                  readOnly={isFactoryAccount}
                />
              ))}
            </div>

            <div className="org-member-panel">
              {!selectedUnitId ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="请点击左侧节点查看成员"
                  style={{ paddingTop: 80 }}
                />
              ) : (
                <>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {selectedUnit?.unitName} · 成员列表
                      <span style={{ color: 'var(--color-text-tertiary, #999)', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                        共 {displayedMembers.length} 人
                      </span>
                      {selectedUnit?.managerUserName && (
                        <Tag icon={<SafetyCertificateOutlined />} color="blue" style={{ marginLeft: 8, fontSize: 11 }}>
                          审批人: {selectedUnit.managerUserName}
                        </Tag>
                      )}
                    </div>
                    {!isFactoryAccount && (
                      <Button
                        icon={<SafetyCertificateOutlined />}
                        loading={managerLoading}
                        onClick={async () => {
                          await loadAssignableUsers();
                          modal.confirm({
                            width: '30vw',
                            title: `设置「${selectedUnit?.unitName}」的审批负责人`,
                            content: (
                              <div style={{ marginTop: 12 }}>
                                <p style={{ color: 'var(--neutral-text-secondary)', marginBottom: 12 }}>
                                  审批负责人将负责审批该部门下成员发起的重要操作（删除/撤回/报废等）。
                                </p>
                                <Select
                                  id="managerSelect"
                                  style={{ width: '100%' }}
                                  showSearch
                                  allowClear
                                  optionFilterProp="label"
                                  placeholder="选择审批负责人"
                                  defaultValue={selectedUnit?.managerUserId || undefined}
                                  options={managerSelectOptions}
                                />
                              </div>
                            ),
                            okText: '确认',
                            cancelText: '取消',
                            onOk: async () => {
                              const selectEl = document.querySelector('.ant-select-selection-item') as HTMLElement;
                              const selectedValue = selectEl?.getAttribute('title') || '';
                              const matchingOpt = managerSelectOptions.find(o => o.label === selectedValue);
                              const managerId = matchingOpt?.value || '';
                              if (selectedUnit?.id) {
                                await handleSetManager(selectedUnit.id, managerId);
                              }
                            },
                          });
                        }}
                      >
                        设置审批人
                      </Button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Input
                      placeholder="搜索姓名或手机号"
                      allowClear
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      style={{ width: 200 }}
                    />
                    <Checkbox
                      checked={includeSubUnits}
                      onChange={e => setIncludeSubUnits(e.target.checked)}
                    >
                      包括下级成员
                    </Checkbox>
                    {!isFactoryAccount && (
                      <>
                        <Button
                          type="primary"
                          icon={<UserAddOutlined />}
                          onClick={() => selectedUnit && handleOpenAssign(selectedUnit)}
                        >
                          添加成员
                        </Button>
                        {canManageUsers && (
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() => openUserDialog()}
                          >
                            新增人员
                          </Button>
                        )}
                        {canManageUsers && (
                          <Button icon={<QrcodeOutlined />} onClick={handleGenerateInvite}>
                            邀请员工
                          </Button>
                        )}
                        {isExternalSelected && (
                          <Button
                            icon={<QrcodeOutlined />}
                            onClick={() => selectedUnit && handleShowQRCode(selectedUnit)}
                          >
                            注册二维码
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  <ResizableTable<User>
                    storageKey={isExternalSelected ? 'organization-tree-external-members' : 'organization-tree-members'}
                    rowKey={r => String(r.id ?? r.username)}
                    columns={isExternalSelected ? externalMemberColumns : internalMemberColumns}
                    dataSource={displayedMembers}
                    rowSelection={canManageUsers && !isExternalSelected ? {
                      selectedRowKeys,
                      onChange: (keys) => setSelectedRowKeys(keys as string[]),
                    } : undefined}
                    pagination={displayedMembers.length > DEFAULT_PAGE_SIZE ? {
                      showSizeChanger: true,
                      pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                    } : false}
                    locale={{ emptyText: isExternalSelected ? '暂无成员，可点击「添加成员」或通过扫码二维码注册' : '暂无成员，点击「添加成员」或「新增人员」' }}
                  />
                </>
              )}
            </div>
          </div>
        )}
        </Spin>
      </PageLayout>

      <ResizableModal
        open={dialogOpen}
        title={dialogMode === 'edit' ? '编辑部门' : '新增部门'}
        onCancel={closeDialog}
        onOk={handleDeptSubmit}
        confirmLoading={deptSubmitLoading}
        okText="保存"
        cancelText="取消"
        width="30vw"
        initialHeight={320}
      >
        <Form form={deptForm} layout="vertical" style={{ padding: '4px 0' }}>
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unitName" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
                <Input placeholder="例如：版房中心" maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="parentId" label="上级部门">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="不选则为顶级部门"
                  options={departmentOptions}
                  notFoundContent={departmentOptions.length === 0 ? '暂无部门' : '无匹配'}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="ownerType" label="内外标签" rules={[{ required: true, message: '请选择' }]}>
                <Select options={ownerTypeOptions} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="部门分类">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择分类"
                  options={categoryOptions}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sortOrder" label="排序">
                <InputNumber min={0} precision={0} placeholder="默认 0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          {dialogMode === 'edit' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="status" label="状态" valuePropName="checked" getValueFromEvent={(checked: boolean) => checked ? 'active' : 'inactive'} getValueProps={(v: string) => ({ checked: v !== 'inactive' })}>
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
              </Col>
            </Row>
          )}
          {currentRecord?.pathNames && (
            <div style={{ color: 'var(--neutral-text-secondary)', padding: '0 16px', marginTop: 8 }}>
              当前路径：{currentRecord.pathNames}
            </div>
          )}
        </Form>
      </ResizableModal>

      <ResizableModal
        title={editingUser ? '编辑人员' : '新增人员'}
        open={userModalOpen}
        onCancel={closeUserDialog}
        onOk={handleUserSubmit}
        okText="保存"
        cancelText="取消"
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.7)}
        confirmLoading={userSubmitLoading}
      >
        <Form form={userForm} layout="vertical" autoComplete="off">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            {!editingUser && (
              <Col span={8}>
                <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码不能少于6位' }]}>
                  <Input.Password placeholder="请输入密码" autoComplete="new-password" />
                </Form.Item>
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="roleId" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
                <Select placeholder="请选择角色" loading={roleOptionsLoading}>
                  {roleOptions.map((r: any) => (
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
              <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
                <Select placeholder="请选择状态">
                  <Option value="active">启用</Option>
                  <Option value="inactive">停用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="phone" label="手机号" rules={[{ pattern: /^1\d{10}$/, message: '手机号格式不正确' }]}>
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
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="orgUnitId" label="所属部门">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="选择部门"
                  options={departmentOptions}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="permissionRange" label="数据权限">
                <Select placeholder="请选择数据权限范围">
                  <Option value="all"><Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>查看全厂数据</Option>
                  <Option value="team"><Tag color="green" style={{ marginRight: 4 }}>团队</Tag>查看团队数据</Option>
                  <Option value="own"><Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>仅查看自己数据</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="email" label="邮箱">
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </ResizableModal>

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

      <SmallModal
        title="邀请员工扫码绑定微信"
        open={inviteQr.open}
        onCancel={() => setInviteQr({ open: false, loading: false })}
        footer={null}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          {inviteQr.loading ? (
            <div style={{ padding: '48px 0' }}><Spin tip="正在生成二维码..." /></div>
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
                      const tn = res?.data?.tenantName || res?.tenantName || (user as any)?.tenantName || '';
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