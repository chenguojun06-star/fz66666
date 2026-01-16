import React, { useMemo, useState, useEffect } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Select, Space, Spin, Tabs, Tag, Tree, Form, Row, Col, message } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, CheckOutlined, CloseOutlined, SettingOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import { Role, User as UserType, UserQueryParams } from '../../types/system';
import api, { requestWithPathFallback } from '../../utils/api';
import { formatDateTime } from '../../utils/datetime';
import './styles.css';

const { Option } = Select;

const UserList: React.FC = () => {
  const [form] = Form.useForm();
  // 状态管理
  const [visible, setVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [queryParams, setQueryParams] = useState<UserQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [userList, setUserList] = useState<UserType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [activeEditTab, setActiveEditTab] = useState<'base' | 'perm'>('base');

  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);

  const [permTree, setPermTree] = useState<any[]>([]);
  const [permCheckedKeys, setPermCheckedKeys] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  // 表单验证规则
  const formRules = {
    username: [
      { required: true, message: '请输入用户名', trigger: ['change', 'blur'] },
      { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: ['change', 'blur'] }
    ],
    name: [
      { required: true, message: '请输入姓名', trigger: ['change', 'blur'] },
      { max: 20, message: '姓名长度不超过 20 个字符', trigger: ['change', 'blur'] }
    ],
    password: [
      { required: !currentUser, message: '请输入密码', trigger: ['change', 'blur'] },
      { min: 6, max: 20, message: '密码长度在 6 到 20 个字符', trigger: ['change', 'blur'] }
    ],
    roleId: [
      { required: true, message: '请选择角色', trigger: ['change', 'blur'] }
    ],
    permissionRange: [
      { required: true, message: '请选择权限范围', trigger: ['change', 'blur'] }
    ],
    status: [
      { required: true, message: '请选择状态', trigger: ['change', 'blur'] }
    ],
    phone: [
      { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: ['change', 'blur'] }
    ],
    email: [
      { type: 'email' as const, message: '请输入正确的邮箱地址', trigger: ['change', 'blur'] }
    ]
  };

  const fetchRoleOptions = async () => {
    setRoleOptionsLoading(true);
    try {
      const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, {
        params: {
          page: 1,
          pageSize: 1000,
        },
      });
      const result = response as any;
      if (result.code === 200) {
        setRoleOptions(Array.isArray(result.data?.records) ? result.data.records : []);
      } else {
        setRoleOptions([]);
      }
    } catch {
      setRoleOptions([]);
    } finally {
      setRoleOptionsLoading(false);
    }
  };

  // 获取用户列表
  const getUserList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/system/user/list', {
        params: {
          page: queryParams.page,
          pageSize: queryParams.pageSize,
          username: queryParams.username,
          name: queryParams.name,
          roleName: queryParams.roleName,
          status: queryParams.status
        }
      });
      // 响应拦截器返回的是统一结果对象，数据在返回体中
      const result = response as any;
      if (result.code === 200) {
        setUserList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取用户列表失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取用户列表
  useEffect(() => {
    getUserList();
  }, [queryParams]);

  useEffect(() => {
    fetchRoleOptions();
  }, []);

  const selectedRoleId = Form.useWatch('roleId', form);

  const selectedRoleName = useMemo(() => {
    const rid = String(selectedRoleId || '').trim();
    if (!rid) return '';
    const hit = roleOptions.find((r) => String(r.id) === rid);
    return hit?.roleName || '';
  }, [roleOptions, selectedRoleId]);

  const treeData = useMemo(() => {
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
    return mapNodes(permTree);
  }, [permTree]);

  const loadPermTreeAndChecked = async (roleId: string) => {
    const rid = String(roleId || '').trim();
    if (!rid) {
      setPermTree([]);
      setPermCheckedKeys([]);
      return;
    }
    setPermLoading(true);
    try {
      const [treeRes, idsRes] = await Promise.all([
        requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree'),
        requestWithPathFallback('get', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`),
      ]);
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
      if (treeResult.code === 200) {
        setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []);
      } else {
        setPermTree([]);
      }
      const idList: number[] = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setPermCheckedKeys(idList.map((id) => String(id)));
    } catch {
      message.error('加载权限失败');
      setPermTree([]);
      setPermCheckedKeys([]);
    } finally {
      setPermLoading(false);
    }
  };

  const savePerms = async () => {
    const rid = String(selectedRoleId || '').trim();
    if (!rid) {
      message.error('请先选择角色');
      return;
    }
    setPermSaving(true);
    try {
      const ids = permCheckedKeys.map((k) => Number(k)).filter((n) => Number.isFinite(n));
      const res = await requestWithPathFallback('put', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`, ids);
      const result = res as any;
      if (result.code === 200) {
        message.success('权限保存成功');
      } else {
        message.error(result.message || '权限保存失败');
      }
    } catch {
      message.error('权限保存失败');
    } finally {
      setPermSaving(false);
    }
  };

  // 打开弹窗
  const openDialog = (user?: UserType, initialTab: 'base' | 'perm' = 'base') => {
    setActiveEditTab(initialTab);
    setCurrentUser(user || null);
    if (user) {
      const next = {
        ...user,
        roleId: String((user as any).roleId ?? ''),
      };
      form.setFieldsValue(next);
    } else {
      form.resetFields();
      // 设置默认值
      form.setFieldsValue({
        permissionRange: 'all',
        status: 'active'
      });
    }
    setVisible(true);
  };

  // 关闭弹窗
  const closeDialog = () => {
    setVisible(false);
    setCurrentUser(null);
    setActiveEditTab('base');
    setPermTree([]);
    setPermCheckedKeys([]);
    form.resetFields();
  };

  // 获取状态配置
  const getStatusConfig = (status: UserType['status']) => {
    const statusMap = {
      active: { text: '启用', color: 'success', icon: <CheckOutlined /> },
      inactive: { text: '停用', color: 'error', icon: <CloseOutlined /> }
    };
    const resolved = (statusMap as any)[status];
    if (resolved) return resolved;
    return { text: '未知', color: 'default', icon: null };
  };

  // 获取权限范围文本
  const getPermissionRangeText = (range: string) => {
    const rangeMap = {
      all: '全部权限',
      style: '款号资料',
      production: '生产管理',
      finance: '财务管理',
      system: '系统设置'
    };
    return rangeMap[range as keyof typeof rangeMap] || range;
  };

  // 切换用户状态
  const toggleUserStatus = async (id: string, currentStatus: UserType['status']) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const response = await api.put('/system/user/status', null, {
        params: {
          id,
          status: newStatus
        }
      });
      const result = response as any;
      if (result.code === 200) {
        message.success('状态更新成功');
        // 更新本地状态
        setUserList(prev => prev.map(user =>
          user.id === id ? { ...user, status: newStatus } : user
        ));
      } else {
        message.error(result.message || '状态更新失败');
      }
    } catch (error: any) {
      message.error(error?.message || '状态更新失败');
    }
  };

  const applyRoleToUser = async (user: UserType, role: Role) => {
    const uid = String(user.id ?? '').trim();
    const rid = String(role.id ?? '').trim();
    if (!uid || !rid) {
      message.error('缺少人员或角色信息');
      return;
    }

    Modal.confirm({
      title: '一键授权',
      content: `将「${String(user.name || user.username || uid)}」的角色设置为「${String(role.roleName || rid)}」？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        const payload: any = {
          id: user.id,
          username: user.username,
          name: user.name,
          roleId: Number(role.id),
          roleName: role.roleName,
          permissionRange: (user as any).permissionRange,
          status: user.status,
          phone: user.phone,
          email: user.email,
        };
        const response = await api.put('/system/user', payload);
        const result = response as any;
        if (result.code === 200) {
          message.success('授权成功');
          getUserList();
          return;
        }
        message.error(result.message || '授权失败');
        throw new Error('grant failed');
      },
    });
  };

  // 表单提交
  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      let response;
      if (currentUser?.id) {
        // 编辑用户
        response = await api.put('/system/user', { ...values, id: currentUser.id });
      } else {
        // 新增用户
        response = await api.post('/system/user', values);
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(currentUser?.id ? '编辑人员成功' : '新增人员成功');
        // 关闭弹窗
        closeDialog();
        // 刷新用户列表
        getUserList();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      // 处理表单验证错误
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'roleName',
      key: 'roleName',
      width: 100,
    },
    {
      title: '权限范围',
      dataIndex: 'permissionRange',
      key: 'permissionRange',
      width: 120,
      render: (range: string) => getPermissionRangeText(range),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: UserType['status']) => {
        const cfg = getStatusConfig(status);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 150,
      render: (value: string) => value || '-',
    },
    {
      title: '最后登录时间',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '最后登录IP',
      dataIndex: 'lastLoginIp',
      key: 'lastLoginIp',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_: any, record: UserType) => {
        const roleItems: MenuProps['items'] = (() => {
          const items: MenuProps['items'] = [];
          for (const r of roleOptions) {
            const rid = String(r.id ?? '').trim();
            if (!rid) continue;
            items.push({
              key: rid,
              label: `设为：${r.roleName}`,
              onClick: () => applyRoleToUser(record, r),
            });
          }
          if (!items.length) {
            items.push({
              key: 'empty',
              label: roleOptionsLoading ? '角色加载中…' : '暂无可用角色',
              disabled: true,
            });
          }
          return items;
        })();

        const toggleLabel = record.status === 'active' ? '停用' : '启用';

        return (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                icon: <EditOutlined />,
                onClick: () => openDialog(record, 'base'),
                primary: true,
              },
              {
                key: 'perm',
                label: '权限',
                title: '权限',
                icon: <SettingOutlined />,
                onClick: () => openDialog(record, 'perm'),
                primary: true,
              },
              {
                key: 'grant',
                label: '一键授权',
                disabled: roleOptionsLoading || !roleOptions.length,
                children: roleItems,
              },
              {
                key: 'toggle',
                label: toggleLabel,
                danger: record.status === 'active',
                onClick: () => toggleUserStatus(record.id!, record.status),
              },
            ]}
          />
        );
      },
    },
  ];

  useEffect(() => {
    if (!visible) return;
    const rid = String(selectedRoleId || '').trim();
    if (!rid) {
      setPermTree([]);
      setPermCheckedKeys([]);
      return;
    }
    loadPermTreeAndChecked(rid);
  }, [selectedRoleId, visible]);

  return (
    <Layout>
      <div className="system-user-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">人员管理</h2>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
              新增人员
            </Button>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form layout="inline" size="small">
              <Form.Item label="用户名">
                <Input
                  placeholder="请输入用户名"
                  onChange={(e) => setQueryParams({ ...queryParams, username: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="姓名">
                <Input
                  placeholder="请输入姓名"
                  onChange={(e) => setQueryParams({ ...queryParams, name: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="角色">
                <Select
                  placeholder="请选择角色"
                  onChange={(value) => setQueryParams({ ...queryParams, roleName: value })}
                  style={{ width: 120 }}
                  loading={roleOptionsLoading}
                >
                  <Option value="">全部</Option>
                  {roleOptions.map((r) => (
                    <Option key={String(r.id)} value={r.roleName}>{r.roleName}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams({ ...queryParams, status: value })}
                  style={{ width: 100 }}
                >
                  <Option value="">全部</Option>
                  <Option value="active">启用</Option>
                  <Option value="inactive">停用</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => setQueryParams(prev => ({ ...prev, page: 1 }))}>
                    查询
                  </Button>
                  <Button onClick={() => setQueryParams({ page: 1, pageSize: 10 })}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={userList}
            rowKey="id"
            loading={loading}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total: total,
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
            }}
          />
        </Card>

        {/* 用户编辑弹窗 */}
        <ResizableModal
          title={currentUser ? '编辑人员' : '新增人员'}
          open={visible}
          onCancel={closeDialog}
          onOk={handleSubmit}
          okText="保存"
          cancelText="取消"
          width="60vw"
          confirmLoading={submitLoading}
        >
          <Form form={form} layout="vertical" autoComplete="off">
            <Tabs
              activeKey={activeEditTab}
              onChange={(k) => setActiveEditTab(k as any)}
              items={[
                {
                  key: 'base',
                  label: '基本信息',
                  children: (
                    <div>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="username" label="用户名" rules={formRules.username}>
                            <Input placeholder="请输入用户名" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="name" label="姓名" rules={formRules.name}>
                            <Input placeholder="请输入姓名" />
                          </Form.Item>
                        </Col>
                        {!currentUser && (
                          <Col span={8}>
                            <Form.Item name="password" label="密码" rules={formRules.password}>
                              <Input.Password placeholder="请输入密码" />
                            </Form.Item>
                          </Col>
                        )}
                      </Row>

                      <Row gutter={16} className="mt-sm">
                        <Col span={8}>
                          <Form.Item name="roleId" label="角色" rules={formRules.roleId}>
                            <Select placeholder="请选择角色" loading={roleOptionsLoading}>
                              <Option value="">请选择角色</Option>
                              {roleOptions.map((r) => (
                                <Option key={String(r.id)} value={String(r.id)}>{r.roleName}</Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="permissionRange" label="权限范围" rules={formRules.permissionRange}>
                            <Select placeholder="请选择权限范围">
                              <Option value="">请选择权限范围</Option>
                              <Option value="all">全部权限</Option>
                              <Option value="style">款号资料</Option>
                              <Option value="production">生产管理</Option>
                              <Option value="finance">财务管理</Option>
                              <Option value="system">系统设置</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="status" label="状态" rules={formRules.status}>
                            <Select placeholder="请选择状态">
                              <Option value="active">启用</Option>
                              <Option value="inactive">停用</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16} className="mt-sm">
                        <Col span={12}>
                          <Form.Item name="phone" label="手机号" rules={formRules.phone}>
                            <Input placeholder="请输入手机号" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="email" label="邮箱" rules={formRules.email}>
                            <Input placeholder="请输入邮箱" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                {
                  key: 'perm',
                  label: '权限配置',
                  children: (
                    <div className="user-perm-panel">
                      <Alert
                        type="info"
                        showIcon
                        title="权限基于角色生效"
                        description="此处修改会影响所有使用该角色的人员。若只想调整个人权限，建议新增一个角色再分配给该人员。"
                      />

                      <div className="user-perm-toolbar">
                        <Space wrap>
                          <span className="user-perm-role">当前角色：{selectedRoleName || '未选择'}</span>
                          <Button
                            disabled={!String(selectedRoleId || '').trim()}
                            loading={permLoading}
                            onClick={() => loadPermTreeAndChecked(String(selectedRoleId || ''))}
                          >
                            刷新权限
                          </Button>
                          <Button
                            type="primary"
                            disabled={!String(selectedRoleId || '').trim()}
                            loading={permSaving}
                            onClick={savePerms}
                          >
                            保存权限
                          </Button>
                        </Space>
                      </div>

                      <div className="user-perm-tree">
                        {permLoading ? (
                          <div className="user-perm-loading">
                            <Spin />
                          </div>
                        ) : treeData.length ? (
                          <Tree
                            checkable
                            defaultExpandAll
                            checkedKeys={permCheckedKeys}
                            onCheck={(keys) => setPermCheckedKeys((Array.isArray(keys) ? keys : (keys as any).checked) as string[])}
                            treeData={treeData}
                          />
                        ) : (
                          <Empty description={String(selectedRoleId || '').trim() ? '暂无可配置权限' : '请先选择角色'} />
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </Form>
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default UserList;
