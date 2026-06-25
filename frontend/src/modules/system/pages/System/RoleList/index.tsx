import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Alert, App, Avatar, Button, Card, Checkbox, Col, Empty, Form, Input, Modal, Row, Select, Space, Spin, Tag, Tabs, Tooltip, Typography, message } from 'antd';
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
import RoleTemplateSelector, { RoleTemplate } from './components/RoleTemplateSelector';
import TenantSetupGuide from './components/TenantSetupGuide';
import { roleTemplateApi } from '@/services/system/roleTemplateApi';
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
  CheckSquareOutlined, BorderOutlined, ReloadOutlined, UnorderedListOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

type RoleCategory = 'internal' | 'external_factory' | 'supplier' | 'other';

interface RoleTemplateWithCategory {
  template: { templateName?: string; description?: string; isEnabled?: string };
  category: RoleCategory;
  categoryLabel: string;
  categoryColor: string;
}

function getRoleCategory(template: { templateName?: string; description?: string; isEnabled?: string }): RoleTemplateWithCategory {
  const name = template.templateName?.toLowerCase() || '';
  const desc = template.description?.toLowerCase() || '';

  if (name.includes('factory_owner') || name.includes('external') || desc.includes('外发') || desc.includes('外包') || desc.includes('external factory')) {
    return { template, category: 'external_factory', categoryLabel: '外发工厂', categoryColor: 'blue' };
  }

  if (name.includes('supplier') || name.includes('vendor') || desc.includes('供应商') || desc.includes('面辅料') || desc.includes('物料供应商')) {
    return { template, category: 'supplier', categoryLabel: '第三方供应商', categoryColor: 'purple' };
  }

  if (name.includes('admin') || name.includes('manager') || name.includes('supervisor') ||
      name.includes('full_admin') || name.includes('management') ||
      name.includes('operator') || name.includes('merchandiser') ||
      name.includes('leader') || name.includes('组长') || name.includes('主管') ||
      name.includes('管理员') || name.includes('经理') || name.includes('员工')) {
    return { template, category: 'internal', categoryLabel: '内部员工', categoryColor: 'green' };
  }

  return { template, category: 'other', categoryLabel: '其他', categoryColor: 'default' };
}

const RoleCategoryIcon: Record<RoleCategory, React.ReactNode> = {
  internal: <UserOutlined />,
  external_factory: <AppstoreOutlined />,
  supplier: <ShopOutlined />,
  other: <TeamOutlined />,
};

