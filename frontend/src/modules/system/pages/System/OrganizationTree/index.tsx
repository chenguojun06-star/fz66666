import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { organizationApi } from '@/services/system/organizationApi';
import { factoryApi } from '@/services/system/factoryApi';
import tenantService from '@/services/tenantService';
import type { Factory } from '@/services/system/factoryApi';
import type { OrganizationUnit, User } from '@/types/system';
import { useAuth } from '@/utils/AuthContext';
import {
  App, Avatar, Button, Card, Checkbox, Col, Descriptions, Empty, Form, Input,
  InputNumber, Modal, QRCode, Row, Select, Space, Tag, Tooltip, Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  ApartmentOutlined, BankOutlined, CrownFilled, DeleteOutlined,
  DownOutlined, EditOutlined, PlusOutlined, QrcodeOutlined, RightOutlined,
  SnippetsOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons';
import './styles.css';

type DialogMode = 'create' | 'edit';

const ownerTypeOptions = [
  { value: 'NONE', label: '通用部门' },
  { value: 'INTERNAL', label: '内部' },
  { value: 'EXTERNAL', label: '外部' },
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

/** 递归过滤组织树，只保留属于指定工厂的节点（工厂账号数据隔离） */
function filterTreeByFactory(nodes: OrganizationUnit[], factoryId: string): OrganizationUnit[] {
  return nodes.flatMap(node => {
    if (node.factoryId && String(node.factoryId) === factoryId) {
      return [node]; // 完整保留该节点及其所有子节点
    }
    const filteredChildren = filterTreeByFactory(node.children ?? [], factoryId);
    if (filteredChildren.length > 0) {
      return [{ ...node, children: filteredChildren }];
    }
    return [];
  });
}

const OrganizationTreePage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);
  const [treeData, setTreeData] = useState<OrganizationUnit[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, User[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [currentRecord, setCurrentRecord] = useState<OrganizationUnit | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // 左树选中节点
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  // 右侧成员搜索
  const [memberSearch, setMemberSearch] = useState('');
  // 包括下级成员
  const [includeSubUnits, setIncludeSubUnits] = useState(false);

  // 外发工厂注册二维码弹窗
  const [qrModal, setQrModal] = useState<{ open: boolean; unit: OrganizationUnit | null; tenantCode: string }>(
    { open: false, unit: null, tenantCode: '' },
  );

  // 模板创建弹窗状态
  const [tplModal, setTplModal] = useState<{ open: boolean; type: 'FACTORY' | 'INTERNAL' | null; rootName: string; factoryId?: string }>(
    { open: false, type: null, rootName: '' },
  );
  const [tplLoading, setTplLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);

  // 打开模板弹窗时加载工厂列表
  useEffect(() => {
    if (tplModal.open) {
      factoryApi.list({ pageSize: 500, status: 'active' }).then((res) => {
        setFactories((res as any)?.data?.records ?? []);
      }).catch(() => setFactories([]));
    }
  }, [tplModal.open]);

  // 成员分配弹窗状态
  const [assignModal, setAssignModal] = useState<{ open: boolean; node: OrganizationUnit | null }>({ open: false, node: null });
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  // 批量添加：选中用户ID列表 + loading
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchAssignLoading, setBatchAssignLoading] = useState(false);
  // 设为老板操作 loading（存 userId）
  const [setOwnerLoading, setSetOwnerLoading] = useState<string | null>(null);
  // 成员资料 mini 弹窗
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const currentFactoryName = String((user as any)?.tenantName || '').trim();
  const isFactoryAccount = !!(user as any)?.factoryId;
  const currentUserFactoryId = isFactoryAccount ? String((user as any).factoryId) : null;

  const handleInitTemplate = async () => {
    if (!tplModal.type) { message.warning('请选择一个模板类型'); return; }
    if (!tplModal.rootName.trim()) { message.warning('请输入根节点名称'); return; }
    setTplLoading(true);
    try {
      await organizationApi.initTemplate(tplModal.type, tplModal.rootName.trim(), tplModal.factoryId);
      message.success('模板初始化成功！组织架构已创建');
      setTplModal({ open: false, type: null, rootName: '' });
      loadData();
    } catch (e: any) {
      message.error(e?.message || '创建失败');
    } finally {
      setTplLoading(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 关键数据：tree + departments 必须成功
      const [tree, departmentList] = await Promise.all([
        organizationApi.tree(),
        organizationApi.departments(),
      ]);
      setTreeData(Array.isArray(tree) ? tree : []);
      setDepartments(Array.isArray(departmentList) ? departmentList : []);
    } catch (error: any) {
      message.error(error?.message || '组织架构加载失败');
    } finally {
      setLoading(false);
    }
    // 成员数据独立加载，失败不影响主体
    organizationApi.members()
      .then((m) => setMembersMap(m && typeof m === 'object' ? m : {}))
      .catch(() => { /* 静默，成员数据非关键 */ });
  }, [message]);

  useEffect(() => { void loadData(); }, [loadData]);

  // 加载可分配用户（一次性，点开弹窗时刷新）
  const loadAssignableUsers = useCallback(async () => {
    try {
      const users = await organizationApi.assignableUsers();
      setAssignableUsers(Array.isArray(users) ? users : []);
    } catch (e: any) {
      message.error('加载用户列表失败：' + (e?.message || '请重试'));
      setAssignableUsers([]);
    }
  }, [message]);

  const departmentOptions = useMemo(() => {
    return departments
      .map((item) => ({
        value: String(item.id ?? '').trim(),
        label: String(item.unitName ?? '未命名'),
      }))
      .filter((item) => item.value);
  }, [departments]);

  const openCreate = (parent?: OrganizationUnit) => {
    setDialogMode('create');
    setCurrentRecord(parent || null);
    form.setFieldsValue({
      unitName: '',
      parentId: parent?.id ? String(parent.id) : undefined,
      ownerType: parent?.ownerType || 'NONE',
      sortOrder: 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (record: OrganizationUnit) => {
    setDialogMode('edit');
    setCurrentRecord(record);
    form.setFieldsValue({
      id: record.id ? String(record.id) : undefined,
      unitName: record.unitName,
      parentId: record.parentId ? String(record.parentId) : undefined,
      ownerType: record.ownerType || 'NONE',
      sortOrder: record.sortOrder || 0,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setCurrentRecord(null);
    form.resetFields();
  };

  const handleDelete = (record: OrganizationUnit) => {
    modal.confirm({
      width: '30vw',
      title: `删除部门「${record.unitName}」`,
      content: '仅允许删除没有子节点的部门，删除后该部门下成员将自动释放。',
      okText: '删除',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        const remark = `删除组织节点：${record.unitName}`;
        await organizationApi.delete(String(record.id), remark);
        message.success('删除成功');
        await loadData();
      },
    });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitLoading(true);
    try {
      const payload = { ...values, nodeType: 'DEPARTMENT', status: 'active' };
      if (dialogMode === 'edit') {
        await organizationApi.update(payload);
      } else {
        await organizationApi.create(payload);
      }
      message.success(dialogMode === 'edit' ? '部门更新成功' : '部门创建成功');
      closeDialog();
      await loadData();
    } catch (error: any) {
      message.error(error?.message || '保存失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  // 打开分配成员弹窗
  const handleOpenAssign = useCallback(async (node: OrganizationUnit) => {
    setAssignSearch('');
    setBatchSelectedIds([]);
    setAssignModal({ open: true, node });
    await loadAssignableUsers();
  }, [loadAssignableUsers]);

  // 批量分配用户到节点
  const handleBatchAssign = useCallback(async () => {
    if (!assignModal.node?.id || batchSelectedIds.length === 0) {
      message.warning('请勾选要添加的用户');
      return;
    }
    setBatchAssignLoading(true);
    try {
      await Promise.all(
        batchSelectedIds.map((uid) => organizationApi.assignMember(uid, String(assignModal.node!.id))),
      );
      message.success(`已成功添加 ${batchSelectedIds.length} 名成员`);
      setBatchSelectedIds([]);
      const [m] = await Promise.allSettled([organizationApi.members(), loadAssignableUsers()]);
      if (m.status === 'fulfilled' && m.value && typeof m.value === 'object') {
        setMembersMap(m.value);
      }
    } catch (error: any) {
      message.error(error?.message || '批量添加失败');
    } finally {
      setBatchAssignLoading(false);
    }
  }, [assignModal.node, batchSelectedIds, message, loadAssignableUsers]);

  // 显示外发工厂注册二维码
  const handleShowQRCode = useCallback(async (node: OrganizationUnit) => {
    let tenantCode = '';
    try {
      const res = await (tenantService as any).myTenant();
      tenantCode = (res as any)?.data?.tenantCode || (res as any)?.tenantCode || '';
    } catch { /* 静默，二维码依然可以展示 */ }
    setQrModal({ open: true, unit: node, tenantCode });
  }, []);

  // 移出成员
  const handleRemoveMember = useCallback(async (userId: string, userName: string) => {
    modal.confirm({
      width: '30vw',
      title: `移出成员「${userName}」`,
      content: '该成员将从当前组织节点移出，账号本身不受影响。',
      okText: '移出',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        await organizationApi.removeMember(userId);
        message.success('已移出');
        organizationApi.members().then((m) => setMembersMap(m && typeof m === 'object' ? m : {})).catch(() => {});
      },
    });
  }, [modal, message]);

  // 设置外发工厂主账号（老板）
  const handleSetFactoryOwner = useCallback(async (user: User) => {
    if (!user.factoryId || !user.id) return;
    setSetOwnerLoading(String(user.id));
    try {
      await organizationApi.setFactoryOwner(String(user.id), String(user.factoryId));
      message.success(`已设置「${user.name || user.username}」为工厂主账号（老板）`);
      organizationApi.members().then((m) => setMembersMap(m && typeof m === 'object' ? m : {})).catch(() => {});
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message || '设置失败');
    } finally {
      setSetOwnerLoading(null);
    }
  }, [message]);

  const totalMembers = useMemo(() => {
    return Object.values(membersMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }, [membersMap]);

  /** 工厂账号只能看到自己工厂相关的组织节点 */
  const visibleTreeData = useMemo(() => {
    if (!isFactoryAccount || !currentUserFactoryId) return treeData;
    return filterTreeByFactory(treeData, currentUserFactoryId);
  }, [isFactoryAccount, currentUserFactoryId, treeData]);

  // 当前弹窗节点下的成员 id 集合（用于标注已添加状态，不过滤）
  const currentNodeMemberIds = useMemo(() => {
    if (!assignModal.node?.id) return new Set<string>();
    const members = membersMap[String(assignModal.node.id)] || [];
    return new Set(members.map((u) => String(u.id)));
  }, [assignModal.node, membersMap]);

  // 可供分配的用户列表（显示所有人，按搜索过滤，已在本节点的排在后面）
  const filteredAssignableUsers = useMemo(() => {
    const filtered = assignableUsers.filter((u) => {
      if (!assignSearch.trim()) return true;
      const q = assignSearch.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
    });
    // 已在本节点的排到最后
    return [
      ...filtered.filter(u => !currentNodeMemberIds.has(String(u.id))),
      ...filtered.filter(u => currentNodeMemberIds.has(String(u.id))),
    ];
  }, [assignableUsers, currentNodeMemberIds, assignSearch]);

  // 部门 ID → 名称 快查表
  const unitNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach(d => {
      if (d.id) map[String(d.id)] = d.unitName || '';
    });
    return map;
  }, [departments]);

  // 当前选中的 OrganizationUnit 对象
  const selectedUnit = useMemo(() => findUnit(treeData, selectedUnitId), [treeData, selectedUnitId]);
  // 当前选中节点是否为外发工厂（ownerType=EXTERNAL）
  const isExternalSelected = selectedUnit?.ownerType === 'EXTERNAL';

  // 右侧展示的成员列表
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

  // 外发工厂只读成员表格列（无操作列）
  const readOnlyMemberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar
            size={24}
            icon={<UserOutlined />}
            style={{ backgroundColor: r.isFactoryOwner ? '#faad14' : '#52c41a', flexShrink: 0, cursor: 'pointer' }}
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
      title: '操作',
      width: 100,
      render: (_: unknown, r: User) => r.isFactoryOwner ? (
        <Tag color="gold"><CrownFilled /> 主账号</Tag>
      ) : (
        <Button
          size="small"
          icon={<CrownFilled />}
          loading={setOwnerLoading === String(r.id)}
          onClick={() => handleSetFactoryOwner(r)}
        >
          设为老板
        </Button>
      ),
    },
  ];

  // 成员表格列定义
  const memberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar size={24} icon={<UserOutlined />} style={{ backgroundColor: '#1677ff', flexShrink: 0, cursor: 'pointer' }} onClick={() => setProfileUser(r)} />
          {v || r.username}
        </Space>
      ),
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      render: (v: string) => v || '—',
    },
    {
      title: '所属部门',
      dataIndex: 'orgUnitId',
      render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—',
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, r: User) => (
        <Button
          size="small"
          danger
          onClick={() => handleRemoveMember(String(r.id), r.name || r.username || '')}
        >
          移出
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <Card className="page-card" loading={loading}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {currentFactoryName ? (
                <>
                  <BankOutlined style={{ marginRight: 6, color: '#1677ff', fontSize: 22 }} />
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', marginRight: 14 }}>
                    {currentFactoryName}
                  </span>
                  <span style={{ color: '#d9d9d9', fontWeight: 300, fontSize: 20, marginRight: 14 }}>|</span>
                </>
              ) : null}
              <ApartmentOutlined style={{ marginRight: 8 }} />
              组织架构
            </h2>
            <div style={{ color: 'var(--neutral-text-secondary)', marginTop: 4 }}>
              管理公司组织结构，包含部门、工厂及人员分配。
              <span style={{ marginLeft: 12 }}>
                共 <strong>{departments.length}</strong> 个部门 · <strong>{totalMembers}</strong> 名人员
              </span>
            </div>
          </div>
          {!isFactoryAccount && (
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
          )}
        </div>

        {visibleTreeData.length === 0 && !loading ? (
          <Empty description="暂无组织架构数据" style={{ padding: '60px 0' }} />
        ) : (
          <div className="org-split-layout">
            {/* 左侧：组织架构树 */}
            <div className="org-tree-panel">
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

            {/* 右侧：成员面板 */}
            <div className="org-member-panel">
              {!selectedUnitId ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="请点击左侧节点查看成员"
                  style={{ paddingTop: 80 }}
                />
              ) : (
                <>
                  <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 15 }}>
                    {selectedUnit?.unitName} · 成员列表
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
                    {!isFactoryAccount && (isExternalSelected ? (
                      <Button
                        icon={<QrcodeOutlined />}
                        onClick={() => selectedUnit && handleShowQRCode(selectedUnit)}
                      >
                        注册二维码
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => selectedUnit && handleOpenAssign(selectedUnit)}
                      >
                        添加成员
                      </Button>
                    ))}
                  </div>
                  <ResizableTable<User>
                    size="small"
                    rowKey={r => String(r.id ?? r.username)}
                    columns={isExternalSelected ? readOnlyMemberColumns : memberColumns}
                    dataSource={displayedMembers}
                    pagination={displayedMembers.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
                    locale={{ emptyText: isExternalSelected ? '外发工厂成员通过扫码二维码注册' : '暂无成员，点击「添加成员」分配' }}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* 新增/编辑部门弹窗 */}
      <ResizableModal
        open={dialogOpen}
        title={dialogMode === 'edit' ? '编辑部门' : '新增部门'}
        onCancel={closeDialog}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        okText="保存"
        cancelText="取消"
        width="30vw"
        initialHeight={260}
      >
        <Form form={form} layout="vertical" style={{ padding: '4px 0' }}>
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
            <Col span={12}>
              <Form.Item name="ownerType" label="内外标签" rules={[{ required: true, message: '请选择' }]}>
                <Select options={ownerTypeOptions} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sortOrder" label="排序">
                <InputNumber min={0} precision={0} placeholder="默认 0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          {currentRecord?.pathNames && (
            <div style={{ color: 'var(--neutral-text-secondary)', padding: '0 16px', marginTop: 8 }}>
              当前路径：{currentRecord.pathNames}
            </div>
          )}
        </Form>
      </ResizableModal>

      {/* 分配成员弹窗（竖向布局 + 批量勾选） */}
      <ResizableModal
        open={assignModal.open}
        title={`为「${assignModal.node?.unitName || ''}」添加成员`}
        onCancel={() => { setAssignModal({ open: false, node: null }); setBatchSelectedIds([]); }}
        footer={null}
        width="40vw"
        initialHeight={580}
      >
        <div style={{ padding: '8px 0' }}>
          <Input.Search
            placeholder="搜索姓名或账号"
            allowClear
            value={assignSearch}
            onChange={(e) => setAssignSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {filteredAssignableUsers.length === 0 ? (
            <Empty description="暂无用户（该租户下尚无活跃账号）" style={{ padding: '32px 0' }} />
          ) : (
            <ResizableTable<User>
              size="small"
              rowKey={(r) => String(r.id)}
              dataSource={filteredAssignableUsers}
              scroll={{ y: 300 }}
              pagination={false}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys: batchSelectedIds,
                onChange: (keys) => setBatchSelectedIds(keys as string[]),
                getCheckboxProps: (r) => ({ disabled: currentNodeMemberIds.has(String(r.id)) }),
              }}
              columns={[
                {
                  title: '用户',
                  render: (_: unknown, r: User) => {
                    const alreadyIn = currentNodeMemberIds.has(String(r.id));
                    return (
                      <Space size={6}>
                        <Avatar size={28} icon={<UserOutlined />}
                          style={{ backgroundColor: alreadyIn ? '#ccc' : '#1677ff', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{r.name || r.username}</div>
                          <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
                            {r.username}
                            {!alreadyIn && r.orgUnitId && (
                              <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>
                                已在: {unitNameMap[String(r.orgUnitId)] || '其他组织'}
                              </Tag>
                            )}
                          </div>
                        </div>
                      </Space>
                    );
                  },
                },
                { title: '手机号', dataIndex: 'phone', width: 110, render: (v: string) => v || '—' },
                {
                  title: '状态', width: 72,
                  render: (_: unknown, r: User) => currentNodeMemberIds.has(String(r.id))
                    ? <Tag color="success" style={{ fontSize: 11 }}>已添加</Tag>
                    : null,
                },
              ]}
            />
          )}
          {/* 底部批量确认区 */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0',
          }}>
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 13 }}>
              {batchSelectedIds.length > 0 ? `已勾选 ${batchSelectedIds.length} 人` : '勾选后批量添加'}
            </span>
            <Space>
              <Button onClick={() => { setAssignModal({ open: false, node: null }); setBatchSelectedIds([]); }}>取消</Button>
              <Button
                type="primary"
                disabled={batchSelectedIds.length === 0}
                loading={batchAssignLoading}
                onClick={handleBatchAssign}
              >
                确认添加{batchSelectedIds.length > 0 ? ` (${batchSelectedIds.length} 人)` : ''}
              </Button>
            </Space>
          </div>
        </div>
      </ResizableModal>

      {/* 外发工厂注册二维码弹窗 */}
      <ResizableModal
        open={qrModal.open}
        title={`${qrModal.unit?.unitName || ''} · 注册二维码`}
        onCancel={() => setQrModal({ open: false, unit: null, tenantCode: '' })}
        footer={null}
        width="30vw"
        initialHeight={420}
      >
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <QRCode
            value={
              qrModal.unit
                ? `${window.location.origin}/register?type=FACTORY_INVITE&tenantCode=${encodeURIComponent(qrModal.tenantCode)}&factoryId=${encodeURIComponent(qrModal.unit.factoryId || String(qrModal.unit.id))}&factoryName=${encodeURIComponent(qrModal.unit.unitName)}&orgUnitId=${encodeURIComponent(String(qrModal.unit.id))}`
                : ' '
            }
            size={220}
            style={{ margin: '0 auto' }}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
            外发工厂工人扫码注册，自动归属到「{qrModal.unit?.unitName}」
          </Typography.Text>
        </div>
      </ResizableModal>

      {/* 模板初始化弹窗 */}
      <ResizableModal
        open={tplModal.open}
        title="从模板创建组织架构"
        onCancel={() => setTplModal({ open: false, type: null, rootName: '' })}
        onOk={handleInitTemplate}
        confirmLoading={tplLoading}
        okText="立即创建"
        cancelText="取消"
        width="40vw"
        initialHeight={500}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 12, fontWeight: 500 }}>第一步：选择模板类型</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {(
              [
                {
                  type: 'FACTORY' as const,
                  icon: '🏭',
                  label: '工厂 / 车间',
                  desc: '适合外发工厂、合作供应商',
                  children: ['车间一', '车间二', '车间三'],
                },
                {
                  type: 'INTERNAL' as const,
                  icon: '🏢',
                  label: '公司内部',
                  desc: '适合公司内部管理部门',
                  children: ['生产部门', '财务部门', '行政部门'],
                },
              ]
            ).map((tpl) => (
              <div
                key={tpl.type}
                onClick={() => setTplModal((prev) => ({ ...prev, type: tpl.type }))}
                style={{
                  flex: 1,
                  border: `2px solid ${tplModal.type === tpl.type ? 'var(--primary-color, #1677ff)' : '#d9d9d9'}`,
                  borderRadius: 8,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  background: tplModal.type === tpl.type ? '#f0f5ff' : '#fafafa',
                  transition: 'border-color .2s, background .2s',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{tpl.icon}</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{tpl.label}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', marginBottom: 10 }}>
                  {tpl.desc}
                </div>
                <div style={{ fontSize: 12 }}>
                  {tpl.children.map((c) => (
                    <Tag key={c} style={{ marginBottom: 4 }}>{c}</Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8, fontWeight: 500 }}>第二步：输入根节点名称</div>
          <Input
            placeholder={
              tplModal.type === 'FACTORY'
                ? '例如：嘉兴市合作工厂'
                : '例如：公司生产中心'
            }
            value={tplModal.rootName}
            maxLength={40}
            allowClear
            onChange={(e) => setTplModal((prev) => ({ ...prev, rootName: e.target.value }))}
            style={{ marginBottom: 16 }}
          />

          {tplModal.type === 'FACTORY' && (
            <>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>第三步：关联现有工厂（可选）</div>
              <Select
                allowClear
                placeholder="选择已有工厂，可跳过"
                value={tplModal.factoryId}
                onChange={(v) => setTplModal((prev) => ({ ...prev, factoryId: v }))}
                options={factories.map((f) => ({
                  value: f.id,
                  label: f.factoryName + (f.contactPerson ? ' · ' + f.contactPerson : ''),
                }))}
                style={{ width: '100%', marginBottom: 16 }}
              />
            </>
          )}

          {tplModal.type && (
            <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
              <div style={{ fontWeight: 500, marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>
                创建预览
              </div>
              <div style={{ marginBottom: 4 }}>
                📁 <strong>{tplModal.rootName || '(待填写)'}</strong>
              </div>
              {(tplModal.type === 'FACTORY'
                ? ['车间一', '车间二', '车间三']
                : ['生产部门', '财务部门', '行政部门']
              ).map((c) => (
                <div key={c} style={{ paddingLeft: 20, color: 'var(--neutral-text-secondary)', lineHeight: 1.8 }}>
                  └ {c}
                </div>
              ))}
            </div>
          )}
        </div>
      </ResizableModal>

      {/* 成员资料 mini 弹窗 */}
      <Modal
        open={!!profileUser}
        onCancel={() => setProfileUser(null)}
        footer={null}
        width={360}
        title="成员资料"
        centered
      >
        {profileUser && (
          <div>
            <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
              <Avatar
                size={64}
                icon={<UserOutlined />}
                style={{ backgroundColor: profileUser.isFactoryOwner ? '#faad14' : '#1677ff', display: 'block', margin: '0 auto 12px' }}
              />
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {profileUser.name || profileUser.username}
                {profileUser.isFactoryOwner && (
                  <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 8 }}>老板</Tag>
                )}
              </div>
              <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>@{profileUser.username}</div>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="手机">{profileUser.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="角色">{profileUser.roleName || '—'}</Descriptions.Item>
              <Descriptions.Item label="所属部门">
                {profileUser.orgUnitId ? (unitNameMap[profileUser.orgUnitId] || '—') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="帐号状态">
                <Tag color={profileUser.status === 'active' ? 'green' : 'default'}>
                  {profileUser.status === 'active' ? '正常' : '已停用'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </Layout>
  );
};

/* ---------- 左侧树节点 ---------- */

interface TreeItemProps {
  node: OrganizationUnit;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (parent: OrganizationUnit) => void;
  onEdit: (record: OrganizationUnit) => void;
  onDelete: (record: OrganizationUnit) => void;
  onAddMember: (node: OrganizationUnit) => void;
  onShowQRCode: (node: OrganizationUnit) => void;
  /** 工厂账号只读模式：隐藏新增/编辑/删除等操作按钮 */
  readOnly?: boolean;
}

const TreeItem: React.FC<TreeItemProps> = ({
  node, depth, selectedId, onSelect, onAdd, onEdit, onDelete, onAddMember, onShowQRCode, readOnly,
}) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isSelected = String(node.id) === selectedId;
  const isFactory = node.nodeType === 'FACTORY';
  const isExternal = node.ownerType === 'EXTERNAL';

  return (
    <div>
      <div
        className={`tree-item${isSelected ? ' tree-item-selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <span
          className="tree-chevron"
          onClick={() => hasChildren && setExpanded(v => !v)}
          style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
        >
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <span className="tree-node-label" onClick={() => onSelect(String(node.id))}>
          {isFactory
            ? <BankOutlined style={{ color: '#1677ff', marginRight: 4 }} />
            : <ApartmentOutlined style={{ color: '#722ed1', marginRight: 4 }} />
          }
          <span className="tree-node-name">{node.unitName}</span>
        </span>
        <div className="tree-item-actions">
          {!readOnly && (isExternal ? (
            <Tooltip title="注册二维码">
              <Button type="text" size="small" icon={<QrcodeOutlined />}
                onClick={e => { e.stopPropagation(); onShowQRCode(node); }} />
            </Tooltip>
          ) : (
            <Tooltip title="添加成员">
              <Button type="text" size="small" icon={<UserAddOutlined />}
                onClick={e => { e.stopPropagation(); onAddMember(node); }} />
            </Tooltip>
          ))}
          {!readOnly && (!isFactory || isExternal) && (
            <>
              <Tooltip title="新增下级">
                <Button type="text" size="small" icon={<PlusOutlined />}
                  onClick={e => { e.stopPropagation(); onAdd(node); }} />
              </Tooltip>
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />}
                  onClick={e => { e.stopPropagation(); onEdit(node); }} />
              </Tooltip>
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                  onClick={e => { e.stopPropagation(); onDelete(node); }} />
              </Tooltip>
            </>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map(child => (
            <TreeItem
              key={child.id ?? child.unitName}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddMember={onAddMember}
              onShowQRCode={onShowQRCode}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default OrganizationTreePage;
