import React, { useCallback, useMemo } from 'react';
import { Card, Tabs, Input, Select, Space, Button, App } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import dayjs from 'dayjs';
import { LoginLog } from '@/types/system';
import { OperationLog } from '@/types/operation-log';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSizeByKey } from '@/utils/pageSizeStore';

import './styles.css';
import { useSystemLogsData } from './hooks/useSystemLogsData';
import { getLoginColumns, getOperationColumns } from './columns';
import {
  loginStatusOptions,
  moduleOptions,
  operationTypeOptions,
  targetTypeOptions,
} from './helpers';
import { showOperationLogDetails } from './components/OperationLogDetailsModal';

const SystemLogs: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    loginQueryParams,
    setLoginQueryParams,
    loginLogs,
    loginTotal,
    loginLoading,
    fetchLoginLogs,
    operationQueryParams,
    setOperationQueryParams,
    operationLogs,
    operationTotal,
    operationLoading,
    fetchOperationLogs,
  } = useSystemLogsData();

  const { modal } = App.useApp();

  const handleViewDetails = useCallback(
    (record: OperationLog) => {
      showOperationLogDetails(modal, record);
    },
    [modal]
  );

  const loginColumns = useMemo(() => getLoginColumns(), []);
  const operationColumns = useMemo(
    () => getOperationColumns(handleViewDetails),
    [handleViewDetails]
  );

  return (
    <>
      <div className="system-logs-page">
        <PageLayout title="系统日志">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'login' | 'operation')}
            items={[
              {
                key: 'login',
                label: '登录日志',
                children: (
                  <>
                    <Card className="filter-card mb-sm">
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
                          options={loginStatusOptions}
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
                        pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                        onChange: (page, pageSize) => {
                          try { if (typeof window !== 'undefined') localStorage.setItem('system-loginlog-pagination', JSON.stringify({ page })); } catch { /* localStorage 不可用，忽略 */ }
                          savePageSizeByKey('system-loginlog-pagination:size', pageSize);
                          setLoginQueryParams((prev) => ({ ...prev, page, pageSize }));
                        },
                      }}
                      stickyHeader
                      scroll={{ x: 'max-content' }}
                      showExport={true}
                      exportFilename="登录日志.xlsx"
                      emptyDescription="暂无日志数据"
                    />
                  </>
                ),
              },
              {
                key: 'operation',
                label: '操作日志',
                children: (
                  <>
                    <Card className="filter-card mb-sm">
                      <Space wrap size={12}>
                        <Select
                          placeholder="模块"
                          style={{ width: 140 }}
                          allowClear
                          value={operationQueryParams?.module || undefined}
                          options={moduleOptions}
                          onChange={(value) => setOperationQueryParams((prev) => ({ ...prev, module: value }))}
                        />
                        <Select
                          placeholder="操作类型"
                          style={{ width: 140 }}
                          allowClear
                          value={operationQueryParams?.operation || undefined}
                          options={operationTypeOptions}
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
                          options={targetTypeOptions}
                          onChange={(value) => setOperationQueryParams((prev) => ({ ...prev, targetType: value }))}
                        />
                        <Input
                          placeholder="商品/款式编码"
                          style={{ width: 180 }}
                          allowClear
                          value={operationQueryParams?.targetName || ''}
                          onChange={(e) => setOperationQueryParams((prev) => ({ ...prev, targetName: e.target.value, page: 1 }))}
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
                              targetName: '',
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
                        pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                        onChange: (page, pageSize) => {
                          try { if (typeof window !== 'undefined') localStorage.setItem('system-operationlog-pagination', JSON.stringify({ page })); } catch { /* localStorage 不可用，忽略 */ }
                          savePageSizeByKey('system-operationlog-pagination:size', pageSize);
                          setOperationQueryParams((prev) => ({ ...prev, page, pageSize }));
                        },
                      }}
                      stickyHeader
                      scroll={{ x: 1200 }}
                      showExport={true}
                      exportFilename="操作日志.xlsx"
                      emptyDescription="暂无日志数据"
                    />
                  </>
                ),
              },
            ]}
          />
        </PageLayout>
      </div>
    </>
  );
};

export default SystemLogs;
