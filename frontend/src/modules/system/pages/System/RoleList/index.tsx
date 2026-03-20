import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Alert, App, Button, Card, Checkbox, Form, Input, Select, Space, Tag } from 'antd';
import type { ButtonProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import { Role, RoleQueryParams } from '@/types/system';
import { getErrorMessage } from '@/types/api';
import api, { requestWithPathFallback } from '@/utils/api';
import { organizationApi } from '@/services/system/organizationApi';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import './styles.css';
import { readPageSize } from '@/utils/pageSizeStore';

// 平台超管专属权限码，不在租户角色授权弹窗中展示
const EXCLUDED_TOP_MODULE_CODES = new Set(['MENU_TENANT_APP_VIEW']);
const EXCLUDED_SUBGROUP_CODES = new Set(['MENU_TENANT', 'MENU_TENANT_APP']);

const RoleList: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const roleModal = useModal<Role>();
  const permModal = useModal();
  const [queryParams, setQueryParams] = useState<RoleQueryParams>({
    page: 1,
    pageSize: readPageSize(10)
  });

  type RoleRecord = Role & Record<string, unknown>;

  const [roleList, setRoleList] = useState<RoleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showSystemGuard = useMemo(() => isSmartFeatureEnabled('smart.system.guard.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };
  const [brandOptions, setBrandOptions] = useState<{ label: string; value: string }[]>([]);
  const [deptOptions, setDeptOptions] = useState<{ label: string; value: string }[]>([]);

  type PermissionNode = {
    id?: number | string;
    parentId?: number;
    permissionCode?: string;
    permissionName?: string;
    permissionType?: string;
    children?: PermissionNode[];
  };

  type PermissionItem = {
    id: number;
    name?: string;
    type?: string;
  };

  type OperationLog = {
    id?: number | string;
    bizType?: string;
    bizId?: string;
    action?: string;
    operator?: string;
    remark?: string;
    createTime?: string;
  };

  const [permTree, setPermTree] = useState<PermissionNode[]>([]);
  const [checkedPermIds, setCheckedPermIds] = useState<Set<number>>(new Set());
  const [permKeyword, setPermKeyword] = useState('');
  const [permSaving, setPermSaving] = useState(false);
  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<OperationLog[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const collectSubtreeIds = useCallback((node: PermissionNode | undefined, into: Set<number>) => {
    if (!node) return;
    const id = Number(node.id);
    if (Number.isFinite(id)) into.add(id);
    const children = Array.isArray(node.children) ? node.children : [];
    for (const c of children) collectSubtreeIds(c, into);
  }, []);

  const findFirstNode = useCallback((nodes: PermissionNode[], predicate: (n: PermissionNode) => boolean): PermissionNode | null => {
    const stack = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) {
      const n = stack.shift();
      if (!n) continue;
      if (predicate(n)) return n;
      const children = Array.isArray(n.children) ? n.children : [];
      for (const c of children) stack.push(c);
    }
    return null;
  }, []);

  const getSubtreeIdSetByCodeOrName = useCallback((code: string, name: string) => {
    const hit =
      findFirstNode(permTree, (n) => String(n.permissionCode || '').trim() === code)
      || findFirstNode(permTree, (n) => String(n.permissionName || '').trim() === name);
    const set = new Set<number>();
    if (hit) collectSubtreeIds(hit, set);
    return set;
  }, [collectSubtreeIds, findFirstNode, permTree]);

  const allPermissionIds = useMemo(() => {
    const set = new Set<number>();
    for (const n of Array.isArray(permTree) ? permTree : []) collectSubtreeIds(n, set);
    return set;
  }, [collectSubtreeIds, permTree]);

  const templatePresets = useMemo(() => {
    const dashboard = getSubtreeIdSetByCodeOrName('MENU_DASHBOARD', '仪表盘');
    const basic = getSubtreeIdSetByCodeOrName('MENU_BASIC', '基础资料');
    const production = getSubtreeIdSetByCodeOrName('MENU_PRODUCTION', '生产管理');
    const finance = getSubtreeIdSetByCodeOrName('MENU_FINANCE', '财务管理');
    const system = getSubtreeIdSetByCodeOrName('MENU_SYSTEM', '系统设置');

    const union = (...sets: Set<number>[]) => {
      const next = new Set<number>();
      for (const s of sets) for (const v of s) next.add(v);
      return next;
    };

    return [
      { key: 'admin', label: '系统管理员(全量)', ids: allPermissionIds },
      { key: 'production', label: '生产人员', ids: union(dashboard, basic, production) },
      { key: 'finance', label: '财务人员', ids: union(dashboard, basic, finance) },
      { key: 'user', label: '普通用户', ids: union(dashboard, basic) },
      { key: 'system', label: '系统设置', ids: union(dashboard, system) },
    ].map((t) => ({ ...t, count: t.ids.size }));
  }, [allPermissionIds, getSubtreeIdSetByCodeOrName]);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, { params: queryParams });
      const result = response as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) {
        const data = (result.data as { records?: RoleRecord[]; total?: number }) || {};
        setRoleList(Array.isArray(data.records) ? data.records : []);
        setTotal(Number(data.total || 0));
        if (showSmartErrorNotice) setSmartError(null);
        return;
      }
      reportSmartError('角色列表加载失败', String(result.message || '服务返回异常，请稍后重试'), 'SYSTEM_ROLE_LIST_FAILED');
      message.error(String(result.message || '获取角色列表失败'));
    } catch (error) {
      reportSmartError('角色列表加载失败', getErrorMessage(error, '网络异常或服务不可用，请稍后重试'), 'SYSTEM_ROLE_LIST_EXCEPTION');
      message.error(getErrorMessage(error, '获取角色列表失败'));
    }
  }, [message, queryParams, showSmartErrorNotice]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    const fetchDict = async (type: string) => {
      try {
        const res = await api.get<{ code: number; data: { records: Array<{ dictLabel: string; dictCode: string }> } }>('/system/dict/list', { params: { page: 1, pageSize: 1000, dictType: type } });
        if (res.code === 200) {
          const items = res.data.records || [];
          return items.map((it) => ({ label: it.dictLabel, value: it.dictCode }));
        }
      } catch (error) {
        console.error('[角色管理] 获取字典数据失败:', error);
      }
      return [];
    };
    (async () => {
      const brands = await fetchDict('brand');
      setBrandOptions(brands);
      // 部门选项来自组织架构树（t_organization_unit DEPARTMENT 节点）
      try {
        const units = await organizationApi.departments();
        setDeptOptions(
          (Array.isArray(units) ? units : []).map((u) => ({
            label: String(u.unitName || u.nodeName || ''),
            value: String(u.id || ''),
          }))
        );
      } catch (e) {
        console.error('[角色管理] 获取部门列表失败:', e);
      }
    })();
  }, []);

  const openDialog = (role?: Role) => {
    roleModal.open(role || null);
    form.setFieldsValue({
      roleName: String(role?.roleName || ''),
      roleCode: String(role?.roleCode || ''),
      description: String(role?.description || ''),
      status: role?.status || 'active',
      dataScope: role?.dataScope || 'all',
      dataScopeBrands: Array.isArray(role?.dataScopeBrands) ? role?.dataScopeBrands : [],
      dataScopeDepartments: Array.isArray(role?.dataScopeDepartments) ? role?.dataScopeDepartments : [],
    });
  };

  const closeDialog = () => {
    roleModal.close();
    form.resetFields();
  };

  type RemarkModalState = {
    open: boolean;
    title: string;
    okText: string;
    okDanger: boolean;
    onConfirm: (remark: string) => Promise<void>;
  };
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);

  const openRemarkModal = (
    title: string,
    okText: string,
    okButtonProps: ButtonProps | undefined,
    onConfirm: (remark: string) => Promise<void>
  ) => {
    setRemarkModalState({
      open: true,
      title,
      okText,
      okDanger: okButtonProps?.danger === true,
      onConfirm,
    });
  };

  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try {
      await remarkModalState.onConfirm(remark);
      setRemarkModalState(null);
    } catch {
      // error already shown inside onConfirm
    } finally {
      setRemarkLoading(false);
    }
  };

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title);
    setLogVisible(true);
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', {
        params: { bizType, bizId },
      });
      const result = res as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) {
        setLogRecords(Array.isArray(result.data) ? (result.data as OperationLog[]) : []);
      } else {
        message.error(String(result.message || '获取日志失败'));
        setLogRecords([]);
      }
    } catch (e: any) {
      message.error(getErrorMessage(e, '获取日志失败'));
      setLogRecords([]);
    } finally {
      setLogLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const currentRole = roleModal.data;
      const payload: Role = {
        ...(currentRole || ({} as any)),
        ...values,
        status: (values as any)?.status || 'active',
        dataScope: (values as any)?.dataScope || 'all',
        dataScopeBrands: Array.isArray((values as any)?.dataScopeBrands) ? (values as any).dataScopeBrands : [],
        dataScopeDepartments: Array.isArray((values as any)?.dataScopeDepartments) ? (values as any).dataScopeDepartments : [],
      };

      const submit = async (remark?: string) => {
        const nextPayload = {
          ...payload,
          operationRemark: remark,
        };
        let response;
        if (nextPayload?.id) {
          response = await requestWithPathFallback('put', '/system/role', '/auth/role', nextPayload);
        } else {
          response = await requestWithPathFallback('post', '/system/role', '/auth/role', nextPayload);
        }
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) {
          message.success('保存成功');
          closeDialog();
          fetchRoles();
        } else {
          message.error(String(result.message || '保存失败'));
        }
      };

      if (payload?.id) {
        openRemarkModal('确认保存', '确认保存', undefined, submit);
        return;
      }

      await submit();
    } catch (error: any) {
      message.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (id?: string | number) => {
    const rid = String(id ?? '').trim();
    if (!rid) return;
    openRemarkModal('确认删除', '删除', { danger: true }, async (remark) => {
      try {
        const response = await requestWithPathFallback(
          'delete',
          `/system/role/${rid}`,
          `/auth/role/${rid}`,
          undefined,
          { params: { remark } }
        );
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) {
          message.success('删除成功');
          fetchRoles();
          return;
        }
        throw new Error(String(result.message || '删除失败'));
      } catch (error: any) {
        message.error(getErrorMessage(error, '删除失败'));
        throw error;
      }
    });
  };

  const openPermDialog = async (role: Role) => {
    roleModal.setModalData(role);
    try {
      const treeRes = await requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree');
      const idsRes = await requestWithPathFallback('get', `/system/role/${role.id}/permission-ids`, `/auth/role/${role.id}/permission-ids`);
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
      if (treeResult.code === 200) {
        setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []);
      } else {
        setPermTree([]);
      }
      const idList = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setCheckedPermIds(new Set(idList.map((id: any) => Number(id))));
      permModal.open();
    } catch (e) {
      message.error('加载权限失败');
    }
  };

  const closePermDialog = () => {
    permModal.close();
    setPermTree([]);
    setCheckedPermIds(new Set());
    setPermKeyword('');
  };

  const applyTemplate = (ids: Set<number>) => {
    setPermKeyword('');
    setCheckedPermIds(new Set(ids));
  };

  // 按模块分组所有权限（菜单+按钮）
  const permissionsByModule = useMemo(() => {
    const kw = String(permKeyword || '').trim().toLowerCase();
    const allModules = (permTree || [])
      .filter((topNode: PermissionNode) => !EXCLUDED_TOP_MODULE_CODES.has(String(topNode.permissionCode || '').trim()))
      .map((topNode: PermissionNode) => {
      const groups: Array<{ groupId: number; groupName: string; buttons: PermissionItem[] }> = [];
      const directButtons: PermissionItem[] = [];
      for (const child of (topNode.children || [])) {
        const childCode = String(child.permissionCode || '').trim();
        if (EXCLUDED_SUBGROUP_CODES.has(childCode)) continue;
        const cType = String(child.permissionType || '').toLowerCase();
        const childId = Number(child.id);
        if (cType === 'menu') {
          const btns: PermissionItem[] = (child.children || []).map((btn: PermissionNode) => ({
            id: Number(btn.id),
            name: btn.permissionName,
            type: btn.permissionType,
          }));
          groups.push({ groupId: childId, groupName: String(child.permissionName || ''), buttons: btns });
        } else {
          directButtons.push({ id: childId, name: child.permissionName, type: child.permissionType });
        }
      }
      return {
        moduleId: Number(topNode.id),
        moduleName: String(topNode.permissionName || ''),
        groups,
        directButtons,
      };
    });
    if (!kw) return allModules;
    return allModules.filter(m =>
      m.moduleName.toLowerCase().includes(kw) ||
      m.groups.some(g => g.groupName.toLowerCase().includes(kw) || g.buttons.some(b => String(b.name || '').toLowerCase().includes(kw))) ||
      m.directButtons.some(b => String(b.name || '').toLowerCase().includes(kw))
    );
  }, [permKeyword, permTree]);

  const savePerms = async () => {
    if (!roleModal.data?.id) return;
    openRemarkModal('确认授权', '确认授权', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback(
          'put',
          `/system/role/${roleModal.data.id}/permission-ids`,
          `/auth/role/${roleModal.data.id}/permission-ids`,
          { permissionIds: ids, remark }
        );
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) {
          message.success('授权成功');
          closePermDialog();
        } else {
          message.error(String(result.message || '授权失败'));
        }
      } catch (e) {
        message.error('授权失败');
      } finally {
        setPermSaving(false);
      }
    });
  };

  const getStatusText = (status: string) => {
    return status === 'active' ? '启用' : '停用';
  };

  const logColumns: ColumnsType<OperationLog> = [
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '原因',
      dataIndex: 'remark',
      key: 'remark',
      render: (v: string) => v || '-',
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
  ];

  const columns: ColumnsType<RoleRecord> = [
    { title: '角色名称', dataIndex: 'roleName', key: 'roleName', width: 160 },
    { title: '角色编码', dataIndex: 'roleCode', key: 'roleCode', width: 160 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: unknown) => {
        const status = String(v || '').trim() || 'inactive';
        return <Tag color={status === 'active' ? 'green' : 'red'}>{getStatusText(status)}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: unknown) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: unknown, role: Role) => (
        <RowActions
          className="table-actions"
          maxInline={2}
          actions={[
            {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              onClick: () => openDialog(role),
              primary: true,
            },
            {
              key: 'perm',
              label: '权限授权',
              title: '权限授权',
              onClick: () => openPermDialog(role),
              primary: true,
            },
            {
              key: 'log',
              label: '日志',
              title: '日志',
              onClick: () => openLogModal('role', String(role.id || ''), `角色 ${role.roleName} 操作日志`),
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
              danger: true,
              onClick: () => handleDelete(role.id),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
        <Card className="page-card">
          {showSmartErrorNotice && smartError ? (
            <Card size="small" style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={fetchRoles} />
            </Card>
          ) : null}
          {showSystemGuard && roleList.length > 0 && (() => {
            const broadRoles = roleList.filter(
              (r) => String(r.status || 'active') === 'active' && String(r.dataScope || '') === 'all'
            );
            if (broadRoles.length === 0) return null;
            return (
              <Alert
                style={{ marginBottom: 12 }}
                type="warning"
                showIcon
                icon={<span>🛡️</span>}
                message="权限防呆检测"
                description={
                  <span>
                    当前有 <strong>{broadRoles.length}</strong> 个启用角色使用“全部数据”范围（
                    {broadRoles.slice(0, 3).map((r) => String(r.roleName || r.roleCode)).join('、')}{broadRoles.length > 3 ? '等' : ''}
                    ），建议审查是否需要半等权限范围，防止越权操作。
                  </span>
                }
                banner={false}
              />
            );
          })()}
          <div className="page-header">
            <h2 className="page-title">岗位管理</h2>
            <Button type="primary" onClick={() => openDialog()}>
              新增角色
            </Button>
          </div>

          <Card size="small" className="filter-card mb-sm">
            <Space wrap>
              <Input
                placeholder="角色名称"
                style={{ width: 220 }}
                allowClear
                value={String(queryParams.roleName || '')}
                onChange={(e) => setQueryParams((prev) => ({ ...prev, roleName: e.target.value, page: 1 }))}
              />
              <Input
                placeholder="角色编码"
                style={{ width: 220 }}
                allowClear
                value={String(queryParams.roleCode || '')}
                onChange={(e) => setQueryParams((prev) => ({ ...prev, roleCode: e.target.value, page: 1 }))}
              />
              <Button type="primary" onClick={fetchRoles}>
                查询
              </Button>
              <Button
                onClick={() =>
                  setQueryParams((prev) => ({
                    page: 1,
                    pageSize: prev.pageSize,
                    roleName: '',
                    roleCode: '',
                  }))
                }
              >
                重置
              </Button>
            </Space>
          </Card>

          <div className="table-section">
            <ResizableTable<RoleRecord>
              storageKey="system-role-table"
              rowKey={(r) => String(r.id || r.roleCode)}
              columns={columns}
              dataSource={roleList}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (t) => `共 ${t} 条`,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 'max-content' }}
            />
          </div>
        </Card>

      <ResizableModal
        open={roleModal.visible}
        title={roleModal.data ? '编辑角色' : '新增角色'}
        onCancel={closeDialog}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={modalWidth}
        initialHeight={modalInitialHeight}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="roleName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
              <Input placeholder="请输入角色名称" />
            </Form.Item>
            <Form.Item name="roleCode" label="角色编码" rules={[{ required: true, message: '请输入角色编码' }]}>
              <Input placeholder="请输入角色编码" />
            </Form.Item>
          </div>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
              <Select
                options={[
                  { value: 'active', label: '启用' },
                  { value: 'inactive', label: '停用' },
                ]}
              />
            </Form.Item>
            <Form.Item name="dataScope" label="数据权限范围" rules={[{ required: true, message: '请选择数据权限范围' }]}>
              <Select
                options={[
                  { value: 'all', label: '全部数据' },
                  { value: 'brand', label: '按品牌' },
                  { value: 'department', label: '按部门' },
                  { value: 'custom', label: '自定义' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item shouldUpdate={(prev, next) => prev.dataScope !== next.dataScope} noStyle>
            {({ getFieldValue }) => {
              const scope = String(getFieldValue('dataScope') || 'all');
              const showBrand = scope === 'brand' || scope === 'custom';
              const showDept = scope === 'department' || scope === 'custom';
              return (
                <>
                  {showBrand ? (
                    <Form.Item name="dataScopeBrands" label="品牌范围">
                      <Select mode="multiple" allowClear options={brandOptions} placeholder="选择品牌" />
                    </Form.Item>
                  ) : null}
                  {showDept ? (
                    <Form.Item name="dataScopeDepartments" label="部门范围">
                      <Select mode="multiple" allowClear options={deptOptions} placeholder="选择部门" />
                    </Form.Item>
                  ) : null}
                </>
              );
            }}
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        open={permModal.visible}
        title={roleModal.data ? `为「${roleModal.data.roleName}」授权` : '权限授权'}
        onCancel={closePermDialog}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={closePermDialog} disabled={permSaving}>
              取消
            </Button>
            <Button type="primary" onClick={savePerms} loading={permSaving}>
              保存
            </Button>
          </div>
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
        minHeight={420}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Alert
            type="info"
            showIcon
            title="角色权限将影响所有使用该角色的人员"
            description="建议先确定角色边界：新增角色 → 授权 → 分配给人员。"
          />
          <Space wrap>
            <Input
              value={permKeyword}
              onChange={(e) => setPermKeyword(e.target.value)}
              placeholder="搜索权限名称"
              style={{ width: 260 }}
              allowClear
            />
            <Button onClick={() => setPermKeyword('')} disabled={!String(permKeyword || '').trim()}>
              清空搜索
            </Button>
            <span style={{ color: 'var(--neutral-text-secondary)' }}>已选 {checkedPermIds.size} 项</span>
          </Space>

          <Space wrap>
            <Button onClick={() => applyTemplate(allPermissionIds)} disabled={!allPermissionIds.size}>全选</Button>
            <Button onClick={() => applyTemplate(new Set())} disabled={!checkedPermIds.size}>清空</Button>
            {templatePresets.map((t) => (
              <Button
                key={t.key}
                onClick={() => applyTemplate(t.ids)}
                disabled={!t.count}
              >
                {t.label}
              </Button>
            ))}
          </Space>

          {/* 列式模块布局 */}
          <div style={{
            marginTop: 12,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'flex-start'
          }}>
            {permissionsByModule
              .map((module) => {
              const allBtnIds = [
                ...module.groups.flatMap(g => [g.groupId, ...g.buttons.map(b => b.id)]),
                ...module.directButtons.map(b => b.id),
              ];
              return (
                <div key={module.moduleId} style={{ minWidth: 130, maxWidth: 200, border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden', fontSize: 12, flexShrink: 0 }}>
                  {/* 模块头 - 主色背景 */}
                  <div style={{ background: 'var(--primary-color, #1677ff)', padding: '4px 8px' }}>
                    <Checkbox
                      checked={checkedPermIds.has(module.moduleId)}
                      onChange={(e) => {
                        const next = new Set(checkedPermIds);
                        if (e.target.checked) { next.add(module.moduleId); allBtnIds.forEach(id => next.add(id)); }
                        else { next.delete(module.moduleId); allBtnIds.forEach(id => next.delete(id)); }
                        setCheckedPermIds(next);
                      }}
                      style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}
                    >{module.moduleName}</Checkbox>
                  </div>
                  {/* 子模块分组 */}
                  {module.groups.map(group => (
                    <div key={group.groupId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ background: checkedPermIds.has(group.groupId) ? '#dbeafe' : '#f0f4ff', padding: '2px 6px', borderBottom: '1px solid #e8eaf0' }}>
                        <Checkbox
                          checked={checkedPermIds.has(group.groupId)}
                          onChange={(e) => {
                            const next = new Set(checkedPermIds);
                            const ids = [group.groupId, ...group.buttons.map(b => b.id)];
                            if (e.target.checked) ids.forEach(id => next.add(id));
                            else ids.forEach(id => next.delete(id));
                            setCheckedPermIds(next);
                          }}
                          style={{ fontSize: 11, fontWeight: 500 }}
                        >{group.groupName}</Checkbox>
                      </div>
                      <div style={{ padding: '2px 4px 4px 16px' }}>
                        {group.buttons.map(btn => (
                          <div key={btn.id} style={{ background: checkedPermIds.has(btn.id) ? '#e6f4ff' : undefined, borderRadius: 2, marginBottom: 1 }}>
                            <Checkbox
                              checked={checkedPermIds.has(btn.id)}
                              onChange={(e) => {
                                const next = new Set(checkedPermIds);
                                if (e.target.checked) next.add(btn.id); else next.delete(btn.id);
                                setCheckedPermIds(next);
                              }}
                              style={{ fontSize: 10, width: '100%' }}
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
                      {module.directButtons.map(btn => (
                        <div key={btn.id} style={{ background: checkedPermIds.has(btn.id) ? '#e6f4ff' : undefined, borderRadius: 2, marginBottom: 1 }}>
                          <Checkbox
                            checked={checkedPermIds.has(btn.id)}
                            onChange={(e) => {
                              const next = new Set(checkedPermIds);
                              if (e.target.checked) next.add(btn.id); else next.delete(btn.id);
                              setCheckedPermIds(next);
                            }}
                            style={{ fontSize: 10, width: '100%' }}
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

        </div>
      </ResizableModal>

      <ResizableModal
        open={logVisible}
        title={logTitle}
        onCancel={() => {
          setLogVisible(false);
          setLogRecords([]);
        }}
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
    </Layout>
  );
};

export default RoleList;
