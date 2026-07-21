import React, { useMemo } from 'react';
import { Button, Card, Col, Input, Row, Select, Space, Spin } from 'antd';
import {
  CheckCircleOutlined, PlusOutlined, SearchOutlined,
  TeamOutlined, TrophyOutlined, UserOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { useNavigate } from 'react-router-dom';
import { paths } from '@/routeConfig';
import LockedView from './components/LockedView';
import CustomerFormModal from './components/CustomerFormModal';
import CustomerDetailDrawer from './components/CustomerDetailDrawer';
import { useSubscription } from './hooks/useSubscription';
import { useCustomerData } from './hooks/useCustomerData';
import { buildColumns } from './columns';
import { CUSTOMER_STATUS_OPTIONS } from './helpers';

// ─── 主功能页（已订阅时展示）────────────────────────────────────────
const CustomerManagement: React.FC = () => {
  const {
    customers,
    total,
    loading,
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    pagination,
    setPagination,
    stats,
    modalOpen,
    editData,
    openCreateModal,
    openEditModal,
    closeModal,
    onModalSuccess,
    drawerOpen,
    drawerData,
    drawerOrders,
    drawerLoading,
    drawerReceivables,
    drawerReceivableLoading,
    openDrawer,
    closeDrawer,
    handleShareOrder,
    shareOrderDialog,
    fetchList,
    handleSearch,
    handleTableChange,
    handleDelete,
  } = useCustomerData();

  const columns = useMemo(
    () => buildColumns({ openDrawer, openEditModal, handleDelete }),
    [openDrawer, openEditModal, handleDelete],
  );

  return (
    <>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        {[
          { icon: <TeamOutlined />, label: '客户总数', value: stats.total, color: 'var(--color-primary)' },
          { icon: <CheckCircleOutlined />, label: '合作中', value: stats.activeCount, color: 'var(--color-success)' },
          { icon: <TrophyOutlined />, label: 'VIP客户', value: stats.vip, color: 'var(--color-warning)' },
          { icon: <UserOutlined />, label: '本月新增', value: stats.newThisMonth, color: 'var(--color-accent-purple)' },
        ].map(s => (
          <Col span={6} key={s.label}>
            <Card styles={{ body: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' } }}>
              <div style={{ fontSize: 28, color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{s.label}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 搜索栏 */}
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Space>
              <Input
                placeholder="搜索公司名称、联系人、电话"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 280 }}
                allowClear
              />
              <Select
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, keyword, v); }}
                style={{ width: 120 }}
                options={CUSTOMER_STATUS_OPTIONS}
              />
              <Button icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增客户
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 表格 */}
      <Card styles={{ body: { padding: 0 } }}>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={customers}
          loading={loading}
          stickyHeader
          scroll={{ x: 1200 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条`,
          }}
          onChange={handleTableChange}
          emptyDescription="暂无客户数据"
        />
      </Card>

      {/* 新建/编辑 Modal */}
      <CustomerFormModal
        open={modalOpen}
        editData={editData}
        onClose={closeModal}
        onSuccess={onModalSuccess}
      />

      {/* 客户详情弹窗 */}
      <CustomerDetailDrawer
        open={drawerOpen}
        drawerData={drawerData}
        drawerOrders={drawerOrders}
        drawerLoading={drawerLoading}
        drawerReceivables={drawerReceivables}
        drawerReceivableLoading={drawerReceivableLoading}
        onClose={closeDrawer}
        handleShareOrder={handleShareOrder}
      />

      {shareOrderDialog}
    </>
  );
};

// ─── 页面主入口（订阅检测 + 分支渲染）──────────────────────────────
const CrmDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { subscribed, checking } = useSubscription();

  return (
    <>
      <div style={{ padding: '24px' }}>
        {checking ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
        ) : subscribed ? (
          <CustomerManagement />
        ) : (
          <div style={{ maxWidth: 960 }}>
            <LockedView onGoStore={() => navigate(paths.appStore)} />
          </div>
        )}
      </div>
    </>
  );
};

export default CrmDashboard;
