import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Alert, App, Button, Card, Form, Input, Select, Space, Tag } from 'antd';
import type { ButtonProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import { Role, RoleQueryParams } from '@/types/system';
import { getErrorMessage } from '@/types/api';
import api, { requestWithPathFallback } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import PermissionDialog from './PermissionDialog';
import './styles.css';
import { readPageSize } from '@/utils/pageSizeStore';
import { useDebouncedValue } from '@/hooks/usePerformance';

const RoleList: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const roleModal = useModal<Role>();
  const permDialogRef = useRef<{ open: (role: any) => void } | null>(null);
  const [queryParams, setQueryParams] = useState<RoleQueryParams>({ page: 1, pageSize: readPageSize(10) });

  const [roleNameInput, setRoleNameInput] = useState('');
  const debouncedRoleName = useDebouncedValue(roleNameInput, 300);
  useEffect(() => { if (debouncedRoleName !== (queryParams.roleName || '')) setQueryParams((prev) => ({ ...prev, roleName: debouncedRoleName, page: 1 })); }, [debouncedRoleName]);

  type RoleRecord = Role & Record<string, unknown>;
  type OperationLog = { id?: number | string; bizType?: string; bizId?: string; action?: string; operator?: string; remark?: string; createTime?: string };

  const [roleList, setRoleList] = useState<RoleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showSystemGuard = useMemo(() => isSmartFeatureEnabled('smart.system.guard.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => { if (!showSmartErrorNotice) return; setSmartError({ title, reason, code }); };

  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<OperationLog[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

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
    } catch (e: unknown) {
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
    } catch (error: unknown) {
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
      } catch (error: unknown) {
        message.error(getErrorMessage(error, '删除失败'));
        throw error;
      }
    });
  };

  const openPermDialog = (role: Role) => {
    roleModal.setModalData(role);
    permDialogRef.current?.open(role);
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
    <>
        <PageLayout
          title="岗位管理"
          titleExtra={
            <Button type="primary" onClick={() => openDialog()}>
              新增角色
            </Button>
          }
          headerContent={
            <>
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
                    icon={<span></span>}
                    title="权限防呆检测"
                    description={
                      <span>
                        当前有 <strong>{broadRoles.length}</strong> 个启用角色使用"全部数据"范围（
                        {broadRoles.slice(0, 3).map((r) => String(r.roleName || r.roleCode)).join('、')}{broadRoles.length > 3 ? '等' : ''}
                        ），建议审查是否需要半等权限范围，防止越权操作。
                      </span>
                    }
                    banner={false}
                  />
                );
              })()}
            </>
          }
          filterBar={
            <Card size="small" className="filter-card mb-sm">
              <Space wrap>
                <Input
                  placeholder="角色名称"
                  style={{ width: 220 }}
                  allowClear
                  value={roleNameInput}
                  onChange={(e) => setRoleNameInput(e.target.value)}
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
          }
        >
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
              stickyHeader
              scroll={{ x: 'max-content' }}
            />
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
        initialHeight={modalInitialHeight}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
          <Form form={form} layout="vertical">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="roleName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
                <Input id="roleName" placeholder="请输入角色名称" />
              </Form.Item>
              <Form.Item name="roleCode" label="角色编码" rules={[{ required: true, message: '请输入角色编码' }]}>
                <Input id="roleCode" placeholder="如：MANAGER" disabled={!!roleModal.data} />
              </Form.Item>
            </div>

            <Form.Item name="description" label="描述">
              <Input.TextArea id="description" rows={3} placeholder="请输入描述" />
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
            <Form.Item name="dataScope" label="数据权限范围">
              <Select
                options={[
                  { value: 'all', label: '全部数据' },
                ]}
                disabled
              />
            </Form.Item>
          </div>

        </Form>
      </ResizableModal>

      <PermissionDialog ref={permDialogRef} roleModal={roleModal} onSaved={fetchRoles} openRemarkModal={openRemarkModal} />

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
    </>
  );
};

export default RoleList;
