import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tabs, Input, Select, Space, Tag, Button, message, App } from 'antd';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { formatDateTimeSecond } from '@/utils/datetime';
import api from '@/utils/api';
import dayjs from 'dayjs';

import { LoginLog, LoginLogQueryParams } from '@/types/system';
import { OperationLog, OperationLogQueryParams } from '@/types/operation-log';

import './styles.css';

const SystemLogs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'operation'>('login');
  const { modal } = App.useApp();

  // ==================== 登录日志 ====================
  const [loginQueryParams, setLoginQueryParams] = useState<LoginLogQueryParams>(() => {
    let page = 1;
    let pageSize = 10;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('system-loginlog-pagination') : null;
      if (raw) {
        const obj = JSON.parse(raw || '{}');
        if (Number.isFinite(Number(obj?.page))) page = Number(obj.page);
        if (Number.isFinite(Number(obj?.pageSize))) pageSize = Number(obj.pageSize);
      }
    } catch {}
    return { page, pageSize } as LoginLogQueryParams;
  });
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loginTotal, setLoginTotal] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);

  const fetchLoginLogs = useCallback(async () => {
    setLoginLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: LoginLog[]; total: number } }>(
        '/system/login-log/list',
        { params: loginQueryParams }
      );
      if (response.code === 200) {
        setLoginLogs(response.data.records || []);
        setLoginTotal(response.data.total || 0);
      }
    } catch (error) {
      message.error('获取登录日志失败');
    } finally {
      setLoginLoading(false);
    }
  }, [loginQueryParams]);

  useEffect(() => {
    if (activeTab === 'login') {
      fetchLoginLogs();
    }
  }, [activeTab, fetchLoginLogs]);

  const normalizeLoginStatus = (raw: string | null | undefined): 'success' | 'failure' => {
    const v = String(raw ?? '').trim().toLowerCase();
    return v === 'success' ? 'success' : 'failure';
  };

  const getStatusText = (status: 'success' | 'failure') => {
    return status === 'success' ? '成功' : '失败';
  };

  const loginColumns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 140 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 140 },
    { title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 150 },
    {
      title: '登录时间',
      dataIndex: 'loginTime',
      key: 'loginTime',
      width: 180,
      render: (v: unknown) => formatDateTimeSecond(v),
    },
    {
      title: '状态',
      dataIndex: 'loginStatus',
      key: 'loginStatus',
      width: 110,
      render: (v: unknown) => {
        const status = normalizeLoginStatus(v as string);
        return <Tag color={status === 'success' ? 'green' : 'red'}>{getStatusText(status)}</Tag>;
      },
    },
    { title: '消息', dataIndex: 'message', key: 'message', ellipsis: true },
  ];

  // ==================== 操作日志 ====================
  const [operationQueryParams, setOperationQueryParams] = useState<OperationLogQueryParams>(() => {
    let page = 1;
    let pageSize = 10;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('system-operationlog-pagination') : null;
      if (raw) {
        const obj = JSON.parse(raw || '{}');
        if (Number.isFinite(Number(obj?.page))) page = Number(obj.page);
        if (Number.isFinite(Number(obj?.pageSize))) pageSize = Number(obj.pageSize);
      }
    } catch {}
    return { page, pageSize } as OperationLogQueryParams;
  });
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [operationTotal, setOperationTotal] = useState(0);
  const [operationLoading, setOperationLoading] = useState(false);

  const fetchOperationLogs = useCallback(async () => {
    setOperationLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: OperationLog[]; total: number } }>(
        '/system/operation-log/list',
        { params: operationQueryParams }
      );
      if (response.code === 200) {
        setOperationLogs(response.data.records || []);
        setOperationTotal(response.data.total || 0);
      }
    } catch (error) {
      message.error('获取操作日志失败');
    } finally {
      setOperationLoading(false);
    }
  }, [operationQueryParams]);

  useEffect(() => {
    if (activeTab === 'operation') {
      fetchOperationLogs();
    }
  }, [activeTab, fetchOperationLogs]);

  // 查看操作详情
  const handleViewDetails = (record: OperationLog) => {
    let detailsObj: any = {};
    try {
      detailsObj = record.details ? JSON.parse(record.details) : {};
    } catch (e) {
      detailsObj = { raw: record.details };
    }

    modal.info({
      title: '操作详情',
      width: 700,
      content: (
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <div style={{ marginBottom: 16 }}>
            <div><strong>模块：</strong>{record.module}</div>
            <div><strong>操作：</strong>{record.operation}</div>
            <div><strong>操作人：</strong>{record.operatorName}</div>
            <div><strong>目标类型：</strong>{record.targetType}</div>
            <div><strong>目标名称：</strong>{record.targetName || '-'}</div>
            <div><strong>操作时间：</strong>{formatDateTimeSecond(record.operationTime)}</div>
            {record.reason && <div><strong>操作原因：</strong>{record.reason}</div>}
            {record.ip && <div><strong>IP地址：</strong>{record.ip}</div>}
          </div>
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: 12,
            fontFamily: 'monospace',
            fontSize: 12
          }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(detailsObj, null, 2)}
            </pre>
          </div>
        </div>
      ),
    });
  };

  const operationColumns = [
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 130,
      minWidth: 100,
      resizable: true,
      render: (v: string) => <Tag color="blue">{v}</Tag>
    },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 110, resizable: true },
    { title: '目标类型', dataIndex: 'targetType', key: 'targetType', width: 110, resizable: true },
    { title: '目标名称', dataIndex: 'targetName', key: 'targetName', width: 160, resizable: true, ellipsis: true },
    {
      title: '时间',
      dataIndex: 'operationTime',
      key: 'operationTime',
      width: 170,
      resizable: true,
      render: (v: unknown) => formatDateTimeSecond(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      resizable: true,
      render: (v: 'success' | 'failure') => (
        <Tag color={v === 'success' ? 'green' : 'red'}>
          {v === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      width: 200,
      resizable: true,
      render: (v: string) => v || '-'
    },
    {
      title: '操作',
      dataIndex: 'operation',
      key: 'operation',
      width: 120,
      resizable: true,
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          '删除': 'red',
          '新增': 'green',
          '修改': 'orange',
          '审批': 'purple',
          '导出': 'cyan',
        };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      }
    },
    {
      title: '详情',
      key: 'details',
      width: 90,
      resizable: true,
      render: (_: unknown, record: OperationLog) => (
        <Button type="link" onClick={() => handleViewDetails(record)}>
          查看
        </Button>
      )
    },
  ];

  // ==================== 渲染 ====================
  return (
    <Layout>
      <div className="system-logs-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">系统日志</h2>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'login' | 'operation')}
            items={[
              {
                key: 'login',
                label: '登录日志',
                children: (
                  <>
                    <Card size="small" className="filter-card mb-sm">
                      <Space wrap size={12}>
                        <Input
                          placeholder="用户名"
                          style={{ width: 200 }}
                          allowClear
                          value={String(loginQueryParams?.username || '')}
                          onChange={(e) => setLoginQueryParams((prev) => ({ ...prev, username: e.target.value, page: 1 }))}
                        />
                        <Select
                          placeholder="登录状态"
                          style={{ width: 140 }}
                          allowClear
                          value={String(loginQueryParams?.loginStatus || '') || undefined}
                          options={[
                            { value: 'SUCCESS', label: '成功' },
                            { value: 'FAILED', label: '失败' },
                          ]}
                          onChange={(value) => setLoginQueryParams((prev) => ({ ...prev, loginStatus: value, page: 1 }))}
                        />
                        <UnifiedDatePicker
                          placeholder="开始日期"
                          value={loginQueryParams.startDate ? dayjs(String(loginQueryParams.startDate)) : null}
                          onChange={(d) => setLoginQueryParams((prev) => ({ ...prev, startDate: d ? (d as any).format('YYYY-MM-DD') : '', page: 1 }))}
                        />
                        <UnifiedDatePicker
                          placeholder="结束日期"
                          value={loginQueryParams.endDate ? dayjs(String(loginQueryParams.endDate)) : null}
                          onChange={(d) => setLoginQueryParams((prev) => ({ ...prev, endDate: d ? (d as any).format('YYYY-MM-DD') : '', page: 1 }))}
                        />
                        <Button type="primary" onClick={fetchLoginLogs}>
                          查询
                        </Button>
                        <Button
                          onClick={() =>
                            setLoginQueryParams({
                              page: 1,
                              pageSize: loginQueryParams.pageSize,
                              username: '',
                              loginStatus: '',
                              startDate: '',
                              endDate: '',
                            })
                          }
                        >
                          重置
                        </Button>
                      </Space>
                    </Card>

                  <ResizableTable<LoginLog>
                    storageKey="system-loginlog-table"
                    rowKey={(r) => String(r.id || `${r.username}-${r.loginTime}-${r.ip}`)}
                    columns={loginColumns as any}
                    dataSource={loginLogs}
                    loading={loginLoading}
                    pagination={{
                      current: loginQueryParams.page,
                      pageSize: loginQueryParams.pageSize,
                      total: loginTotal,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (t) => `共 ${t} 条`,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      onChange: (page, pageSize) => {
                        try { if (typeof window !== 'undefined') localStorage.setItem('system-loginlog-pagination', JSON.stringify({ page, pageSize })); } catch {}
                        setLoginQueryParams((prev) => ({ ...prev, page, pageSize }));
                      },
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </>
              ),
            },
            {
              key: 'operation',
              label: '操作日志',
              children: (
                <>
                  <Card size="small" className="filter-card mb-sm">
                    <Space wrap size={12}>
                      <Select
                        placeholder="模块"
                        style={{ width: 140 }}
                        allowClear
                        value={operationQueryParams?.module || undefined}
                        options={[
                          { value: '样衣开发', label: '样衣开发' },
                          { value: '下单管理', label: '下单管理' },
                          { value: '大货生产', label: '大货生产' },
                          { value: '物料采购', label: '物料采购' },
                          { value: '仓库管理', label: '仓库管理' },
                          { value: '财务管理', label: '财务管理' },
                          { value: '系统设置', label: '系统设置' },
                        ]}
                        onChange={(value) => setOperationQueryParams((prev) => ({ ...prev, module: value }))}
                      />
                      <Select
                        placeholder="操作类型"
                        style={{ width: 140 }}
                        allowClear
                        value={operationQueryParams?.operation || undefined}
                        options={[
                          { value: '删除', label: '删除' },
                          { value: '新增', label: '新增' },
                          { value: '修改', label: '修改' },
                          { value: '审批', label: '审批' },
                          { value: '导出', label: '导出' },
                        ]}
                        onChange={(value) => setOperationQueryParams((prev) => ({ ...prev, operation: value }))}
                      />
                      <Input
                        placeholder="操作人"
                        style={{ width: 140 }}
                        allowClear
                        value={operationQueryParams?.operatorName || ''}
                        onChange={(e) => setOperationQueryParams((prev) => ({ ...prev, operatorName: e.target.value }))}
                      />
                      <Select
                        placeholder="目标类型"
                        style={{ width: 140 }}
                        allowClear
                        value={operationQueryParams?.targetType || undefined}
                        options={[
                          { value: '款式', label: '款式' },
                          { value: '订单', label: '订单' },
                          { value: '裁剪单', label: '裁剪单' },
                          { value: '物料', label: '物料' },
                          { value: '采购单', label: '采购单' },
                          { value: '用户', label: '用户' },
                          { value: '角色', label: '角色' },
                        ]}
                        onChange={(value) => setOperationQueryParams((prev) => ({ ...prev, targetType: value }))}
                      />
                      <UnifiedDatePicker
                        placeholder="开始日期"
                        value={operationQueryParams.startDate ? dayjs(String(operationQueryParams.startDate)) : null}
                        onChange={(d) => setOperationQueryParams((prev) => ({ ...prev, startDate: d ? (d as any).format('YYYY-MM-DD') : '' }))}
                      />
                      <UnifiedDatePicker
                        placeholder="结束日期"
                        value={operationQueryParams.endDate ? dayjs(String(operationQueryParams.endDate)) : null}
                        onChange={(d) => setOperationQueryParams((prev) => ({ ...prev, endDate: d ? (d as any).format('YYYY-MM-DD') : '' }))}
                      />
                      <Button type="primary" onClick={fetchOperationLogs}>
                        查询
                      </Button>
                      <Button
                        onClick={() =>
                          setOperationQueryParams({
                            page: 1,
                            pageSize: operationQueryParams.pageSize,
                            module: '',
                            operation: '',
                            operatorName: '',
                            targetType: '',
                            startDate: '',
                            endDate: '',
                          })
                        }
                      >
                        重置
                      </Button>
                    </Space>
                  </Card>

                  <ResizableTable<OperationLog>
                    storageKey="system-operationlog-table"
                    rowKey={(r) => String(r.id || `${r.operatorId}-${r.operationTime}-${r.targetId}`)}
                    columns={operationColumns as any}
                    dataSource={operationLogs}
                    loading={operationLoading}
                    allowFixedColumns={false}
                    pagination={{
                      current: operationQueryParams.page,
                      pageSize: operationQueryParams.pageSize,
                      total: operationTotal,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (t) => `共 ${t} 条`,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      onChange: (page, pageSize) => {
                        try { if (typeof window !== 'undefined') localStorage.setItem('system-operationlog-pagination', JSON.stringify({ page, pageSize })); } catch {}
                        setOperationQueryParams((prev) => ({ ...prev, page, pageSize }));
                      },
                    }}
                    scroll={{ x: 1200 }}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>
      </div>
    </Layout>
  );
};

export default SystemLogs;
