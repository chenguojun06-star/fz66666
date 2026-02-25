import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Card, Checkbox, Empty, Input, Select, Space, Spin, Tabs, Tag, Form, Row, Col } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, CloseOutlined, QrcodeOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import { Role, User as UserType, UserQueryParams } from '@/types/system';
import api, { requestWithPathFallback } from '@/utils/api';
import tenantService from '@/services/tenantService';
import { useAuth } from '@/utils/AuthContext';
import { formatDateTime } from '@/utils/datetime';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import './styles.css';

const { Option } = Select;

const UserList: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user, isSuperAdmin, isTenantOwner } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const canManageUsers = isSuperAdmin || isTenantOwner;
  // 状态管理
  const { isMobile, modalWidth } = useViewport();
  const userModal = useModal<UserType>();
  const logModal = useModal();
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
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  // 收款账户管理
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<{ id: string; name: string }>({ id: '', name: '' });

  // 邀请二维码
  const [inviteQr, setInviteQr] = useState<{ open: boolean; loading: boolean; qrBase64?: string; expiresAt?: string }>({
    open: false, loading: false,
  });

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
      { required: !userModal.data, message: '请输入密码', trigger: ['change', 'blur'] },
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
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listTenantRoles(tenantId);
        const result = response as any;
        if (result.code === 200) {
          setRoleOptions(Array.isArray(result.data) ? result.data : []);
        } else {
          setRoleOptions([]);
        }
      } else {
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
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listPendingRegistrations({ page: 1, pageSize: 1 });
        const result = response as any;
        if (result.code === 200) {
          const count = result.data?.total || 0;
          setPendingUserCount(count);
        }
        return;
      }

      const response = await api.get('/system/user/pending', {
        params: { page: 1, pageSize: 1 }
      });
      const result = response as any;
      if (result.code === 200) {
        const count = result.data?.total || 0;
        if (count > pendingUserCount && pendingUserCount > 0) {
          // 有新的待审批用户
          message.info({
            content: `有 ${count - pendingUserCount} 个新用户待审批`,
            duration: 5,
            onClick: () => {
              navigate('/system/user-approval');
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
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listSubAccounts({
          page: queryParams.page,
          pageSize: queryParams.pageSize,
          name: queryParams.name,
          roleName: queryParams.roleName,
        });
        const result = response as any;
        if (result.code === 200) {
          setUserList(result.data?.records || []);
          setTotal(result.data?.total || 0);
        } else {
          message.error(result.message || '获取用户列表失败');
        }
      } else {
        const response = await api.get<{ code: number; data: { records: any[]; total: number } }>('/system/user/list', {
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
      }
    } catch (error: any) {
      message.error(error?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 🔐 用户身份变化时清空旧数据（防止跨租户数据残留）
  const currentUserId = user?.id;
  useEffect(() => {
    setUserList([]);
    setTotal(0);
  }, [currentUserId]);

  // 页面加载时获取用户列表（依赖用户身份 + 查询参数）
  useEffect(() => {
    if (!currentUserId) return; // 用户未加载完成时不请求
    getUserList();
    fetchRoleOptions();
    fetchPendingUserCount(); // 初始加载待审批用户数量

    // 每30秒检查一次待审批用户数量
    const interval = setInterval(() => {
      fetchPendingUserCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [queryParams, currentUserId]);

  // 实时同步：60秒自动轮询更新用户列表
  // 用户管理数据更新频率较低
  // 注意：普通用户无权访问此接口，会返回403
  useSync(
    'user-list',
    async () => {
      try {
        const tenantId = user?.tenantId ? Number(user.tenantId) : null;
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.listSubAccounts({
            page: queryParams.page,
            pageSize: queryParams.pageSize,
            name: queryParams.name,
            roleName: queryParams.roleName,
          });
          if (response.code === 200) {
            return {
              records: response.data?.records || [],
              total: response.data?.total || 0
            };
          }
          return null;
        }

        const response = await api.get<{ code: number; data: { records: any[]; total: number } }>('/system/user/list', {
          params: queryParams,
        });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error: any) {
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
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length
        // });
      }
    },
    {
      interval: 60000, // 60秒轮询
      enabled: !loading && !userModal.visible,
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
      permissions: any[];
    }> = [];

    const collectPermissions = (node: any) => {
      const allPerms: any[] = [];

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
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
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
        const result = res as any;
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
    userModal.open(user || null);

    // 确保加载角色选项
    if (roleOptions.length === 0 && !roleOptionsLoading) {
      fetchRoleOptions();
    }

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
        status: 'active',
        approvalStatus: 'approved'
      });
    }
  };

  // 关闭弹窗
  const closeDialog = () => {
    userModal.close();
    setActiveEditTab('base');
    setPermTree([]);
    setPermCheckedIds(new Set());
    form.resetFields();
  };

  /** 生成邀请员工二维码 */
  const handleGenerateInvite = async () => {
    setInviteQr({ open: true, loading: true });
    try {
      const resp = await api.post('/api/wechat/mini-program/invite/generate', {});
      const result = resp?.data;
      if (result?.code === 200 && result?.data) {
        setInviteQr({ open: true, loading: false, qrBase64: result.data.qrCodeBase64, expiresAt: result.data.expiresAt });
      } else {
        message.error('生成邀请码失败：' + (result?.message || '未知错误'));
        setInviteQr({ open: false, loading: false });
      }
    } catch (e: any) {
      message.error('生成邀请码失败');
      setInviteQr({ open: false, loading: false });
    }
  };

  const openRemarkModal = (
    title: string,
    okText: string,
    okButtonProps: any,
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
      okButtonProps: okButtonProps as any,
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
    logModal.open();
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', {
        params: { bizType, bizId },
      });
      const result = res as any;
      if (result.code === 200) {
        setLogRecords(Array.isArray(result.data) ? result.data : []);
      } else {
        message.error(result.message || '获取日志失败');
        setLogRecords([]);
      }
    } catch (e: any) {
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
    const resolved = (statusMap as any)[status];
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
      style: '样衣开发',
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
        const tenantId = user?.tenantId ? Number(user.tenantId) : null;
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.updateSubAccount(Number(id), { status: newStatus, operationRemark: remark });
          const result = response as any;
          if (result.code === 200) {
            message.success('状态更新成功');
            setUserList(prev => prev.map(userItem =>
              userItem.id === id ? { ...userItem, status: newStatus } : userItem
            ));
          } else {
            message.error(result.message || '状态更新失败');
          }
          return;
        }

        const response = await api.put('/system/user/status', null, {
          params: {
            id,
            status: newStatus,
            remark,
          }
        });
        const result = response as any;
        if (result.code === 200) {
          message.success('状态更新成功');
          setUserList(prev => prev.map(userItem =>
            userItem.id === id ? { ...userItem, status: newStatus } : userItem
          ));
        } else {
          message.error(result.message || '状态更新失败');
        }
      } catch (error: any) {
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
        operationRemark: remark,
      };
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.updateSubAccount(Number(uid), payload as any);
        const result = response as any;
        if (result.code === 200) {
          message.success('授权成功');
          getUserList();
          return;
        }
        message.error(result.message || '授权失败');
        throw new Error('grant failed');
      }

      const response = await api.put('/system/user', payload);
      const result = response as any;
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
          const tenantId = user?.tenantId ? Number(user.tenantId) : null;
          if (!isSuperAdmin && tenantId) {
            if (userModal.data?.id) {
              response = await tenantService.updateSubAccount(Number(userModal.data.id), { ...values, operationRemark: remark || null });
            } else {
              response = await tenantService.addSubAccount(values);
            }
          } else if (userModal.data?.id) {
            response = await api.put('/system/user', { ...values, id: userModal.data.id, operationRemark: remark || null });
          } else {
            response = await api.post('/system/user', values);
          }

          const result = response as any;
          if (result.code === 200) {
            message.success(userModal.data?.id ? '编辑人员成功' : '新增人员成功');
            closeDialog();
            getUserList();
          } else {
            message.error(result.message || '保存失败');
          }
        } finally {
          setSubmitLoading(false);
        }
      };

      if (userModal.data?.id) {
        openRemarkModal('确认保存', '确认保存', undefined, submit);
        return;
      }

      await submit();
    } catch (error) {
      // 处理表单验证错误
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
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
                onClick: () => openDialog(record, 'base'),
                primary: true,
              },
              {
                key: 'perm',
                label: '权限',
                title: '权限',
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
                key: 'account',
                label: '收款账户',
                title: '收款账户',
                onClick: () => {
                  setAccountUser({ id: String(record.id || ''), name: record.name || record.username || '' });
                  setAccountModalOpen(true);
                },
              },
              {
                key: 'log',
                label: '日志',
                title: '日志',
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
    if (!userModal.visible) return;
    const rid = String(selectedRoleId || '').trim();
    if (!rid) {
      setPermTree([]);
      setPermCheckedIds(new Set());
      return;
    }
    loadPermTreeAndChecked(rid);
  }, [selectedRoleId, userModal.visible]);

  return (
    <Layout>
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">人员管理</h2>
          </div>

          {/* 待审批用户提醒 */}
          {pendingUserCount > 0 && canManageUsers && (
            <Alert
              title={`有 ${pendingUserCount} 个新用户待审批`}
              description="点击前往审批页面，为新用户分配角色和权限"
              type="info"
              showIcon
              closable
              action={
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    navigate(isSuperAdmin ? '/system/user-approval' : '/system/tenant?tab=registrations');
                  }}
                >
                  立即审批
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
              <Space wrap size={12}>
                <Input
                  value={queryParams.username || ''}
                  onChange={(e) => setQueryParams({ ...queryParams, username: e.target.value, page: 1 })}
                  placeholder="搜索用户名/姓名"
                  allowClear
                  style={{ width: 220 }}
                />
                <Select
                  value={queryParams.status || ''}
                  onChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                  options={[
                    { label: '启用', value: 'active' },
                    { label: '停用', value: 'inactive' },
                  ]}
                  placeholder="状态"
                  allowClear
                  style={{ width: 140 }}
                />
                <Button type="primary" onClick={() => getUserList()}>
                  查询
                </Button>
                <Button onClick={() => {
                  setQueryParams({ page: 1, pageSize: queryParams.pageSize });
                }}>
                  重置
                </Button>
              </Space>
              {canManageUsers && (
                <Space>
                  <Button
                    icon={<QrcodeOutlined />}
                    onClick={handleGenerateInvite}
                  >
                    邀请员工
                  </Button>
                  <Button type="primary" onClick={() => openDialog()}>
                    新增用户
                  </Button>
                </Space>
              )}
            </div>
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
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
            }}
          />
        </Card>

        {/* 用户编辑弹窗 */}
        <ResizableModal
          title={userModal.data ? '编辑人员' : '新增人员'}
          open={userModal.visible}
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
              onChange={(k) => setActiveEditTab(k as 'base' | 'perm')}
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
                        {!userModal.data && (
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
                                  {r.roleName || '系统角色'}
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
                                        module.permissions.forEach((p: any) => next.add(p.id));
                                      } else {
                                        next.delete(module.moduleId);
                                        module.permissions.forEach((p: any) => next.delete(p.id));
                                      }
                                      setPermCheckedIds(next);
                                    }}
                                    style={{ fontSize: "var(--font-size-xs)" }}
                                  >
                                    {module.moduleName}
                                  </Checkbox>
                                </div>
                                {/* 子权限列表 */}
                                {module.permissions.map((perm: any) => (
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
                                      style={{ fontSize: "var(--font-size-xs)" }}
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
          open={logModal.visible}
          title={logTitle}
          onCancel={() => {
            logModal.close();
            setLogRecords([]);
          }}
          footer={null}
          width={modalWidth}
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
        >
          <ResizableTable
            columns={logColumns as any}
            dataSource={logRecords}
            rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
            loading={logLoading}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </ResizableModal>

        {/* 收款账户管理弹窗 */}
        <PaymentAccountManager
          open={accountModalOpen}
          ownerType="WORKER"
          ownerId={accountUser.id}
          ownerName={accountUser.name}
          onClose={() => setAccountModalOpen(false)}
        />

        {/* 邀请员工二维码弹窗 */}
        <ResizableModal
          title="邀请员工扫码绑定微信"
          open={inviteQr.open}
          onCancel={() => setInviteQr({ open: false, loading: false })}
          footer={null}
          defaultWidth="30vw"
          defaultHeight="50vh"
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {inviteQr.loading ? (
              <div style={{ padding: '48px 0' }}>
                <span>正在生成二维码...</span>
              </div>
            ) : inviteQr.qrBase64 ? (
              <>
                <img
                  src={inviteQr.qrBase64}
                  alt="邀请二维码"
                  style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }}
                />
                <div style={{ color: '#666', fontSize: 13 }}>
                  员工用微信扫码后，输入系统账号密码即可完成绑定
                </div>
                {inviteQr.expiresAt && (
                  <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                    有效期至：{inviteQr.expiresAt.replace('T', ' ').slice(0, 16)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#999', padding: '24px 0' }}>二维码生成失败，请重试</div>
            )}
          </div>
        </ResizableModal>

    </Layout>
  );
};

export default UserList;
