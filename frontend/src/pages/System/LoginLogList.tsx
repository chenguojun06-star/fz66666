import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { LoginLog, LoginLogQueryParams } from '../../types/system';
import api from '../../utils/api';
import { Button, Card, message } from 'antd';
import { formatDateTime } from '../../utils/datetime';
import ResizableTable from '../../components/ResizableTable';
import './styles.css';

const LoginLogList: React.FC = () => {
  const [queryParams, setQueryParams] = useState<LoginLogQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/system/login-log/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setLoginLogs(result.data.records || []);
        setTotal(result.data.total || 0);
      }
    } catch (error) {
      message.error('获取登录日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [queryParams]);

  const getStatusText = (status: LoginLog['loginStatus']) => {
    return status === 'success' ? '成功' : '失败';
  };

  const getStatusClass = (status: LoginLog['loginStatus']) => {
    return status === 'success' ? 'status-success' : 'status-failure';
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
      render: (v: any) => formatDateTime(v),
    },
    {
      title: '状态',
      dataIndex: 'loginStatus',
      key: 'loginStatus',
      width: 110,
      render: (v: any) => {
        const status = (String(v || '').trim() as any) || 'failure';
        return <span className={`status-tag ${getStatusClass(status)}`}>{getStatusText(status)}</span>;
      },
    },
    { title: '消息', dataIndex: 'message', key: 'message', ellipsis: true },
  ];

  return (
    <Layout>
      <Card className="page-card">
        <div className="login-log-page">
          <div className="page-header">
            <h2 className="page-title">登录日志</h2>
          </div>

          <Card size="small" className="filter-card mb-sm">
            <div className="filter-section">
              <div className="filter-row">
                <div className="filter-item">
                  <label className="form-label">用户名</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="请输入用户名"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, username: e.target.value, page: 1 }))}
                  />
                </div>

                <div className="filter-item">
                  <label className="form-label">登录状态</label>
                  <select
                    className="form-input"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, loginStatus: e.target.value, page: 1 }))}
                  >
                    <option value="">全部</option>
                    <option value="success">成功</option>
                    <option value="failure">失败</option>
                  </select>
                </div>

                <div className="filter-item">
                  <label className="form-label">开始日期</label>
                  <input
                    type="date"
                    className="form-input"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, startDate: e.target.value, page: 1 }))}
                  />
                </div>

                <div className="filter-item">
                  <label className="form-label">结束日期</label>
                  <input
                    type="date"
                    className="form-input"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, endDate: e.target.value, page: 1 }))}
                  />
                </div>

                <div className="filter-item filter-actions">
                  <Button type="primary" onClick={fetchLogs}>
                    查询
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="table-section">
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
                showTotal: (t) => `共 ${t} 条记录`,
                onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 'max-content' }}
            />
          </div>
        </div>
      </Card>
    </Layout>
  );
};

export default LoginLogList;
