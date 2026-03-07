import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit, User } from '@/types/system';
import {
  App, Avatar, Badge, Button, Card, Collapse, Empty, Form, Input,
  InputNumber, List, Select, Space, Spin, Tag, Tooltip,
} from 'antd';
import {
  ApartmentOutlined, BankOutlined, CloseOutlined, DeleteOutlined,
  EditOutlined, PlusOutlined, TeamOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons';
import './styles.css';

type DialogMode = 'create' | 'edit';

const ownerTypeOptions = [
  { value: 'NONE', label: '通用部门' },
  { value: 'INTERNAL', label: '内部' },
  { value: 'EXTERNAL', label: '外部' },
];

const OrganizationTreePage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);
  const [treeData, setTreeData] = useState<OrganizationUnit[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, User[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [currentRecord, setCurrentRecord] = useState<OrganizationUnit | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // 成员分配弹窗状态
  const [assignModal, setAssignModal] = useState<{ open: boolean; node: OrganizationUnit | null }>({ open: false, node: null });
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignActionLoading, setAssignActionLoading] = useState<string | null>(null);

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
    } catch {
      setAssignableUsers([]);
    }
  }, []);

  const departmentOptions = useMemo(() => {
    return departments
      .map((item) => ({
        value: String(item.id ?? '').trim(),
        label: String(item.pathNames ?? item.nodeName ?? '未命名'),
      }))
      .filter((item) => item.value);
  }, [departments]);

  const openCreate = (parent?: OrganizationUnit) => {
    setDialogMode('create');
    setCurrentRecord(parent || null);
    form.setFieldsValue({
      nodeName: '',
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
      nodeName: record.nodeName,
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
      title: `删除部门「${record.nodeName}」`,
      content: '仅允许删除没有子节点的部门，删除后该部门下成员将自动释放。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const remark = `删除组织节点：${record.nodeName}`;
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
    setAssignModal({ open: true, node });
    await loadAssignableUsers();
  }, [loadAssignableUsers]);

  // 分配用户到节点
  const handleAssignUser = useCallback(async (userId: string) => {
    if (!assignModal.node?.id) return;
    setAssignActionLoading(userId);
    try {
      await organizationApi.assignMember(userId, String(assignModal.node.id));
      message.success('分配成功');
      // 刷新成员数据
      organizationApi.members().then((m) => setMembersMap(m && typeof m === 'object' ? m : {})).catch(() => {});
    } catch (error: any) {
      message.error(error?.message || '分配失败');
    } finally {
      setAssignActionLoading(null);
    }
  }, [assignModal.node, message]);

  // 移出成员
  const handleRemoveMember = useCallback(async (userId: string, userName: string) => {
    modal.confirm({
      title: `移出成员「${userName}」`,
      content: '该成员将从当前组织节点移出，账号本身不受影响。',
      okText: '移出',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await organizationApi.removeMember(userId);
        message.success('已移出');
        organizationApi.members().then((m) => setMembersMap(m && typeof m === 'object' ? m : {})).catch(() => {});
      },
    });
  }, [modal, message]);

  const totalMembers = useMemo(() => {
    return Object.values(membersMap).reduce((sum, list) => sum + list.length, 0);
  }, [membersMap]);

  // 当前弹窗节点下的成员 id 集合（用于过滤已分配人员）
  const currentNodeMemberIds = useMemo(() => {
    if (!assignModal.node?.id) return new Set<string>();
    const members = membersMap[String(assignModal.node.id)] || [];
    return new Set(members.map((u) => String(u.id)));
  }, [assignModal.node, membersMap]);

  // 可供分配的用户（过滤掉已在本节点者）
  const filteredAssignableUsers = useMemo(() => {
    return assignableUsers.filter((u) => {
      if (currentNodeMemberIds.has(String(u.id))) return false;
      if (!assignSearch.trim()) return true;
      const q = assignSearch.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
    });
  }, [assignableUsers, currentNodeMemberIds, assignSearch]);

  return (
    <Layout>
      <Card className="page-card" loading={loading}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="page-title">
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            新增部门
          </Button>
        </div>

        {treeData.length === 0 && !loading ? (
          <Empty description="暂无组织架构数据，请先新增部门" style={{ padding: '60px 0' }} />
        ) : (
          <div className="org-tree-container">
            {treeData.map((node) => (
              <OrgNodeCard
                key={node.id || node.nodeName}
                node={node}
                depth={0}
                membersMap={membersMap}
                onAdd={openCreate}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAddMember={handleOpenAssign}
                onRemoveMember={handleRemoveMember}
              />
            ))}
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
        width="40vw"
        initialHeight={400}
      >
        <Form form={form} layout="vertical" style={{ padding: '16px 0' }}>
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item name="nodeName" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input placeholder="例如：版房中心 / 外发供应链组" maxLength={50} />
          </Form.Item>
          <Form.Item name="parentId" label="上级部门">
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="不选则为顶级部门"
              options={departmentOptions}
              notFoundContent={departmentOptions.length === 0 ? '暂无部门，可先创建顶级部门' : '无匹配'}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="ownerType" label="内外标签" rules={[{ required: true, message: '请选择' }]}>
            <Select options={ownerTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} precision={0} placeholder="默认 0" style={{ width: '100%' }} />
          </Form.Item>
          {currentRecord?.pathNames && (
            <div style={{ color: 'var(--neutral-text-secondary)', padding: '0 16px', marginTop: 8 }}>
              当前路径：{currentRecord.pathNames}
            </div>
          )}
        </Form>
      </ResizableModal>

      {/* 分配成员弹窗 */}
      <ResizableModal
        open={assignModal.open}
        title={`为「${assignModal.node?.nodeName || ''}」添加成员`}
        onCancel={() => setAssignModal({ open: false, node: null })}
        footer={null}
        width="40vw"
        initialHeight={500}
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
            <Empty description="暂无可分配人员（所有活跃账号均已分配到本节点，或尚无账号）" style={{ padding: '32px 0' }} />
          ) : (
            <List
              size="small"
              dataSource={filteredAssignableUsers}
              style={{ maxHeight: 340, overflowY: 'auto' }}
              renderItem={(user) => (
                <List.Item
                  key={String(user.id)}
                  actions={[
                    <Button
                      key="assign"
                      type="primary"
                      size="small"
                      loading={assignActionLoading === String(user.id)}
                      onClick={() => handleAssignUser(String(user.id))}
                    >
                      分配
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />}
                    title={<span>{user.name || user.username}</span>}
                    description={
                      <span style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
                        {user.username}
                        {user.orgUnitId ? <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>已在其他组织</Tag> : null}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </ResizableModal>
    </Layout>
  );
};

/* ---------- 递归节点卡片 ---------- */

interface OrgNodeCardProps {
  node: OrganizationUnit;
  depth: number;
  membersMap: Record<string, User[]>;
  onAdd: (parent: OrganizationUnit) => void;
  onEdit: (record: OrganizationUnit) => void;
  onDelete: (record: OrganizationUnit) => void;
  onAddMember: (node: OrganizationUnit) => void;
  onRemoveMember: (userId: string, userName: string) => void;
}

const OrgNodeCard: React.FC<OrgNodeCardProps> = ({
  node, depth, membersMap, onAdd, onEdit, onDelete, onAddMember, onRemoveMember,
}) => {
  const isFactory = node.nodeType === 'FACTORY';
  const members = node.id ? (membersMap[String(node.id)] || []) : [];
  const children = node.children || [];
  const hasContent = members.length > 0 || children.length > 0;

  const nodeIcon = isFactory
    ? <BankOutlined style={{ color: '#1677ff' }} />
    : <ApartmentOutlined style={{ color: '#722ed1' }} />;

  const nodeTag = isFactory
    ? <Tag color="blue" style={{ marginLeft: 8 }}>工厂</Tag>
    : <Tag color="purple" style={{ marginLeft: 8 }}>部门</Tag>;

  const ownerTag = node.ownerType === 'INTERNAL'
    ? <Tag color="orange">内部</Tag>
    : node.ownerType === 'EXTERNAL'
      ? <Tag color="cyan">外部</Tag>
      : null;

  const header = (
    <div className="org-node-header">
      <div className="org-node-title">
        {nodeIcon}
        <span className="org-node-name">{node.nodeName}</span>
        {nodeTag}
        {ownerTag}
        {members.length > 0 && (
          <Badge count={members.length} style={{ backgroundColor: '#52c41a', marginLeft: 4 }} />
        )}
      </div>
      <Space size={4} className="org-node-actions" onClick={(e) => e.stopPropagation()}>
        {/* 所有节点都可以添加成员 */}
        <Tooltip title="添加成员">
          <Button type="text" size="small" icon={<UserAddOutlined />} onClick={() => onAddMember(node)} />
        </Tooltip>
        {/* 仅部门节点可以新增子部门 / 编辑 / 删除 */}
        {!isFactory && (
          <>
            <Tooltip title="新增下级部门">
              <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onAdd(node)} />
            </Tooltip>
            <Tooltip title="编辑">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(node)} />
            </Tooltip>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(node)} />
            </Tooltip>
          </>
        )}
      </Space>
    </div>
  );

  if (!hasContent) {
    return <div className="org-node-card org-node-leaf" style={{ marginLeft: depth > 0 ? 24 : 0 }}>{header}</div>;
  }

  return (
    <div className="org-node-card" style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      <Collapse
        ghost
        defaultActiveKey={depth < 2 ? ['content'] : []}
        items={[{
          key: 'content',
          label: header,
          children: (
            <div className="org-node-body">
              {members.length > 0 && (
                <div className="org-members-section">
                  <div className="org-members-title">
                    <TeamOutlined /> 成员（{members.length}人）
                  </div>
                  <div className="org-members-grid">
                    {members.map((user) => (
                      <div key={user.id || user.username} className="org-member-item">
                        <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
                        <div className="org-member-info">
                          <span className="org-member-name">{user.name}</span>
                          <span className="org-member-role">{user.roleName || '—'}</span>
                        </div>
                        <Tooltip title="移出">
                          <Button
                            type="text"
                            size="small"
                            icon={<CloseOutlined />}
                            className="org-member-remove"
                            onClick={() => onRemoveMember(String(user.id), user.name || user.username || '')}
                          />
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {children.map((child) => (
                <OrgNodeCard
                  key={child.id || child.nodeName}
                  node={child}
                  depth={depth + 1}
                  membersMap={membersMap}
                  onAdd={onAdd}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddMember={onAddMember}
                  onRemoveMember={onRemoveMember}
                />
              ))}
            </div>
          ),
        }]}
      />
    </div>
  );
};

export default OrganizationTreePage;
