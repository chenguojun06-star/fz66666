import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit } from '@/types/system';
import { App, Button, Card, Form, Input, Modal, Select, Space, Tag, Tree } from 'antd';
import { ApartmentOutlined, PlusOutlined } from '@ant-design/icons';

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [currentRecord, setCurrentRecord] = useState<OrganizationUnit | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
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
  }, [message]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const departmentOptions = useMemo(
    () => departments.map((item) => ({ value: item.id, label: item.pathNames || item.nodeName })),
    [departments]
  );

  const openCreate = (parent?: OrganizationUnit) => {
    setDialogMode('create');
    setCurrentRecord(parent || null);
    form.setFieldsValue({
      nodeName: '',
      parentId: parent?.id,
      ownerType: parent?.ownerType || 'NONE',
      sortOrder: 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (record: OrganizationUnit) => {
    setDialogMode('edit');
    setCurrentRecord(record);
    form.setFieldsValue({
      id: record.id,
      nodeName: record.nodeName,
      parentId: record.parentId,
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
      content: '仅允许删除没有子节点的部门。请输入操作原因后确认。',
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
      const payload = {
        ...values,
        nodeType: 'DEPARTMENT',
        status: 'active',
      };
      if (dialogMode === 'edit') {
        await organizationApi.update(payload);
      } else {
        await organizationApi.create(payload);
      }
      message.success(dialogMode === 'edit' ? '部门更新成功' : '部门创建成功');
      closeDialog();
      await loadData();
    } catch (error: any) {
      message.error(error?.message || '组织保存失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const toTreeNodes = (nodes: OrganizationUnit[]): any[] =>
    nodes.map((item) => ({
      key: item.id || item.nodeName,
      title: (
        <Space size={8} wrap>
          <span>{item.nodeName}</span>
          {item.nodeType === 'FACTORY' ? <Tag color="blue">工厂</Tag> : <Tag color="geekblue">部门</Tag>}
          {item.ownerType === 'INTERNAL' ? <Tag color="orange">内部</Tag> : null}
          {item.ownerType === 'EXTERNAL' ? <Tag color="purple">外部</Tag> : null}
          {item.nodeType === 'DEPARTMENT' ? (
            <Space size={4}>
              <Button type="link" size="small" onClick={() => openCreate(item)}>新增下级</Button>
              <Button type="link" size="small" onClick={() => openEdit(item)}>编辑</Button>
              <Button type="link" size="small" danger onClick={() => handleDelete(item)}>删除</Button>
            </Space>
          ) : null}
        </Space>
      ),
      children: toTreeNodes(item.children || []),
    }));

  return (
    <Layout>
      <Card className="page-card" loading={loading}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="page-title">组织架构</h2>
            <div style={{ color: 'var(--neutral-text-secondary)', marginTop: 4 }}>
              部门统一挂组织树，工厂节点自动跟随供应商管理同步。
            </div>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            新增部门
          </Button>
        </div>

        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Tag color="geekblue">部门</Tag>
            <Tag color="blue">工厂</Tag>
            <Tag color="orange">内部</Tag>
            <Tag color="purple">外部</Tag>
          </Space>
        </Card>

        <Tree
          showIcon
          defaultExpandAll
          treeData={toTreeNodes(treeData)}
          icon={<ApartmentOutlined />}
        />
      </Card>

      <Modal
        open={dialogOpen}
        title={dialogMode === 'edit' ? '编辑部门' : '新增部门'}
        onCancel={closeDialog}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="nodeName" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input placeholder="例如：版房中心 / 外发供应链组" maxLength={50} />
          </Form.Item>
          <Form.Item name="parentId" label="上级部门">
            <Select allowClear placeholder="顶级部门可留空" options={departmentOptions} />
          </Form.Item>
          <Form.Item name="ownerType" label="内外标签" rules={[{ required: true, message: '请选择标签' }]}>
            <Select options={ownerTypeOptions} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <Input type="number" placeholder="默认 0" />
          </Form.Item>
          {currentRecord?.pathNames ? (
            <div style={{ color: 'var(--neutral-text-secondary)' }}>当前路径：{currentRecord.pathNames}</div>
          ) : null}
        </Form>
      </Modal>
    </Layout>
  );
};

export default OrganizationTreePage;