const MODULE_SECTIONS = [
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

const dataScopeLabel = (scope: string | undefined) => {
  const s = String(scope || 'all');
  if (s === 'all') return '全部数据';
  if (s === 'team') return '团队数据';
  return '个人数据';
};

const RoleList: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const roleModal = useModal<Role>();

  // 角色模板选择弹窗
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate | undefined>();

  const [roleList, setRoleList] = useState<RoleRecord[]>([]);
  const [roleUserCounts, setRoleUserCounts] = useState<Record<string, number>>({});
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [activeTab, setActiveTab] = useState<string>('basic');
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

  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<OperationLog[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);

  // 新租户开户向导
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, { params: { page: 1, pageSize: 1000 } });
      const result = response as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) {
        const data = (result.data as { records?: RoleRecord[]; total?: number }) || {};
        const list = Array.isArray(data.records) ? data.records : [];
        setRoleList(list);
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
        } catch { /* ignore */ }
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

  const checkNewTenant = async () => {
    try {
      const res = await roleTemplateApi.checkNewTenant();
      if (res.data?.isNewTenant) {
        setShowSetupGuide(true);
      }
    } catch (e) {
      // 忽略错误
    }
  };

  useEffect(() => {
    // 检测是否为新租户
    checkNewTenant();
  }, []);

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
    if (selectedRole?.id) loadPermTreeAndChecked(String(selectedRole.id));
    else { setPermTree([]); setCheckedPermIds(new Set()); }
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

  const sectionsComputed = useMemo(() => {
    const kw = String(permKeyword || '').trim().toLowerCase();
    const firstCodeLabel = new Map<string, string>();
    const result = MODULE_SECTIONS.map((section) => {
      const items: Array<{ label: string; permNode: PermissionNode | null; sharedWith: string | null; allIds: number[] }> = [];
      for (const item of section.items) {
        const sharedWith = firstCodeLabel.has(item.code) ? firstCodeLabel.get(item.code)! : null;
        if (!firstCodeLabel.has(item.code)) firstCodeLabel.set(item.code, item.label);
        const node = permCodeMap.get(item.code) || null;
        const childIds: number[] = (!sharedWith && node?.children) ? node.children.filter(c => c.id != null).map(c => Number(c.id)) : [];
        const selfId = node?.id != null && !sharedWith ? [Number(node.id)] : [];
        const allIds = [...selfId, ...childIds];
        items.push({ label: item.label, permNode: node, sharedWith, allIds });
      }
      // 本模块统计
      let moduleTotal = 0;
      let moduleChecked = 0;
      for (const it of items) {
        for (const id of it.allIds) {
          moduleTotal++;
          if (checkedPermIds.has(id)) moduleChecked++;
        }
      }
      return { title: section.title, items, moduleTotal, moduleChecked };
    }).filter(s => s.items.length > 0);
    if (!kw) return result;
    return result.filter(s =>
      s.title.toLowerCase().includes(kw) ||
      s.items.some(it => it.label.toLowerCase().includes(kw) || (it.permNode?.children || []).some((c: PermissionNode) => String(c.permissionName || '').toLowerCase().includes(kw)))
    );
  }, [permKeyword, permCodeMap, checkedPermIds]);

  const totalPermCount = useMemo(() => {
    let total = 0;
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        if (n.id != null) total++;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    return total;
  }, [permTree]);

  const savePerms = async () => {
    if (!selectedRole?.id) return;
    openRemarkModal('确认授权', '确认授权', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${selectedRole.id}/permission-ids`, `/auth/role/${selectedRole.id}/permission-ids`, { permissionIds: ids, remark });
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) message.success('授权成功');
        else message.error(String(result.message || '授权失败'));
      } catch { message.error('授权失败'); } finally { setPermSaving(false); }
    });
  };

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

  const handleDeselectAll = () => {
    setCheckedPermIds(new Set());
  };

  const toggleIds = (ids: number[], selected: boolean) => {
    const next = new Set(checkedPermIds);
    if (selected) ids.forEach(id => next.add(id));
    else ids.forEach(id => next.delete(id));
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

  const openDialogWithTemplate = (template: RoleTemplate) => {
    roleModal.open(undefined);
    form.setFieldsValue({
      roleName: '',
      roleCode: '',
      description: template.templateDesc || '',
      status: 'active',
      dataScope: template.permissionRange || 'team',
    });
    // 保存模板ID到表单外部，供后续使用（如apply接口）
    (form as any).__templateId = template.id;
  };

  // 从模板直接创建角色（调用apply接口）
  const handleApplyTemplate = async (template: RoleTemplate) => {
    setTemplateModalOpen(false);
    try {
      const res: any = await api.post('/role-template/apply', {
        templateId: template.id,
        remark: '应用角色模板',
      });
      if (res?.code === 200) {
        message.success('角色创建成功');
        fetchRoles();
      } else {
        message.error(res?.message || '创建失败');
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '创建失败'));
    }
  };

  const closeDialog = () => { roleModal.close(); form.resetFields(); (form as any).__templateId = undefined; };

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
        if (nextPayload?.id) response = await requestWithPathFallback('put', '/system/role', '/auth/role', nextPayload);
        else response = await requestWithPathFallback('post', '/system/role', '/auth/role', nextPayload);
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) { message.success('保存成功'); closeDialog(); fetchRoles(); }
        else message.error(String(result.message || '保存失败'));
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
      if (result.code === 200) setEmployeeList(result.data?.records || []);
      else setEmployeeList([]);
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
          if (res?.code === 200) { message.success('已移除角色'); await handleOpenEmployeeList(); }
          else message.error(res?.message || '移除失败');
        } catch { message.error('移除失败'); }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, modal, message]);

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title); setLogVisible(true); setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) setLogRecords(Array.isArray(result.data) ? (result.data as OperationLog[]) : []);
      else { message.error(String(result.message || '获取日志失败')); setLogRecords([]); }
    } catch (e: unknown) { message.error(getErrorMessage(e, '获取日志失败')); setLogRecords([]); }
    finally { setLogLoading(false); }
  };

  const employeeColumns: ColumnsType<any> = [
    {
      title: '姓名', dataIndex: 'name', key: 'name',
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
      title: '操作', key: 'action', width: 80,
      render: (_: unknown, r: any) => (
        <Button danger size="small" onClick={() => handleRemoveEmployeeFromRole(String(r.id), r.name || r.username)}>移除</Button>
      ),
    },
  ];

  const logColumns: ColumnsType<OperationLog> = [
    { title: '动作', dataIndex: 'action', key: 'action', width: 120, render: (v: string) => v || '-' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120, render: (v: string) => v || '-' },
    { title: '原因', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (v: string) => formatDateTime(v) },
  ];

  // 左侧角色列表渲染
  const renderRoleList = () => (
    <div className="role-list-panel">
      <div className="role-list-header">
        <Text strong>角色列表</Text>
        <Tag color="blue" style={{ marginRight: 0 }}>{roleList.length} 个</Tag>
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
              onClick={() => { setSelectedRole(role); setActiveTab('basic'); }}
            >
              <Avatar
                size={32}
                icon={getRoleIcon(String(role.roleName || ''))}
                style={{
                  backgroundColor: isActive ? 'var(--primary-color, var(--color-primary))' : 'var(--color-fill-tertiary, var(--color-bg-subtle))',
                  color: isActive ? 'var(--color-bg-base)' : 'var(--color-text-secondary, #666)',
                  flexShrink: 0,
                }}
              />
              <div className="role-list-item-content">
                <div className="role-list-item-top">
                  <Text strong ellipsis style={{ maxWidth: 140 }}>{role.roleName}</Text>
                  {role.status !== 'active' && <Tag color="default" style={{ fontSize: 10, padding: '0 4px', marginRight: 0 }}>停用</Tag>}
                </div>
                <Space size={4} wrap style={{ marginTop: 2 }}>
                  <Tag color={categoryInfo.categoryColor} style={{ fontSize: 10, padding: '0 6px', marginRight: 0 }}>
                    {categoryInfo.categoryLabel}
                  </Tag>
                  <Tag color="cyan" style={{ fontSize: 10, padding: '0 6px', marginRight: 0 }}>
                    {userCount} 人
                  </Tag>
                </Space>
              </div>
            </div>
          );
        })}
        {roleList.length === 0 && <Empty description="暂无角色" style={{ padding: '40px 0' }} />}
      </div>
    </div>
  );

  // 顶部角色信息条
  const renderRoleHeader = () => {
    if (!selectedRole) return null;
    const categoryInfo = getRoleCategory({ templateName: selectedRole.roleCode, description: selectedRole.description, isEnabled: selectedRole.status === 'active' } as any);
    const userCount = roleUserCounts[String(selectedRole.id)] || 0;
    return (
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Avatar
              size={40}
              icon={getRoleIcon(String(selectedRole.roleName || ''))}
              style={{ backgroundColor: 'var(--primary-color, var(--color-primary))', color: 'var(--color-bg-base)' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: 16 }}>{selectedRole.roleName}</Text>
                <Tag color="blue" style={{ fontSize: 11, padding: '0 6px', marginRight: 0 }}>{selectedRole.roleCode}</Tag>
                <Tag icon={RoleCategoryIcon[categoryInfo.category]} color={categoryInfo.categoryColor} style={{ fontSize: 11, padding: '0 6px', marginRight: 0 }}>{categoryInfo.categoryLabel}</Tag>
                <Tag color={selectedRole.status === 'active' ? 'green' : 'default'} style={{ fontSize: 11, padding: '0 6px', marginRight: 0 }}>
                  {selectedRole.status === 'active' ? '启用' : '停用'}
                </Tag>
              </div>
              {selectedRole.description && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{selectedRole.description}</Text>
              )}
            </div>
          </div>
          <Space wrap size={8}>
            <Tooltip title="查看此角色的员工">
              <Button icon={<TeamOutlined />} onClick={handleOpenEmployeeList}>员工 {userCount} 人</Button>
            </Tooltip>
            <Button ghost onClick={() => openDialog(selectedRole as any)}>编辑</Button>
            <Button ghost onClick={() => openLogModal('role', String(selectedRole.id || ''), `角色 ${selectedRole.roleName} 操作日志`)}>日志</Button>
            <Button ghost danger onClick={() => handleDelete(selectedRole.id)}>删除</Button>
          </Space>
        </div>
      </Card>
    );
  };

  // 基本信息 Tab
  const renderBasicTab = () => {
    if (!selectedRole) return null;
    const userCount = roleUserCounts[String(selectedRole.id)] || 0;
    return (
      <div style={{ maxWidth: 720 }}>
        <Row gutter={12}>
          <Col xs={12} sm={8}>
            <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>使用此角色</Text>
                <Text strong style={{ fontSize: 18, color: 'var(--primary-color, var(--color-primary))' }}>{userCount}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>位员工</Text>
            </Card>
          </Col>
          <Col xs={12} sm={8}>
            <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>已选权限</Text>
                <Text strong style={{ fontSize: 18, color: 'var(--color-success, var(--color-success))' }}>{checkedPermIds.size}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>项</Text>
            </Card>
          </Col>
          <Col xs={12} sm={8}>
            <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>数据范围</Text>
                <Text strong style={{ fontSize: 18, color: 'var(--color-warning, var(--color-warning))' }}>{dataScopeLabel(selectedRole.dataScope as string).replace('数据', '')}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>数据权限</Text>
            </Card>
          </Col>
        </Row>

        <Card size="small" title={<Text strong style={{ fontSize: 13 }}>角色属性</Text>} style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>角色编码</Text>
              <Text style={{ fontSize: 13 }}>{selectedRole.roleCode || '-'}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>状态</Text>
              <Tag color={selectedRole.status === 'active' ? 'green' : 'default'} style={{ fontSize: 11 }}>
                {selectedRole.status === 'active' ? '启用' : '停用'}
              </Tag>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>数据权限范围</Text>
              <Text style={{ fontSize: 13 }}>{dataScopeLabel(selectedRole.dataScope as string)}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>创建时间</Text>
              <Text style={{ fontSize: 13 }}>{formatDateTime((selectedRole as any).createTime) || '-'}</Text>
            </div>
          </div>
          {selectedRole.description && (
            <>
              <div style={{ height: 1, backgroundColor: 'var(--color-border-light, var(--color-border-light))', margin: '12px 0' }} />
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>描述</Text>
                <Text style={{ fontSize: 13, lineHeight: 1.7 }}>{selectedRole.description}</Text>
              </div>
            </>
          )}
        </Card>
      </div>
    );
  };

  // 权限配置 Tab
  const renderPermTab = () => {
    if (!selectedRole) return null;
    if (permLoading) return <div style={{ padding: '48px 0', textAlign: 'center' }}><Spin size="large" tip="加载权限中..." /></div>;
    if (!sectionsComputed.length) return <Empty description="暂无可配置权限" style={{ padding: '48px 0' }} />;

    return (
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Card size="small" style={{ marginBottom: 12, flexShrink: 0 }} styles={{ body: { padding: '10px 16px' } }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap size={8}>
              <Button type="primary" icon={<CheckSquareOutlined />} onClick={handleSelectAll}>一键全选</Button>
              <Button icon={<BorderOutlined />} onClick={handleDeselectAll}>一键取消</Button>
              <Input
                value={permKeyword}
                onChange={(e) => setPermKeyword(e.target.value)}
                placeholder="搜索权限名称"
                style={{ width: 200 }}
                allowClear
              />
            </Space>
            <Space size={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已选 <Text strong style={{ color: 'var(--primary-color, var(--color-primary))', fontSize: 14 }}>{checkedPermIds.size}</Text> / {totalPermCount} 项
              </Text>
              <Button icon={<ReloadOutlined />} onClick={() => selectedRole?.id && loadPermTreeAndChecked(String(selectedRole.id))} loading={permLoading}>刷新</Button>
              <Button type="primary" ghost onClick={savePerms} loading={permSaving}>保存权限</Button>
            </Space>
          </div>
        </Card>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
          <Row gutter={12}>
          {sectionsComputed.map((section, si) => {
            const moduleAllIds = section.items.flatMap(it => it.allIds);
            const moduleTotal = moduleAllIds.length;
            const moduleChecked = moduleAllIds.filter(id => checkedPermIds.has(id)).length;
            const moduleAllSelected = moduleTotal > 0 && moduleChecked === moduleTotal;

            return (
              <Col xs={24} sm={24} md={12} lg={8} xl={8} key={si} style={{ marginBottom: 12 }}>
                <Card
                  size="small"
                  title={
                    <Space size={8}>
                      <Text strong style={{ fontSize: 13 }}>{section.title}</Text>
                      {moduleTotal > 0 && (
                        <Tag
                          color={moduleAllSelected ? 'green' : moduleChecked > 0 ? 'blue' : 'default'}
                          style={{ fontSize: 11, padding: '0 8px', marginRight: 0 }}
                        >
                          {moduleChecked}/{moduleTotal}
                        </Tag>
                      )}
                    </Space>
                  }
                  extra={
                    moduleTotal > 0 ? (
                      <Tooltip title={moduleAllSelected ? '取消本模块所有权限' : '开通本模块全部权限'}>
                        <Checkbox
                          checked={moduleAllSelected}
                          onChange={(e) => toggleIds(moduleAllIds, e.target.checked)}
                        >
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>全选</span>
                        </Checkbox>
                      </Tooltip>
                    ) : null
                  }
                  styles={{ body: { padding: '8px 16px' } }}
                  style={{ height: '100%' }}
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    {section.items.map((item, ii) => {
                      const hasNode = item.permNode?.id != null && !item.sharedWith;
                      const childNodes = hasNode ? ((item.permNode as PermissionNode)?.children || []) as PermissionNode[] : [];
                      const selfIds = item.allIds;
                      const itemAllSelected = selfIds.length > 0 && selfIds.every(id => checkedPermIds.has(id));
                      const itemSomeSelected = selfIds.some(id => checkedPermIds.has(id));

                      return (
                        <div
                          key={`${si}-${item.label}`}
                          style={{
                            padding: '8px 4px',
                            borderBottom: ii < section.items.length - 1 ? '1px solid var(--color-border-light, var(--color-border-light))' : 'none',
                          }}
                        >
                          {hasNode ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              <Checkbox
                                checked={itemAllSelected}
                                indeterminate={!itemAllSelected && itemSomeSelected}
                                onChange={(e) => toggleIds(selfIds, e.target.checked)}
                              >
                                <Text style={{ fontSize: 13 }}>{item.label}</Text>
                              </Checkbox>
                            </div>
                          ) : (
                            <div style={{ paddingLeft: 4 }}>
                              <Text style={{ fontSize: 13 }}>{item.label}</Text>
                              {item.sharedWith && (
                                <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>（同「{item.sharedWith}」）</Text>
                              )}
                            </div>
                          )}
                          {hasNode && childNodes.length > 0 && (
                            <div style={{ paddingLeft: 28, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
                              {childNodes.map(btn => (
                                <Checkbox
                                  key={btn.id}
                                  checked={checkedPermIds.has(Number(btn.id))}
                                  onChange={(e) => toggleIds([Number(btn.id)], e.target.checked)}
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
        </div>
      </div>
    );
  };

  const rightPanel = () => {
    if (!selectedRole) {
      return (
        <Empty
          description={
            <div style={{ textAlign: 'center' }}>
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>请选择一个角色</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>从左侧角色列表中选择，查看或编辑它的基本信息和权限配置</Text>
            </div>
          }
          style={{ padding: '80px 0' }}
        />
      );
    }
    return (
      <>
        {renderRoleHeader()}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          items={[
            { key: 'basic', label: <Space size={4}><UnorderedListOutlined />基本信息</Space>, children: renderBasicTab() },
            { key: 'perm', label: <Space size={4}><CheckSquareOutlined />权限配置</Space>, children: renderPermTab() },
          ]}
        />
      </>
    );
  };

  return (
    <>
      <PageLayout
        title="岗位管理"
        titleExtra={
          <Space>
            <Button type="primary" ghost onClick={() => setTemplateModalOpen(true)}>从模板创建</Button>
            <Button type="primary" ghost onClick={() => openDialog()}>空模板创建</Button>
          </Space>
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
          {renderRoleList()}
          <div className="role-perm-panel">
            {rightPanel()}
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

      {/* 角色模板选择弹窗 */}
      <Modal
        title="选择角色模板"
        open={templateModalOpen}
        onCancel={() => { setTemplateModalOpen(false); setSelectedTemplate(undefined); }}
        footer={[
          <Button key="cancel" onClick={() => { setTemplateModalOpen(false); setSelectedTemplate(undefined); }}>取消</Button>,
          <Button key="apply" type="primary" disabled={!selectedTemplate} onClick={() => {
            if (selectedTemplate) {
              handleApplyTemplate(selectedTemplate);
            }
          }}>应用模板创建角色</Button>,
        ]}
        width={720}
        destroyOnClose
      >
        <RoleTemplateSelector
          value={selectedTemplate?.id}
          onChange={(id, template) => setSelectedTemplate(template)}
        />
        {selectedTemplate && (
          <Alert
            message="提示"
            description={`已选择「${selectedTemplate.templateName}」模板。点击「下一步：编辑角色」继续创建角色，权限配置可在创建后编辑。`}
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Modal>

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
