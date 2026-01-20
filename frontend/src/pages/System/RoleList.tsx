import React, { useMemo, useState, useEffect } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Tag, Tree, message } from 'antd';
import { DeleteOutlined, EditOutlined, SafetyOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import RowActions from '../../components/common/RowActions';
import ResizableTable from '../../components/common/ResizableTable';
import { Role, RoleQueryParams } from '../../types/system';
import api, { requestWithPathFallback } from '../../utils/api';
import { formatDateTime } from '../../utils/datetime';
import './styles.css';

const RoleList: React.FC = () => {
  const [form] = Form.useForm();
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [visible, setVisible] = useState(false);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [queryParams, setQueryParams] = useState<RoleQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [roleList, setRoleList] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [brandOptions, setBrandOptions] = useState<{ label: string; value: string }[]>([]);
  const [deptOptions, setDeptOptions] = useState<{ label: string; value: string }[]>([]);

  const [permVisible, setPermVisible] = useState(false);
  const [permTree, setPermTree] = useState<any[]>([]);
  const [checkedPermIds, setCheckedPermIds] = useState<Set<number>>(new Set());
  const [permKeyword, setPermKeyword] = useState('');
  const [permSaving, setPermSaving] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
  const modalWidth = isMobile ? '96vw' : isTablet ? '66vw' : '60vw';
  const modalInitialHeight = 720;

  const collectSubtreeIds = (node: any, into: Set<number>) => {
    if (!node) return;
    const id = Number(node.id);
    if (Number.isFinite(id)) into.add(id);
    const children = Array.isArray(node.children) ? node.children : [];
    for (const c of children) collectSubtreeIds(c, into);
  };

  const findFirstNode = (nodes: any[], predicate: (n: any) => boolean): any | null => {
    const stack = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) {
      const n = stack.shift();
      if (!n) continue;
      if (predicate(n)) return n;
      const children = Array.isArray(n.children) ? n.children : [];
      for (const c of children) stack.push(c);
    }
    return null;
  };

  const getSubtreeIdSetByCodeOrName = (code: string, name: string) => {
    const hit =
      findFirstNode(permTree, (n) => String(n.permissionCode || '').trim() === code)
      || findFirstNode(permTree, (n) => String(n.permissionName || '').trim() === name);
    const set = new Set<number>();
    if (hit) collectSubtreeIds(hit, set);
    return set;
  };

  const allPermissionIds = useMemo(() => {
    const set = new Set<number>();
    for (const n of Array.isArray(permTree) ? permTree : []) collectSubtreeIds(n, set);
    return set;
  }, [permTree]);

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
  }, [allPermissionIds, permTree]);

  const fetchRoles = async () => {
    try {
      const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setRoleList(result.data.records || []);
        setTotal(result.data.total || 0);
      }
    } catch (error) {
      message.error('获取角色列表失败');
    }
  };

  useEffect(() => {
    fetchRoles();
  }, [queryParams]);

  useEffect(() => {
    const fetchDict = async (type: string) => {
      try {
        const res = await api.get<any>('/system/dict/list', { params: { page: 1, pageSize: 1000, dictType: type } });
        const result = res as any;
        if (result.code === 200) {
          const items = result.data.records || [];
          return items.map((it: any) => ({ label: it.dictLabel, value: it.dictCode }));
        }
      } catch { }
      return [];
    };
    (async () => {
      const brands = await fetchDict('brand');
      const depts = await fetchDict('department');
      setBrandOptions(brands);
      setDeptOptions(depts);
    })();
  }, []);

  const openDialog = (role?: Role) => {
    setCurrentRole(role || null);
    form.setFieldsValue({
      roleName: String(role?.roleName || ''),
      roleCode: String(role?.roleCode || ''),
      description: String(role?.description || ''),
      status: (role?.status || 'active') as any,
      dataScope: (role?.dataScope || 'all') as any,
      dataScopeBrands: Array.isArray(role?.dataScopeBrands) ? role?.dataScopeBrands : [],
      dataScopeDepartments: Array.isArray(role?.dataScopeDepartments) ? role?.dataScopeDepartments : [],
    });
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentRole(null);
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload: Role = {
        ...(currentRole || ({} as any)),
        ...values,
        status: (values as any)?.status || 'active',
        dataScope: (values as any)?.dataScope || 'all',
        dataScopeBrands: Array.isArray((values as any)?.dataScopeBrands) ? (values as any).dataScopeBrands : [],
        dataScopeDepartments: Array.isArray((values as any)?.dataScopeDepartments) ? (values as any).dataScopeDepartments : [],
      };

      let response;
      if (payload?.id) {
        response = await requestWithPathFallback('put', '/system/role', '/auth/role', payload);
      } else {
        response = await requestWithPathFallback('post', '/system/role', '/auth/role', payload);
      }
      const result = response as any;
      if (result.code === 200) {
        message.success('保存成功');
        closeDialog();
        fetchRoles();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error: any) {
      const msg = error?.message || '保存失败';
      message.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定删除该角色吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await requestWithPathFallback('delete', `/system/role/${id}`, `/auth/role/${id}`);
          const result = response as any;
          if (result.code === 200) {
            message.success('删除成功');
            fetchRoles();
            return;
          }
          throw new Error(result.message || '删除失败');
        } catch (error: any) {
          const msg = error?.message || '删除失败';
          message.error(msg);
          throw error;
        }
      },
    });
  };

  const openPermDialog = async (role: Role) => {
    setCurrentRole(role);
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
      const idList: number[] = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setCheckedPermIds(new Set(idList));
      setPermVisible(true);
    } catch (e) {
      message.error('加载权限失败');
    }
  };

  const closePermDialog = () => {
    setPermVisible(false);
    setPermTree([]);
    setCheckedPermIds(new Set());
    setPermKeyword('');
  };

  const applyTemplate = (ids: Set<number>) => {
    setPermKeyword('');
    setCheckedPermIds(new Set(ids));
  };

  const treeData = useMemo(() => {
    const kw = String(permKeyword || '').trim();
    const lowerKw = kw.toLowerCase();
    const mapNodes = (nodes: any[]): any[] => {
      return (nodes || []).map((n) => {
        const children = Array.isArray(n.children) ? mapNodes(n.children) : undefined;
        return {
          key: String(n.id),
          title: n.permissionName,
          children,
        };
      });
    };
    const raw = mapNodes(permTree);
    if (!kw) return raw;

    const filterNodes = (nodes: any[]): any[] => {
      const next: any[] = [];
      for (const n of nodes || []) {
        const title = String(n.title || '');
        const matchSelf = title.toLowerCase().includes(lowerKw);
        const children = Array.isArray(n.children) ? filterNodes(n.children) : [];
        if (matchSelf || children.length) {
          next.push({ ...n, children: children.length ? children : undefined });
        }
      }
      return next;
    };

    return filterNodes(raw);
  }, [permKeyword, permTree]);

  const checkedKeys = useMemo(() => {
    return Array.from(checkedPermIds.values()).map((id) => String(id));
  }, [checkedPermIds]);

  const savePerms = async () => {
    if (!currentRole?.id) return;
    setPermSaving(true);
    try {
      const ids = Array.from(checkedPermIds.values());
      const res = await requestWithPathFallback('put', `/system/role/${currentRole.id}/permission-ids`, `/auth/role/${currentRole.id}/permission-ids`, ids);
      const result = res as any;
      if (result.code === 200) {
        message.success('授权成功');
        closePermDialog();
      } else {
        message.error(result.message || '授权失败');
      }
    } catch (e) {
      message.error('授权失败');
    } finally {
      setPermSaving(false);
    }
  };

  const getStatusText = (status: string) => {
    return status === 'active' ? '启用' : '停用';
  };

  const columns = [
    { title: '角色名称', dataIndex: 'roleName', key: 'roleName', width: 160 },
    { title: '角色编码', dataIndex: 'roleCode', key: 'roleCode', width: 160 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: any) => {
        const status = String(v || '').trim() || 'inactive';
        return <Tag color={status === 'active' ? 'green' : 'red'}>{getStatusText(status)}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: any) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: any, role: Role) => (
        <RowActions
          className="table-actions"
          maxInline={3}
          actions={[
            {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              icon: <EditOutlined />,
              onClick: () => openDialog(role),
              primary: true,
            },
            {
              key: 'perm',
              label: '权限授权',
              title: '权限授权',
              icon: <SafetyOutlined />,
              onClick: () => openPermDialog(role),
              primary: true,
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => handleDelete(role.id!),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <div className="role-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">角色管理</h2>
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
                value={String((queryParams as any)?.roleName || '')}
                onChange={(e) => setQueryParams((prev) => ({ ...prev, roleName: e.target.value, page: 1 }))}
              />
              <Input
                placeholder="角色编码"
                style={{ width: 220 }}
                allowClear
                value={String((queryParams as any)?.roleCode || '')}
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
                  }) as any)
                }
              >
                重置
              </Button>
            </Space>
          </Card>

          <div className="table-section">
            <ResizableTable<Role>
              storageKey="system-role-table"
              rowKey={(r) => String(r.id || r.roleCode)}
              columns={columns as any}
              dataSource={roleList}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (t) => `共 ${t} 条记录`,
                onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
            />
          </div>
        </Card>
      </div>

      <ResizableModal
        open={visible}
        title={currentRole ? '编辑角色' : '新增角色'}
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
        open={permVisible}
        title={currentRole ? `为「${currentRole.roleName}」授权` : '权限授权'}
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
            <span style={{ color: '#6b7280' }}>已选 {checkedPermIds.size} 项</span>
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
          <div className="permission-tree" style={{ borderRadius: 8 }}>
            <Tree
              checkable
              defaultExpandAll
              checkedKeys={checkedKeys}
              onCheck={(keys) => {
                const nextKeys = (Array.isArray(keys) ? keys : (keys as any).checked) as any[];
                const next = new Set<number>();
                for (const k of nextKeys) {
                  const n = Number(k);
                  if (Number.isFinite(n)) next.add(n);
                }
                setCheckedPermIds(next);
              }}
              treeData={treeData}
            />
          </div>

        </div>
      </ResizableModal>
    </Layout>
  );
};

export default RoleList;
