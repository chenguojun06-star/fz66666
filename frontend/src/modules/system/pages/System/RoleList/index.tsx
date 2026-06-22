import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Alert, App, Avatar, Button, Card, Checkbox, Divider, Empty, Form, Input, Select, Space, Spin, Tag, Badge, Statistic, Row, Col } from 'antd';
import type { ButtonProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { Role } from '@/types/system';
import { getErrorMessage } from '@/types/api';
import api, { requestWithPathFallback } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import './styles.css';
import { permissionCodes } from '@/routeConfig';
import {
  SafetyCertificateOutlined, UserOutlined, TeamOutlined,
  EditOutlined, FileTextOutlined,
  CrownOutlined, UserSwitchOutlined,
  ShoppingOutlined, FileOutlined, BarChartOutlined,
  ToolOutlined, ContainerOutlined, HomeOutlined,
  DollarOutlined, AuditOutlined,
  CarOutlined, ShopOutlined, AppstoreOutlined,
  CheckSquareOutlined, BorderOutlined, ReloadOutlined,
} from '@ant-design/icons';

/** 角色类型分类定义 */
type RoleCategory = 'internal' | 'external_factory' | 'supplier' | 'other';

interface RoleTemplateWithCategory {
  template: { templateName?: string; description?: string; isEnabled?: string };
  category: RoleCategory;
  categoryLabel: string;
  categoryColor: string;
}

/** 根据角色模板名称判断角色类型 */
function getRoleCategory(template: { templateName?: string; description?: string; isEnabled?: string }): RoleTemplateWithCategory {
  const name = template.templateName?.toLowerCase() || '';
  const desc = template.description?.toLowerCase() || '';

  // 外发工厂角色
  if (name.includes('factory_owner') || name.includes('external') || desc.includes('外发') || desc.includes('外包') || desc.includes('external factory')) {
    return {
      template,
      category: 'external_factory',
      categoryLabel: '外发工厂',
      categoryColor: 'blue',
    };
  }

  // 第三方供应商角色（物料/面辅料）
  if (name.includes('supplier') || name.includes('vendor') || desc.includes('供应商') || desc.includes('面辅料') || desc.includes('物料供应商')) {
    return {
      template,
      category: 'supplier',
      categoryLabel: '第三方供应商',
      categoryColor: 'purple',
    };
  }

  // 内部角色（管理员、主管、普通员工等）
  if (name.includes('admin') || name.includes('manager') || name.includes('supervisor') ||
      name.includes('full_admin') || name.includes('management') ||
      name.includes('operator') || name.includes('merchandiser') ||
      name.includes('leader') || name.includes('组长') || name.includes('主管') ||
      name.includes('管理员') || name.includes('经理') || name.includes('员工')) {
    return {
      template,
      category: 'internal',
      categoryLabel: '内部员工',
      categoryColor: 'green',
    };
  }

  // 其他类型
  return {
    template,
    category: 'other',
    categoryLabel: '其他',
    categoryColor: 'default',
  };
}

/** 角色分类对应的图标 */
const RoleCategoryIcon: Record<RoleCategory, React.ReactNode> = {
  internal: <UserOutlined />,
  external_factory: <AppstoreOutlined />,
  supplier: <ShopOutlined />,
  other: <TeamOutlined />,
};

const SIDEBAR_PERM_SECTIONS = [
  { title: '仪表盘', items: [{ label: '仪表盘', code: permissionCodes.dashboard }] },
  { title: '选品中心', items: [{ label: '选品中心', code: permissionCodes.selection }] },
  { title: '样衣管理', items: [
    { label: '样衣开发', code: permissionCodes.styleInfo },
    { label: '资料单价', code: permissionCodes.dataCenter },
    { label: '样衣库存', code: permissionCodes.sampleInventory },
    { label: '下单管理', code: permissionCodes.orderManagement },
  ]},
  { title: '物料管理', items: [
    { label: '物料采购', code: permissionCodes.materialPurchase },
    { label: '物料出入库', code: permissionCodes.materialInventory },
    { label: '物料新增', code: permissionCodes.materialDatabase },
  ]},
  { title: '生产管理', items: [
    { label: '我的订单', code: permissionCodes.productionList },
    { label: '裁剪管理', code: permissionCodes.cutting },
    { label: '工序跟进', code: permissionCodes.progress },
    { label: '外发工厂', code: permissionCodes.progress },
    { label: '质检入库', code: permissionCodes.warehousing },
  ]},
  { title: '供应商管理', items: [{ label: '供应商管理', code: permissionCodes.factory }] },
  { title: '成品管理', items: [
    { label: '成品出入库', code: permissionCodes.finishedInventory },
    { label: '库存盘点', code: permissionCodes.inventoryCheck },
    { label: '电商订单', code: permissionCodes.ecommerceOrders },
  ]},
  { title: 'CRM客户管理', items: [
    { label: '客户档案', code: permissionCodes.crm },
    { label: '应收账款', code: permissionCodes.crmReceivables },
  ]},
  { title: '财务管理', items: [
    { label: '物料对账', code: permissionCodes.materialRecon },
    { label: '工资结算', code: permissionCodes.financeCenter },
    { label: '外发结算', code: permissionCodes.financeCenter },
    { label: '费用报销', code: permissionCodes.expenseReimbursement },
    { label: '收付款中心', code: permissionCodes.wagePayment },
    { label: 'EC销售收入', code: permissionCodes.financeTaxExport },
    { label: '财税导出', code: permissionCodes.financeTaxExport },
  ]},
  { title: '系统设置', items: [
    { label: '人员管理', code: permissionCodes.user },
    { label: '岗位管理', code: permissionCodes.role },
    { label: '组织架构', code: permissionCodes.organization },
    { label: '合作企业管理', code: permissionCodes.partnerManagement },
    { label: '字典管理', code: permissionCodes.dict },
    { label: '系统日志', code: permissionCodes.systemLogs },
    { label: '系统教学', code: permissionCodes.tutorial },
    { label: '数据导入', code: permissionCodes.dataImport },
    { label: '孤立数据', code: permissionCodes.systemIssues },
  ]},
  { title: '应用商店', items: [{ label: '应用商店', code: permissionCodes.appStore }] },
  { title: '客户管理', items: [{ label: '客户管理', code: permissionCodes.customerManagement }] },
  { title: 'API对接管理', items: [{ label: 'API对接管理', code: permissionCodes.tenantManagement }] },
  { title: '智能运营中心', items: [
    { label: '智能运营中心', code: permissionCodes.intelligenceCenter },
    { label: '数据看板', code: permissionCodes.intelligenceCenter },
  ]},
];

type PermissionNode = {
  id?: number | string;
  parentId?: number;
  permissionCode?: string;
  permissionName?: string;
  permissionType?: string;
  children?: PermissionNode[];
};

type RoleRecord = Role & Record<string, unknown>;
type OperationLog = { id?: number | string; bizType?: string; bizId?: string; action?: string; operator?: string; remark?: string; createTime?: string };

type RemarkModalState = {
  open: boolean;
  title: string;
  okText: string;
  okDanger: boolean;
  onConfirm: (remark: string) => Promise<void>;
};

const ROLE_ICON_MAP: Record<string, React.ReactNode> = {
  '超级管理员': <CrownOutlined />,
  '管理员': <SafetyCertificateOutlined />,
  '人事': <TeamOutlined />,
  '财务': <DollarOutlined />,
  '销售': <ShoppingOutlined />,
  '设计师': <EditOutlined />,
  '纸样师': <FileOutlined />,
  '裁板师': <ToolOutlined />,
  '车版师': <ContainerOutlined />,
  '跟单': <FileTextOutlined />,
  '跟单专员': <FileTextOutlined />,
  '采购': <CarOutlined />,
  '采购专员': <CarOutlined />,
  '仓库': <HomeOutlined />,
  '质检': <AuditOutlined />,
  '摄影师': <BarChartOutlined />,
  '美工': <BarChartOutlined />,
  '手工': <ToolOutlined />,
};

const getRoleIcon = (name: string) => {
  for (const [key, icon] of Object.entries(ROLE_ICON_MAP)) {
    if (name.includes(key)) return icon;
  }
  return <UserSwitchOutlined />;
};

const RoleList: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const roleModal = useModal<Role>();

  const [roleList, setRoleList] = useState<RoleRecord[]>([]);
  const [roleUserCounts, setRoleUserCounts] = useState<Record<string, number>>({});
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showSystemGuard = useMemo(() => isSmartFeatureEnabled('smart.system.guard.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => { if (!showSmartErrorNotice) return; setSmartError({ title, reason, code }); };

  const [permTree, setPermTree] = useState<PermissionNode[]>([]);
  const [checkedPermIds, setCheckedPermIds] = useState<Set<number>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permKeyword, setPermKeyword] = useState('');

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeList, setEmployeeList] = useState<any[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const [editingRoleName, setEditingRoleName] = useState(false);
  const [roleNameValue, setRoleNameValue] = useState('');

  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<OperationLog[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, { params: { page: 1, pageSize: 1000 } });
      const result = response as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) {
        const data = (result.data as { records?: RoleRecord[]; total?: number }) || {};
        const list = Array.isArray(data.records) ? data.records : [];
        setRoleList(list);
        // 为每个角色查询用户数（简化：只取前20个避免过多请求；如果有聚合接口可以替换）
        const counts: Record<string, number> = {};
        try {
          const userRes = await api.get('/system/user/list', { params: { page: 1, pageSize: 500 } });
          const userData = (userRes as any)?.data?.records || [];
          for (const u of userData) {
            if (u.roleId != null) {
              const key = String(u.roleId);
              counts[key] = (counts[key] || 0) + 1;
            }
          }
          setRoleUserCounts(counts);
        } catch {
          // 忽略用户数统计失败
        }
        if (showSmartErrorNotice) setSmartError(null);
        return;
      }
      reportSmartError('角色列表加载失败', String(result.message || '服务返回异常'), 'SYSTEM_ROLE_LIST_FAILED');
      message.error(String(result.message || '获取角色列表失败'));
    } catch (error) {
      reportSmartError('角色列表加载失败', getErrorMessage(error, '网络异常'), 'SYSTEM_ROLE_LIST_EXCEPTION');
      message.error(getErrorMessage(error, '获取角色列表失败'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, showSmartErrorNotice]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const loadPermTreeAndChecked = useCallback(async (roleId: string) => {
    const rid = String(roleId || '').trim();
    if (!rid) { setPermTree([]); setCheckedPermIds(new Set()); return; }
    setPermLoading(true);
    try {
      const [treeRes, idsRes] = await Promise.all([
        requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree'),
        requestWithPathFallback('get', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`),
      ]);
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
      if (treeResult.code === 200) setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []);
      else setPermTree([]);
      const idList = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setCheckedPermIds(new Set(idList.map((id: any) => Number(id))));
    } catch { message.error('加载权限失败'); setPermTree([]); setCheckedPermIds(new Set()); }
    finally { setPermLoading(false); }
  }, [message]);

  useEffect(() => {
    if (selectedRole?.id) {
      loadPermTreeAndChecked(String(selectedRole.id));
    } else {
      setPermTree([]);
      setCheckedPermIds(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole?.id]);

  const permCodeMap = useMemo(() => {
    const map = new Map<string, PermissionNode>();
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        const code = String(n.permissionCode || '').trim();
        if (code) map.set(code, n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    return map;
  }, [permTree]);

  const permissionsByModule = useMemo(() => {
    const kw = String(permKeyword || '').trim().toLowerCase();
    const firstCodeLabel = new Map<string, string>();
    const result = SIDEBAR_PERM_SECTIONS.map((section) => {
      const items: Array<{ label: string; permNode: PermissionNode | null; sharedWith: string | null }> = [];
      for (const item of section.items) {
        const sharedWith = firstCodeLabel.has(item.code) ? firstCodeLabel.get(item.code)! : null;
        if (!firstCodeLabel.has(item.code)) {
          firstCodeLabel.set(item.code, item.label);
        }
        const node = permCodeMap.get(item.code) || null;
        items.push({ label: item.label, permNode: node, sharedWith });
      }
      return { title: section.title, items };
    }).filter(s => s.items.length > 0);
    if (!kw) return result;
    return result.filter(s =>
      s.title.toLowerCase().includes(kw) ||
      s.items.some(it => it.label.toLowerCase().includes(kw) || (it.permNode?.children || []).some((c: PermissionNode) => String(c.permissionName || '').toLowerCase().includes(kw)))
    );
  }, [permKeyword, permCodeMap]);

  const savePerms = async () => {
    if (!selectedRole?.id) return;
    openRemarkModal('确认授权', '确认授权', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${selectedRole.id}/permission-ids`, `/auth/role/${selectedRole.id}/permission-ids`, { permissionIds: ids, remark });
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) { message.success('授权成功'); } else { message.error(String(result.message || '授权失败')); }
      } catch { message.error('授权失败'); } finally { setPermSaving(false); }
    });
  };

  // 一键全选所有权限
  const handleSelectAll = () => {
    const next = new Set(checkedPermIds);
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        if (n.id != null) next.add(Number(n.id));
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    setCheckedPermIds(next);
  };

  // 一键取消所有权限
  const handleDeselectAll = () => {
    const next = new Set<number>();
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        if (n.id != null) next.delete(Number(n.id));
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    // 或者直接清空
    setCheckedPermIds(new Set());
  };

  // 一键选中某个模块的所有权限
  const handleSelectModule = (moduleLabel: string) => {
    const section = permissionsByModule.find(s => s.title === moduleLabel);
    if (!section) return;
    const next = new Set(checkedPermIds);
    for (const item of section.items) {
      if (item.permNode?.id != null) {
        next.add(Number(item.permNode.id));
        for (const child of (item.permNode.children || []) as PermissionNode[]) {
          if (child.id != null) next.add(Number(child.id));
        }
      }
    }
    setCheckedPermIds(next);
  };

  // 一键取消某个模块的所有权限
  const handleDeselectModule = (moduleLabel: string) => {
    const section = permissionsByModule.find(s => s.title === moduleLabel);
    if (!section) return;
    const next = new Set(checkedPermIds);
    for (const item of section.items) {
      if (item.permNode?.id != null) {
        next.delete(Number(item.permNode.id));
        for (const child of (item.permNode.children || []) as PermissionNode[]) {
          if (child.id != null) next.delete(Number(child.id));
        }
      }
    }
    setCheckedPermIds(next);
  };

  const openDialog = (role?: Role) => {
    roleModal.open(role ?? undefined);
    form.setFieldsValue({
      roleName: String(role?.roleName || ''),
      roleCode: String(role?.roleCode || ''),
      description: String(role?.description || ''),
      status: role?.status || 'active',
      dataScope: role?.dataScope || 'all',
    });
  };

  const closeDialog = () => { roleModal.close(); form.resetFields(); };

  const openRemarkModal = (title: string, okText: string, okButtonProps: ButtonProps | undefined, onConfirm: (remark: string) => Promise<void>) => {
    setRemarkModalState({ open: true, title, okText, okDanger: okButtonProps?.danger === true, onConfirm });
  };

  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try { await remarkModalState.onConfirm(remark); setRemarkModalState(null); } catch { } finally { setRemarkLoading(false); }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const currentRole = roleModal.data;
      const payload: Role = { ...(currentRole || ({} as any)), ...values, status: (values as any)?.status || 'active', dataScope: (values as any)?.dataScope || 'all' };
      const submit = async (remark?: string) => {
        const nextPayload = { ...payload, operationRemark: remark };
        let response;
        if (nextPayload?.id) { response = await requestWithPathFallback('put', '/system/role', '/auth/role', nextPayload); }
        else { response = await requestWithPathFallback('post', '/system/role', '/auth/role', nextPayload); }
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) { message.success('保存成功'); closeDialog(); fetchRoles(); }
        else { message.error(String(result.message || '保存失败')); }
      };
      if (payload?.id) { openRemarkModal('确认保存', '确认保存', undefined, submit); return; }
      await submit();
    } catch (error: unknown) { message.error(getErrorMessage(error, '保存失败')); }
  };

  const handleDelete = async (id?: string | number) => {
    const rid = String(id ?? '').trim();
    if (!rid) return;
    openRemarkModal('确认删除', '删除', { danger: true }, async (remark) => {
      try {
        const response = await requestWithPathFallback('delete', `/system/role/${rid}`, `/auth/role/${rid}`, undefined, { params: { remark } });
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) { message.success('删除成功'); fetchRoles(); if (selectedRole?.id === rid) setSelectedRole(null); return; }
        throw new Error(String(result.message || '删除失败'));
      } catch (error: unknown) { message.error(getErrorMessage(error, '删除失败')); throw error; }
    });
  };

  const handleOpenEmployeeList = async () => {
    if (!selectedRole?.id) return;
    setEmployeeModalOpen(true);
    setEmployeeLoading(true);
    try {
      const res = await api.get('/system/user/list', { params: { roleId: selectedRole.id, page: 1, pageSize: 500 } });
      const result = res as any;
      if (result.code === 200) { setEmployeeList(result.data?.records || []); }
      else { setEmployeeList([]); }
    } catch { setEmployeeList([]); }
    finally { setEmployeeLoading(false); }
  };

  const handleRemoveEmployeeFromRole = useCallback(async (userId: string, userName: string) => {
    modal.confirm({
      width: '30vw',
      title: `移除「${userName}」的${selectedRole?.roleName || ''}角色`,
      content: '该员工将失去此角色对应的权限，确认移除？',
      okText: '确认移除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res: any = await api.put('/system/user', { id: userId, roleId: '' });
          if (res?.code === 200) {
            message.success('已移除角色');
            await handleOpenEmployeeList();
          } else {
            message.error(res?.message || '移除失败');
          }
        } catch {
          message.error('移除失败');
        }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, modal, message]);

  const handleSaveRoleName = useCallback(async () => {
    if (!selectedRole?.id || !roleNameValue.trim()) return;
    try {
      const res: any = await requestWithPathFallback('put', '/system/role', '/auth/role', {
        ...selectedRole,
        roleName: roleNameValue.trim(),
      });
      if (res?.code === 200) {
        message.success('职位名称已更新');
        setEditingRoleName(false);
        await fetchRoles();
        setSelectedRole({ ...selectedRole, roleName: roleNameValue.trim() } as RoleRecord);
      } else {
        message.error(res?.message || '更新失败');
      }
    } catch {
      message.error('更新失败');
    }
  }, [selectedRole, roleNameValue, fetchRoles, message]);

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title); setLogVisible(true); setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) { setLogRecords(Array.isArray(result.data) ? (result.data as OperationLog[]) : []); }
      else { message.error(String(result.message || '获取日志失败')); setLogRecords([]); }
    } catch (e: unknown) { message.error(getErrorMessage(e, '获取日志失败')); setLogRecords([]); }
    finally { setLogLoading(false); }
  };

  const employeeColumns: ColumnsType<any> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r: any) => (
        <Space size={6}>
          <Avatar size={24} icon={<UserOutlined />} style={{ backgroundColor: 'var(--primary-color, var(--color-primary))', flexShrink: 0 }} />
          {v || r.username}
        </Space>
      ),
    },
    { title: '手机号', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'red'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, r: any) => (
        <Button danger size="small" onClick={() => handleRemoveEmployeeFromRole(String(r.id), r.name || r.username)}>
          移除
        </Button>
      ),
    },
  ];

  const logColumns: ColumnsType<OperationLog> = [
    { title: '动作', dataIndex: 'action', key: 'action', width: 120, render: (v: string) => v || '-' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120, render: (v: string) => v || '-' },
    { title: '原因', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (v: string) => formatDateTime(v) },
  ];

  return (
    <>
      <PageLayout
        title="角色与权限管理"
        titleExtra={
          <Button type="primary" onClick={() => openDialog()}>
            新增角色
          </Button>
        }
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
                <Alert style={{ marginBottom: 12 }} type="warning" showIcon icon={<span></span>} title="权限防呆检测"
                  description={<span>当前有 <strong>{broadRoles.length}</strong> 个启用角色使用"全部数据"范围（{broadRoles.slice(0, 3).map((r) => String(r.roleName || r.roleCode)).join('、')}{broadRoles.length > 3 ? '等' : ''}），建议审查。</span>} banner={false} />
              );
            })()}
          </>
        }
      >
        <div className="role-split-layout" style={{ height: 'calc(100vh - 180px)' }}>
          <div className="role-list-panel" style={{ width: 260 }}>
            <div className="role-list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>角色列表</span>
              <Tag color="blue" style={{ marginRight: 0 }}>{roleList.length} 个角色</Tag>
            </div>
            <div className="role-list-items">
              {roleList.map(role => {
                const isActive = String(role.id) === String(selectedRole?.id);
                const categoryInfo = getRoleCategory({ templateName: role.roleCode, description: role.description, isEnabled: role.status === 'active' } as any);
                const userCount = roleUserCounts[String(role.id)] || 0;
                return (
                  <div
                    key={String(role.id || role.roleCode)}
                    className={`role-list-item${isActive ? ' role-list-item-active' : ''}`}
                    onClick={() => { setSelectedRole(role); setEditingRoleName(false); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                      <span className="role-list-item-icon" style={{ color: isActive ? 'var(--primary-color, var(--color-primary))' : 'var(--color-text-tertiary, #999)', marginTop: 2, flexShrink: 0 }}>
                        {RoleCategoryIcon[categoryInfo.category]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="role-list-item-name" style={{ fontWeight: 600, fontSize: 14 }}>{role.roleName}</span>
                          <Space size={4}>
                            {role.status === 'active'
                              ? <Badge status="success" text={<span style={{ fontSize: 11, color: 'var(--color-text-secondary, #666)' }}>启用</span>} />
                              : <Badge status="default" text={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #999)' }}>停用</span>} />
                            }
                          </Space>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Tag color={categoryInfo.categoryColor} style={{ fontSize: 11, marginRight: 0, padding: '0 6px' }}>
                            {categoryInfo.categoryLabel}
                          </Tag>
                          <Tag color="cyan" style={{ fontSize: 11, marginRight: 0, padding: '0 6px' }}>
                            <UserOutlined style={{ fontSize: 10, marginRight: 2 }} />{userCount} 人
                          </Tag>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {roleList.length === 0 && <Empty description="暂无角色" style={{ padding: '40px 0' }} />}
            </div>
          </div>

          <div className="role-perm-panel">
            {!selectedRole ? (
              <Empty
                description={
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>请选择一个角色</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                      从左侧角色列表中选择一个角色<br />查看或编辑它的权限配置
                    </div>
                  </div>
                }
                style={{ paddingTop: 80 }}
              />
            ) : (
              <>
                {/* 角色信息卡片 */}
                <Card style={{ marginBottom: 12, border: '1px solid var(--color-border-light, #e8e8e8)' }}>
                  <Row gutter={16} align="middle">
                    <Col flex="auto">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {editingRoleName ? (
                          <Space>
                            <Input
                              value={roleNameValue}
                              onChange={e => setRoleNameValue(e.target.value)}
                              style={{ width: 180 }}
                              onPressEnter={handleSaveRoleName}
                              autoFocus
                            />
                            <Button type="primary" size="small" onClick={handleSaveRoleName}>保存</Button>
                            <Button size="small" onClick={() => setEditingRoleName(false)}>取消</Button>
                          </Space>
                        ) : (
                          <span
                            style={{ fontSize: 20, fontWeight: 700, cursor: 'pointer', borderBottom: '1px dashed var(--color-border-antd, var(--color-border-antd))' }}
                            onClick={() => { setEditingRoleName(true); setRoleNameValue(selectedRole.roleName || ''); }}
                            title="点击编辑角色名称"
                          >
                            {selectedRole.roleName}
                          </span>
                        )}
                        <Tag color="blue">{selectedRole.roleCode}</Tag>
                        {(() => {
                          const categoryInfo = getRoleCategory({ templateName: selectedRole.roleCode, description: selectedRole.description, isEnabled: selectedRole.status === 'active' } as any);
                          return (
                            <Tag icon={RoleCategoryIcon[categoryInfo.category]} color={categoryInfo.categoryColor}>
                              {categoryInfo.categoryLabel}
                            </Tag>
                          );
                        })()}
                        <Tag color={selectedRole.status === 'active' ? 'green' : 'default'}>
                          {selectedRole.status === 'active' ? '启用' : '停用'}
                        </Tag>
                      </div>
                      {selectedRole.description && (
                        <div style={{ color: 'var(--color-text-secondary, #666)', fontSize: 13, marginTop: 8 }}>
                          {selectedRole.description}
                        </div>
                      )}
                    </Col>
                  </Row>
                  <Divider style={{ margin: '12px 0' }} />
                  <Row gutter={16}>
                    <Col span={8}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary-color, #1677ff)' }}>
                          {roleUserCounts[String(selectedRole.id)] || 0}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>人在使用此角色</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success, #52c41a)' }}>
                          {checkedPermIds.size}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>项已选权限</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-warning, #faad14)' }}>
                          {String(selectedRole.dataScope || 'all') === 'all' ? '全部' : String(selectedRole.dataScope) === 'team' ? '团队' : '个人'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>数据范围</div>
                      </div>
                    </Col>
                  </Row>
                  <Divider style={{ margin: '12px 0' }} />
                  <Space wrap>
                    <Button
                      icon={<TeamOutlined />}
                      onClick={handleOpenEmployeeList}
                    >
                      查看此角色的员工
                    </Button>
                    <Button onClick={() => openDialog(selectedRole as any)}>编辑角色</Button>
                    <Button danger onClick={() => handleDelete(selectedRole.id)}>删除角色</Button>
                    <Button onClick={() => openLogModal('role', String(selectedRole.id || ''), `角色 ${selectedRole.roleName} 操作日志`)}>操作日志</Button>
                  </Space>
                </Card>

                {/* 权限操作工具栏 */}
                <div className="role-perm-toolbar" style={{ marginBottom: 8 }}>
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<CheckSquareOutlined />}
                      onClick={handleSelectAll}
                      disabled={permLoading || permissionsByModule.length === 0}
                    >
                      一键全选
                    </Button>
                    <Button
                      icon={<BorderOutlined />}
                      onClick={handleDeselectAll}
                      disabled={permLoading || permissionsByModule.length === 0}
                    >
                      一键取消
                    </Button>
                    <Input value={permKeyword} onChange={(e) => setPermKeyword(e.target.value)} placeholder="搜索权限名称" style={{ width: 200 }} allowClear />
                    {permKeyword && <Button onClick={() => setPermKeyword('')}>清空搜索</Button>}
                    <span style={{ color: 'var(--color-text-secondary, #666)', fontWeight: 500 }}>已选 <strong style={{ color: 'var(--primary-color, #1677ff)' }}>{checkedPermIds.size}</strong> 项权限</span>
                  </Space>
                  <Space>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => selectedRole?.id && loadPermTreeAndChecked(String(selectedRole.id))}
                      loading={permLoading}
                    >
                      刷新权限
                    </Button>
                    <Button type="primary" onClick={savePerms} loading={permSaving}>保存权限</Button>
                  </Space>
                </div>

                {/* 权限模块卡片 */}
                <div className="role-perm-cards">
                  {permLoading ? (
                    <div style={{ padding: '48px 0', textAlign: 'center' }}><Spin size="large" tip="加载权限中..." /></div>
                  ) : permissionsByModule.length ? (
                    <Row gutter={12}>
                      {permissionsByModule.map((section, si) => {
                        // 计算本模块的权限数和已选数
                        let moduleTotal = 0;
                        let moduleChecked = 0;
                        for (const item of section.items) {
                          if (item.permNode?.id != null) {
                            moduleTotal++;
                            if (checkedPermIds.has(Number(item.permNode.id))) moduleChecked++;
                            for (const child of ((item.permNode as PermissionNode)?.children || []) as PermissionNode[]) {
                              moduleTotal++;
                              if (checkedPermIds.has(Number(child.id))) moduleChecked++;
                            }
                          }
                        }
                        return (
                          <Col xs={24} sm={24} md={12} lg={8} xl={8} key={si} style={{ marginBottom: 12 }}>
                            <Card
                              size="small"
                              title={
                                <Space>
                                  <span style={{ fontWeight: 600 }}>{section.title}</span>
                                  {moduleTotal > 0 && (
                                    <Tag color={moduleChecked === moduleTotal ? 'green' : moduleChecked > 0 ? 'blue' : 'default'} style={{ marginRight: 0 }}>
                                      {moduleChecked}/{moduleTotal} 已选
                                    </Tag>
                                  )}
                                </Space>
                              }
                              extra={
                                moduleTotal > 0 ? (
                                  <Space size={4}>
                                    <Button size="small" type="primary" onClick={() => handleSelectModule(section.title)}>
                                      开通本模块
                                    </Button>
                                    <Button size="small" onClick={() => handleDeselectModule(section.title)}>
                                      取消本模块
                                    </Button>
                                  </Space>
                                ) : null
                              }
                              style={{ height: '100%' }}
                            >
                              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                {section.items.map((item) => {
                                  const nodeId = item.permNode ? Number(item.permNode.id) : 0;
                                  const isShared = item.sharedWith !== null;
                                  const btnNodes = isShared ? [] : ((item.permNode as PermissionNode)?.children || []) as PermissionNode[];
                                  const allIds = nodeId ? [nodeId, ...btnNodes.map(b => Number(b.id))] : [];
                                  const moduleAllSelected = nodeId ? allIds.every(id => checkedPermIds.has(id)) : false;
                                  return (
                                    <div key={`${si}-${item.label}`} className="perm-group-row" style={{ borderBottom: si < permissionsByModule.length - 1 || section.items.indexOf(item) < section.items.length - 1 ? '1px solid var(--color-border-light, #f0f0f0)' : 'none', paddingBottom: 8, marginBottom: 8 }}>
                                      {nodeId ? (
                                        <Checkbox
                                          checked={moduleAllSelected}
                                          onChange={(e) => {
                                            const next = new Set(checkedPermIds);
                                            if (e.target.checked) allIds.forEach(id => next.add(id));
                                            else allIds.forEach(id => next.delete(id));
                                            setCheckedPermIds(next);
                                          }}
                                        >
                                          <span style={{ fontWeight: 500 }}>{item.label}</span>
                                        </Checkbox>
                                      ) : (
                                        <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-secondary, #666)' }}>{item.label}</span>
                                      )}
                                      {isShared && (
                                        <span style={{ fontSize: 12, color: 'var(--color-text-quaternary, #999)', marginLeft: 4 }}>
                                          （同「{item.sharedWith}」）
                                        </span>
                                      )}
                                      {!isShared && btnNodes.length > 0 && (
                                        <div className="perm-group-btns" style={{ paddingLeft: 24, marginTop: 4 }}>
                                          {btnNodes.map(btn => (
                                            <Checkbox
                                              key={btn.id}
                                              checked={checkedPermIds.has(Number(btn.id))}
                                              onChange={(e) => {
                                                const next = new Set(checkedPermIds);
                                                if (e.target.checked) next.add(Number(btn.id)); else next.delete(Number(btn.id));
                                                setCheckedPermIds(next);
                                              }}
                                            >
                                              <span style={{ fontSize: 12 }}>{btn.permissionName}</span>
                                            </Checkbox>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </Space>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  ) : (
                    <Empty description="暂无可配置权限" />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </PageLayout>

      <ResizableModal
        open={roleModal.visible}
        title={roleModal.data ? '编辑角色' : '新增角色'}
        onCancel={closeDialog}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.5 : 500}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="roleName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
              <Input placeholder="请输入角色名称" />
            </Form.Item>
            <Form.Item name="roleCode" label="角色编码" rules={[{ required: true, message: '请输入角色编码' }]}>
              <Input placeholder="如：MANAGER" disabled={!!roleModal.data} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
              <Select options={[{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]} />
            </Form.Item>
            <Form.Item name="dataScope" label="数据权限范围" rules={[{ required: true, message: '请选择数据权限范围' }]}>
              <Select options={[{ value: 'all', label: '全部数据' }, { value: 'team', label: '团队数据' }, { value: 'own', label: '个人数据' }]} />
            </Form.Item>
          </div>
        </Form>
      </ResizableModal>

      <ResizableModal
        open={employeeModalOpen}
        title={`「${selectedRole?.roleName || ''}」的员工列表`}
        onCancel={() => setEmployeeModalOpen(false)}
        footer={null}
        width="40vw"
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}
      >
        <ResizableTable
          columns={employeeColumns}
          dataSource={employeeList}
          rowKey={(r) => String(r.id || r.username)}
          loading={employeeLoading}
          pagination={employeeList.length > 10 ? { pageSize: 10 } : false}
        />
      </ResizableModal>

      <ResizableModal
        open={logVisible}
        title={logTitle}
        onCancel={() => { setLogVisible(false); setLogRecords([]); }}
        footer={null}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <ResizableTable<OperationLog>
          columns={logColumns}
          dataSource={logRecords}
          rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
          loading={logLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </ResizableModal>

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

export default RoleList;