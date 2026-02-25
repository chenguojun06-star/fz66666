import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import { LoginLog, LoginLogQueryParams } from '@/types/system';
import api from '@/utils/api';
import { Button, Card, Input, Select, Space, Tag, message } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { formatDateTimeSecond } from '@/utils/datetime';
import ResizableTable from '@/components/common/ResizableTable';
import { useViewport } from '@/utils/useViewport';
import './styles.css';

import dayjs from 'dayjs';

const LoginLogList: React.FC = () => {
  const [queryParams, setQueryParams] = useState<LoginLogQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { isMobile: _isMobile } = useViewport();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: LoginLog[]; total: number } }>('/system/login-log/list', { params: queryParams });
      if (response.code === 200) {
        setLoginLogs(response.data.records || []);
        setTotal(response.data.total || 0);
      }
    } catch (error) {
      message.error('获取登录日志失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const normalizeLoginStatus = (raw: any): 'success' | 'failure' => {
    const v = String(raw == null ? '' : raw).trim();
    if (!v) return 'failure';
    const u = v.toUpperCase();
    if (u === 'SUCCESS' || u === 'OK' || u === 'PASS') return 'success';
    if (u === 'FAILED' || u === 'FAILURE' || u === 'ERROR' || u === 'FAIL') return 'failure';
    const l = v.toLowerCase();
    if (l === 'success') return 'success';
    if (l === 'failure') return 'failure';
    return 'failure';
  };

  const getStatusText = (status: 'success' | 'failure') => {
    return status === 'success' ? '成功' : '失败';
  };

  const columns = [
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
        const status = normalizeLoginStatus(v);
        return <Tag color={status === 'success' ? 'green' : 'red'}>{getStatusText(status)}</Tag>;
      },
    },
    { title: '消息', dataIndex: 'message', key: 'message', ellipsis: true },
  ];

  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2 className="page-title">登录日志</h2>
        </div>

        <Card size="small" className="filter-card mb-sm">
          <Space wrap>
            <Input
              placeholder="用户名"
              style={{ width: 200 }}
              allowClear
              value={String((queryParams as any)?.username || '')}
              onChange={(e) => setQueryParams((prev) => ({ ...prev, username: e.target.value, page: 1 }))}
            />
            <Select
              placeholder="登录状态"
              style={{ width: 140 }}
              allowClear
              value={String((queryParams as any)?.loginStatus || '') || undefined}
              options={[
                { value: 'SUCCESS', label: '成功' },
                { value: 'FAILED', label: '失败' },
              ]}
              onChange={(value) => setQueryParams((prev) => ({ ...prev, loginStatus: value, page: 1 }))}
            />
            <UnifiedDatePicker
              placeholder="开始日期"
              value={queryParams.startDate ? dayjs(String(queryParams.startDate)) : null}
              onChange={(d) => setQueryParams((prev) => ({ ...prev, startDate: d ? (d as any).format('YYYY-MM-DD') : '', page: 1 }))}
            />
            <UnifiedDatePicker
              placeholder="结束日期"
              value={queryParams.endDate ? dayjs(String(queryParams.endDate)) : null}
              onChange={(d) => setQueryParams((prev) => ({ ...prev, endDate: d ? (d as any).format('YYYY-MM-DD') : '', page: 1 }))}
            />
            <Button type="primary" onClick={fetchLogs}>
              查询
            </Button>
            <Button
              onClick={() =>
                setQueryParams({
                  page: 1,
                  pageSize: queryParams.pageSize,
                  username: '',
                  loginStatus: '',
                  startDate: '',
                  endDate: '',
                } as any)
              }
            >
              重置
            </Button>
          </Space>
        </Card>

        <ResizableTable<LoginLog>
          storageKey="system-loginlog-table"
          rowKey={(r) => String(r.id || `${r.username}-${r.loginTime}-${r.ip}`)}
          columns={columns as any}
          dataSource={loginLogs}
          loading={loading}
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
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </Layout>
  );
};

export default LoginLogList;
