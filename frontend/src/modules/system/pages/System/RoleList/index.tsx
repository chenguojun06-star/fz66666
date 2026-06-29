import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { Alert, App, Avatar, Button, Card, Checkbox, Dropdown, Empty, Form, Input, Modal, Select, Space, Spin, Tag, Tooltip, Typography, message } from 'antd';
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
  UserOutlined, TeamOutlined,
  EditOutlined, FileTextOutlined,
  CrownOutlined, UserSwitchOutlined,
  ShoppingOutlined, FileOutlined, BarChartOutlined,
  ToolOutlined, ContainerOutlined, HomeOutlined,
  DollarOutlined, AuditOutlined,
  CarOutlined, ShopOutlined, AppstoreOutlined,
  DeleteOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

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
  '管理员': <TeamOutlined />,
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

  // 角色模板选择弹窗
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate | undefined>();

  const [roleList, setRoleList] = useState<RoleRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showSystemGuard = useMemo(() => isSmartFeatureEnabled('smart.system.guard.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => { if (!showSmartErrorNotice) return; setSmartError({ title, reason, code }); };

  const [permTree, setPermTree] = useState<PermissionNode[]>([]);
  const [checkedPermIds, setCheckedPermIds] = useState<Set<number>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  // 权限搜索词（原始值，用于即时显示）
  const [permKeywordInput, setPermKeywordInput] = useState('');
  // 防抖后的搜索词
  const permKeyword = useDebouncedValue(permKeywordInput, 200);
  // 当前编辑的职位名称（截图风格：顶部直接编辑）
  const [editingRoleName, setEditingRoleName] = useState('');

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

  // 角色切换时加载权限树（带防抖，防止快速切换）
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

  // 防抖后的角色ID
  const [debouncedRoleId, setDebouncedRoleId] = useState<string | null>(null);
  const roleIdDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // 角色切换时延迟加载权限树
  const handleRoleSelect = useCallback((role: RoleRecord | null) => {
    setSelectedRole(role);
    setEditingRoleName(role?.roleName || '');
    if (roleIdDebounceTimer.current) clearTimeout(roleIdDebounceTimer.current);
    if (role?.id) {
      roleIdDebounceTimer.current = setTimeout(() => {
        setDebouncedRoleId(String(role.id));
      }, 150); // 150ms防抖
    } else {
      setDebouncedRoleId(null);
      setPermTree([]); setCheckedPermIds(new Set());
    }
  }, []);

  useEffect(() => {
    if (debouncedRoleId) loadPermTreeAndChecked(debouncedRoleId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRoleId]);

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
    openRemarkModal('确认保存', '确认保存', undefined, async (remark) => {
      setPermSaving(true);
      try {
        // 1. 先保存职位名称（截图风格：顶部输入框直接编辑）
        const nameChanged = editingRoleName.trim() !== '' && editingRoleName.trim() !== selectedRole.roleName;
        if (nameChanged) {
          const rolePayload = { ...selectedRole, roleName: editingRoleName.trim(), operationRemark: remark };
          const roleRes = await requestWithPathFallback('put', '/system/role', '/auth/role', rolePayload);
          const roleResult = roleRes as { code?: number; message?: unknown };
          if (roleResult.code !== 200) {
            message.error(String(roleResult.message || '保存职位名称失败'));
            return;
          }
          setSelectedRole(prev => prev ? { ...prev, roleName: editingRoleName.trim() } : prev);
          setRoleList(prev => prev.map(r => r.id === selectedRole.id ? { ...r, roleName: editingRoleName.trim() } : r));
        }
        // 2. 保存权限
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${selectedRole.id}/permission-ids`, `/auth/role/${selectedRole.id}/permission-ids`, { permissionIds: ids, remark });
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) {
          message.success('保存成功');
        } else message.error(String(result.message || '保存权限失败'));
      } catch { message.error('保存失败'); } finally { setPermSaving(false); }
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
      // 使用动态pageSize，确保能获取所有用户
      const res = await api.get('/system/user/list', { params: { roleId: selectedRole.id, page: 1, pageSize: 9999 } });
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

  // 左侧角色列表渲染（截图风格：图标+名称+编辑删除）
  const renderRoleList = () => (
    <div className="role-list-panel">
      <div className="role-list-header">
        <Text strong>职位</Text>
        <Dropdown
          menu={{
            items: [
              { key: 'create', label: '新建职位', onClick: () => openDialog() },
              { key: 'template', label: '从模板创建', onClick: () => setTemplateModalOpen(true) },
            ],
          }}
          placement="bottomRight"
        >
          <Button type="primary" size="small">添加</Button>
        </Dropdown>
      </div>
      <div className="role-list-items">
        {roleList.map(role => {
          const isActive = String(role.id) === String(selectedRole?.id);
          return (
            <div
              key={String(role.id || role.roleCode)}
              className={`role-list-item${isActive ? ' role-list-item-active' : ''}`}
              onClick={() => { handleRoleSelect(role); }}
            >
              <span className="role-list-item-icon" style={{ color: isActive ? '#cf1322' : 'var(--color-text-secondary, #666)' }}>
                {getRoleIcon(String(role.roleName || ''))}
              </span>
              <span className="role-list-item-name">{role.roleName}</span>
              <span className="role-list-item-actions" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined style={{ fontSize: 12 }} />}
                  style={{ color: isActive ? '#cf1322' : 'var(--color-text-secondary, #666)' }}
                  onClick={() => openDialog(role as any)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  style={{ color: isActive ? '#cf1322' : 'var(--color-text-secondary, #666)' }}
                  onClick={() => handleDelete(role.id)}
                />
              </span>
            </div>
          );
        })}
        {roleList.length === 0 && <Empty description="暂无角色" style={{ padding: '40px 0' }} />}
      </div>
    </div>
  );

  // 权限配置 Tab（截图风格：大容器 + 全局全选 + 模块分组平铺网格）
  const renderPermTab = () => {
    if (!selectedRole) return null;
    if (permLoading) return <div style={{ padding: '48px 0', textAlign: 'center' }}><Spin size="large" tip="加载权限中..." /></div>;
    if (!sectionsComputed.length) return <Empty description="暂无可配置权限" style={{ padding: '48px 0' }} />;

    const allIds = sectionsComputed.flatMap(s => s.items.flatMap(it => it.allIds));
    const allChecked = allIds.length > 0 && allIds.every(id => checkedPermIds.has(id));
    const someChecked = allIds.some(id => checkedPermIds.has(id));

    return (
      <div className="perm-matrix-container">
        <div className="perm-matrix-global-header">
          <Checkbox
            checked={allChecked}
            indeterminate={!allChecked && someChecked}
            onChange={(e) => toggleIds(allIds, e.target.checked)}
          >
            全选
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
            已选 <Text strong style={{ color: 'var(--primary-color, var(--color-primary))' }}>{checkedPermIds.size}</Text> / {totalPermCount} 项
          </Text>
          <Input
            value={permKeywordInput}
            onChange={(e) => setPermKeywordInput(e.target.value)}
            placeholder="搜索权限名称"
            style={{ width: 200, marginLeft: 'auto' }}
            allowClear
          />
        </div>
        {sectionsComputed.map((section) => {
          const sectionIds = section.items.flatMap(it => it.allIds);
          const sectionAll = sectionIds.length > 0 && sectionIds.every(id => checkedPermIds.has(id));
          const sectionSome = sectionIds.some(id => checkedPermIds.has(id));
          const singleItem = section.items.length === 1 ? section.items[0] : null;
          const hasPrefix = !!singleItem && singleItem.label !== section.title && !singleItem.sharedWith;

          return (
            <div key={section.title} className="perm-matrix-section">
              <div className="perm-matrix-section-header">
                <Checkbox
                  checked={sectionAll}
                  indeterminate={!sectionAll && sectionSome}
                  onChange={(e) => toggleIds(sectionIds, e.target.checked)}
                >
                  {section.title}
                </Checkbox>
              </div>
              <div className={`perm-matrix-section-body ${hasPrefix ? 'has-prefix' : ''}`}>
                {hasPrefix && <span className="perm-matrix-section-prefix">{singleItem.label}：</span>}
                {section.items.map((item) => {
                  if (!item.permNode || item.sharedWith) return null;
                  const nodes = [item.permNode, ...(item.permNode.children || [])].filter(n => n.id != null);
                  return nodes.map((n) => (
                    <span key={String(n.id)} className="perm-matrix-item">
                      <Checkbox
                        checked={checkedPermIds.has(Number(n.id))}
                        onChange={(e) => toggleIds([Number(n.id)], e.target.checked)}
                      >
                        {n.permissionName}
                      </Checkbox>
                    </span>
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const rightPanel = () => {
    if (!selectedRole) {
      return (
        <Empty
          description={
            <div style={{ textAlign: 'center' }}>
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>请选择一个职位</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>从左侧职位列表中选择，查看或编辑它的权限配置</Text>
            </div>
          }
          style={{ padding: '80px 0' }}
        />
      );
    }
    return (
      <>
        <div className="role-perm-title">该职位拥有的权限</div>
        <div className="role-perm-formbar">
          <div className="role-perm-formbar-left">
            <label className="role-perm-required-label">职位名称</label>
            <Input
              value={editingRoleName}
              onChange={(e) => setEditingRoleName(e.target.value)}
              placeholder="请输入职位名称"
              style={{ width: 220 }}
            />
            <Button type="link" onClick={handleOpenEmployeeList}>配置员工</Button>
          </div>
          <Button type="primary" onClick={savePerms} loading={permSaving}>保存权限</Button>
        </div>
        {renderPermTab()}
      </>
    );
  };

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
