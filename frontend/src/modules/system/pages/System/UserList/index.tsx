import React, { useMemo, useState, useEffect } from 'react';
import { Alert, App, Button, Card, Checkbox, Empty, Input, Select, Space, Spin, Tabs, Tag, Form, Row, Col } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, CheckOutlined, CloseOutlined, SettingOutlined, FileSearchOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { Role, User as UserType, UserQueryParams } from '@/types/system';
import api, { requestWithPathFallback } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import './styles.css';

const { Option } = Select;

const UserList: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  // 状态管理
  const { isMobile, modalWidth } = useViewport();
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

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const [activeEditTab, setActiveEditTab] = useState<'base' | 'perm'>('base');

  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);

  const [permTree, setPermTree] = useState<any[]>([]);
  const [permCheckedIds, setPermCheckedIds] = useState<Set<number>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

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
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        setRoleOptions(Array.isArray(result.data?.records) ? result.data.records : []);
      } else {
        setRoleOptions([]);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      setRoleOptions([]);
    } finally {
      setRoleOptionsLoading(false);
    }
  };

  // 获取待审批用户数量
  const fetchPendingUserCount = async () => {
    try {
      const response = await api.get('/system/user/pending', {
        params: { page: 1, pageSize: 1 }
      });
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        const count = result.data?.total || 0;
        if (count > pendingUserCount && pendingUserCount > 0) {
          // 有新的待审批用户
          message.info({
            content: `有 ${count - pendingUserCount} 个新用户待审批`,
            duration: 5,
            onClick: () => {
              window.location.href = '/system/user-approval';
            }
          });
        }
        setPendingUserCount(count);
      }
    } catch (error) {
      console.error('获取待审批用户数量失败', error);
    }
  };

  // 获取用户列表
  const getUserList = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/system/user/list', {
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
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        setUserList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取用户列表失败');
      }
    } catch (error: unknown) {
      message.error(error?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取用户列表
  useEffect(() => {
    getUserList();
    fetchRoleOptions();
    fetchPendingUserCount(); // 初始加载待审批用户数量

    // 每30秒检查一次待审批用户数量
    const interval = setInterval(() => {
      fetchPendingUserCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [queryParams]);

  // 实时同步：60秒自动轮询更新用户列表
  // 用户管理数据更新频率较低
  // 注意：普通用户无权访问此接口，会返回403
  useSync(
    'user-list',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/system/user/list', {
          params: queryParams,
        });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error: unknown) {
        // 403权限错误不输出到控制台（普通用户正常情况）
        const status = error?.response?.status || error?.status;
        if (status !== 403) {
          console.error('[实时同步] 获取用户列表失败', error);
        }
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setUserList(newData.records);
        setTotal(newData.total);
        // console.log('[实时同步] 用户列表数据已更新', {
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length
        // });
      }
    },
    {
      interval: 60000, // 60秒轮询
      enabled: !loading && !visible,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 用户列表同步错误', error)
    }
  );

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

  const permissionsByModule = useMemo(() => {
    // 收集所有顶级模块及其子权限
    const modules: Array<{
      moduleId: number;
      moduleName: string;
      permissions: unknown[];
    }> = [];

    const collectPermissions = (node: unknown) => {
      const allPerms: unknown[] = [];

      // 递归收集所有子权限
      const collectChildren = (n: any) => {
        if (!n) return;

        // 添加当前节点（如果不是顶级模块）
        if (n.parentId && n.parentId !== 0) {
          allPerms.push({
            id: n.id,
            name: n.permissionName,
            type: n.permissionType,
          });
        }

        // 递归处理子节点
        if (Array.isArray(n.children)) {
          for (const child of n.children) {
            collectChildren(child);
          }
        }
      };

      collectChildren(node);
      return allPerms;
    };

    // 遍历顶级节点
    for (const topNode of permTree || []) {
      const perms = collectPermissions(topNode);

      modules.push({
        moduleId: topNode.id,
        moduleName: topNode.permissionName,
        permissions: perms,
      });
    }

    return modules;
  }, [permTree]);

  const loadPermTreeAndChecked = async (roleId: string) => {
    const rid = String(roleId || '').trim();
    if (!rid) {
      setPermTree([]);
      setPermCheckedIds(new Set());
      return;
    }
    setPermLoading(true);
    try {
      const [treeRes, idsRes] = await Promise.all([
        requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree'),
        requestWithPathFallback('get', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`),
      ]);
      const treeResult = treeRes as Record<string, unknown>;
      const idsResult = idsRes as Record<string, unknown>;
      if (treeResult.code === 200) {
        setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []);
      } else {
        setPermTree([]);
      }
      const idList: number[] = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setPermCheckedIds(new Set(idList));
    } catch {
    // Intentionally empty
      // 忽略错误
      message.error('加载权限失败');
      setPermTree([]);
      setPermCheckedIds(new Set());
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
    openRemarkModal('确认保存权限', '确认保存', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(permCheckedIds.values());
        const res = await requestWithPathFallback(
          'put',
          `/system/role/${rid}/permission-ids`,
          `/auth/role/${rid}/permission-ids`,
          { permissionIds: ids, remark }
        );
        const result = res as Record<string, unknown>;
        if (result.code === 200) {
          message.success('权限保存成功');
        } else {
          message.error(result.message || '权限保存失败');
        }
      } catch {
    // Intentionally empty
      // 忽略错误
        message.error('权限保存失败');
      } finally {
        setPermSaving(false);
      }
    });
  };

  // 打开弹窗
  const openDialog = (user?: UserType, initialTab: 'base' | 'perm' = 'base') => {
    setActiveEditTab(initialTab);
    setCurrentUser(user || null);

    // 确保加载角色选项
    if (roleOptions.length === 0 && !roleOptionsLoading) {
      fetchRoleOptions();
    }

    if (user) {
      const next = {
        ...user,
        roleId: String((user as Record<string, unknown>).roleId ?? ''),
      };
      form.setFieldsValue(next);
    } else {
      form.resetFields();
      // 设置默认值
      form.setFieldsValue({
        permissionRange: 'all',
        status: 'active',
        approvalStatus: 'approved'
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
    setPermCheckedIds(new Set());
    form.resetFields();
  };

  const openRemarkModal = (
    title: string,
    okText: string,
    okButtonProps: unknown,
    onConfirm: (remark: string) => Promise<void>
  ) => {
    let remarkValue = '';
    modal.confirm({
      title,
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="操作原因">
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              onChange={(e) => {
                remarkValue = e.target.value;
              }}
            />
          </Form.Item>
        </Form>
      ),
      okText,
      cancelText: '取消',
      okButtonProps,
      onOk: async () => {
        const remark = String(remarkValue || '').trim();
        if (!remark) {
          message.error('请输入操作原因');
          return Promise.reject(new Error('请输入操作原因'));
        }
        await onConfirm(remark);
      },
    });
  };

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title);
    setLogVisible(true);
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', {
        params: { bizType, bizId },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setLogRecords(Array.isArray(result.data) ? result.data : []);
      } else {
        message.error(result.message || '获取日志失败');
        setLogRecords([]);
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取日志失败');
      setLogRecords([]);
    } finally {
      setLogLoading(false);
    }
  };

  // 获取状态配置
  const getStatusConfig = (status: UserType['status']) => {
    const statusMap = {
      active: { text: '启用', color: 'success', icon: <CheckOutlined /> },
      inactive: { text: '停用', color: 'error', icon: <CloseOutlined /> }
    };
    const resolved = (statusMap as Record<string, unknown>)[status];
    if (resolved) return resolved;
    return { text: '未知', color: 'default', icon: null };
  };

  // 获取权限范围文本 (数据可见性)
  const getPermissionRangeText = (range: string) => {
    const rangeMap: Record<string, string> = {
      all: '查看全部',
      team: '查看团队',
      own: '仅看自己',
      // 兼容旧数据
      style: '款号资料',
      production: '生产管理',
      finance: '财务管理',
      system: '系统设置'
    };
    return rangeMap[range] || range || '未设置';
  };

  // 获取权限范围标签颜色
  const getPermissionRangeColor = (range: string) => {
    const colorMap: Record<string, string> = {
      all: 'blue',
      team: 'green',
      own: 'orange',
    };
    return colorMap[range] || 'default';
  };

  // 切换用户状态
  const toggleUserStatus = async (id: string, currentStatus: UserType['status']) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    openRemarkModal('确认状态变更', '确认', undefined, async (remark) => {
      try {
        const response = await api.put('/system/user/status', null, {
          params: {
            id,
            status: newStatus,
            remark,
          }
        });
        const result = response as Record<string, unknown>;
        if (result.code === 200) {
          message.success('状态更新成功');
          setUserList(prev => prev.map(user =>
            user.id === id ? { ...user, status: newStatus } : user
          ));
        } else {
          message.error(result.message || '状态更新失败');
        }
      } catch (error: unknown) {
        message.error(error?.message || '状态更新失败');
      }
    });
  };

  const applyRoleToUser = async (user: UserType, role: Role) => {
    const uid = String(user.id ?? '').trim();
    const rid = String(role.id ?? '').trim();
    if (!uid || !rid) {
      message.error('缺少人员或角色信息');
      return;
    }

    openRemarkModal('一键授权', '确定', undefined, async (remark) => {
      const payload: unknown = {
        id: user.id,
        username: user.username,
        name: user.name,
        roleId: Number(role.id),
        roleName: role.roleName,
        permissionRange: (user as Record<string, unknown>).permissionRange,
        status: user.status,
        phone: user.phone,
        email: user.email,
        operationRemark: remark,
      };
      const response = await api.put('/system/user', payload);
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        message.success('授权成功');
        getUserList();
        return;
      }
      message.error(result.message || '授权失败');
      throw new Error('grant failed');
    });
  };

  // 表单提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const submit = async (remark?: string) => {
        setSubmitLoading(true);
        try {
          let response;
          if (currentUser?.id) {
            response = await api.put('/system/user', { ...values, id: currentUser.id, operationRemark: remark });
          } else {
            response = await api.post('/system/user', values);
          }

          const result = response as Record<string, unknown>;
          if (result.code === 200) {
            message.success(currentUser?.id ? '编辑人员成功' : '新增人员成功');
            closeDialog();
            getUserList();
          } else {
            message.error(result.message || '保存失败');
          }
        } finally {
          setSubmitLoading(false);
        }
      };

      if (currentUser?.id) {
        openRemarkModal('确认保存', '确认保存', undefined, submit);
        return;
      }

      await submit();
    } catch (error) {
      // 处理表单验证错误
      if ((error as Record<string, unknown>).errorFields) {
        const firstError = (error as Record<string, unknown>).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    }
  };

  // 表格列定义
  const logColumns = [
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
      title: '数据权限',
      dataIndex: 'permissionRange',
      key: 'permissionRange',
      width: 120,
      render: (range: string) => (
        <Tag color={getPermissionRangeColor(range)}>
          {getPermissionRangeText(range)}
        </Tag>
      ),
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
            maxInline={2}
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
                key: 'log',
                label: '日志',
                title: '日志',
                icon: <FileSearchOutlined />,
                onClick: () => openLogModal('user', String(record.id || ''), `人员 ${record.name || record.username} 操作日志`),
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
      setPermCheckedIds(new Set());
      return;
    }
    loadPermTreeAndChecked(rid);
  }, [selectedRoleId, visible]);

  return (
    <Layout>
      <div>
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">人员管理</h2>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
              新增人员
            </Button>
          </div>

          {/* 待审批用户提醒 */}
          {pendingUserCount > 0 && (
            <Alert
              message={`有 ${pendingUserCount} 个新用户待审批`}
              description="点击前往审批页面，为新用户分配角色和权限"
              type="info"
              showIcon
              closable
              action={
                <Button
                  size="small"
                  type="primary"
                  onClick={() => window.location.href = '/system/user-approval'}
                >
                  立即审批
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          )}

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
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
          confirmLoading={submitLoading}
        >
          <Form form={form} layout="vertical" autoComplete="off">
            <Tabs
              activeKey={activeEditTab}
              onChange={(k) => setActiveEditTab(k as Record<string, unknown>)}
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
                              {roleOptions.map((r) => (
                                <Option key={String(r.id)} value={String(r.id)}>
                                  {r.roleName || '未命名角色'}
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="permissionRange" label="数据权限" rules={formRules.permissionRange}>
                            <Select placeholder="请选择数据权限">
                              <Option value="all">
                                <Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>
                                查看所有人数据
                              </Option>
                              <Option value="team">
                                <Tag color="green" style={{ marginRight: 4 }}>团队</Tag>
                                查看团队数据
                              </Option>
                              <Option value="own">
                                <Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>
                                仅查看自己数据
                              </Option>
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
                        ) : permissionsByModule.length ? (
                          <div style={{
                            marginTop: 12,
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            alignItems: 'flex-start'
                          }}>
                            {permissionsByModule.map((module) => (
                              <div
                                key={module.moduleId}
                                style={{
                                  minWidth: 120,
                                  maxWidth: 160,
                                  border: '1px solid var(--table-border-color)',
                                  padding: '2px 6px'
                                }}
                              >
                                {/* 模块复选框 */}
                                <div style={{ lineHeight: '20px' }}>
                                  <Checkbox
                                    checked={permCheckedIds.has(module.moduleId)}
                                    onChange={(e) => {
                                      const next = new Set(permCheckedIds);
                                      if (e.target.checked) {
                                        next.add(module.moduleId);
                                        module.permissions.forEach(p => next.add(p.id));
                                      } else {
                                        next.delete(module.moduleId);
                                        module.permissions.forEach(p => next.delete(p.id));
                                      }
                                      setPermCheckedIds(next);
                                    }}
                                    style={{ fontSize: 12 }}
                                  >
                                    {module.moduleName}
                                  </Checkbox>
                                </div>
                                {/* 子权限列表 */}
                                {module.permissions.map((perm) => (
                                  <div key={perm.id} style={{ lineHeight: '20px' }}>
                                    <Checkbox
                                      checked={permCheckedIds.has(perm.id)}
                                      onChange={(e) => {
                                        const next = new Set(permCheckedIds);
                                        if (e.target.checked) {
                                          next.add(perm.id);
                                        } else {
                                          next.delete(perm.id);
                                        }
                                        setPermCheckedIds(next);
                                      }}
                                      style={{ fontSize: 12 }}
                                    >
                                      {perm.name}
                                    </Checkbox>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
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
          <ResizableTable
            columns={logColumns as Record<string, unknown>}
            dataSource={logRecords}
            rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
            loading={logLoading}
            pagination={false}
            scroll={{ x: 'max-content', y: isMobile ? 320 : 420 }}
          />
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default UserList;
