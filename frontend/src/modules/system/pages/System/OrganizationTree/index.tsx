import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit, User } from '@/types/system';
import { App, Avatar, Badge, Button, Card, Collapse, Empty, Form, Input, InputNumber, Select, Space, Spin, Tag, Tooltip } from 'antd';
import {
  ApartmentOutlined,
  BankOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tree, departmentList, members] = await Promise.all([
        organizationApi.tree(),
        organizationApi.departments(),
        organizationApi.members(),
      ]);
      setTreeData(Array.isArray(tree) ? tree : []);
      setDepartments(Array.isArray(departmentList) ? departmentList : []);
      setMembersMap(members && typeof members === 'object' ? members : {});
    } catch (error: any) {
      message.error(error?.message || '组织架构加载失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadData(); }, [loadData]);

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
      content: '仅允许删除没有子节点的部门。',
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

  const totalMembers = useMemo(() => {
    return Object.values(membersMap).reduce((sum, list) => sum + list.length, 0);
  }, [membersMap]);

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
              />
            ))}
          </div>
        )}
      </Card>

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
              placeholder="顶级部门可留空"
              options={departmentOptions}
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
}

const OrgNodeCard: React.FC<OrgNodeCardProps> = ({ node, depth, membersMap, onAdd, onEdit, onDelete }) => {
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
