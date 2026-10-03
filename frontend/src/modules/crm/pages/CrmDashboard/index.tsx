import React, { useCallback, useMemo, useState } from 'react';
import { Button, Card, Col, Input, Row, Select, Space } from 'antd';
import {
  CheckCircleOutlined, PlusOutlined, SearchOutlined,
  TeamOutlined, TrophyOutlined, UserOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { Customer } from '@/services/crm/customerApi';
import CustomerFormModal from './components/CustomerFormModal';
import CustomerDetailDrawer from './components/CustomerDetailDrawer';
import CustomerUserManager from './components/CustomerUserManager';
import { useCustomerData } from './hooks/useCustomerData';
import { buildColumns } from './columns';
import { CUSTOMER_STATUS_OPTIONS } from './helpers';

// ─── 主功能页 ─────────────────────────────────────────────
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

  // D-732：客户门户账号管理（开户 / 重置密码 / 停用）
  const [portalTarget, setPortalTarget] = useState<{ id: string; name: string } | null>(null);
  const openPortalAccount = useCallback((record: Customer) => {
    setPortalTarget({ id: String(record.id || ''), name: record.companyName || '' });
  }, []);

  const columns = useMemo(
    () => buildColumns({ openDrawer, openEditModal, handleDelete, openPortalAccount }),
    [openDrawer, openEditModal, handleDelete, openPortalAccount],
  );

  return (
    <>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        {[
          { icon: <TeamOutlined />, label: '客户总数', value: stats.total, color: 'var(--color-primary)' },
          { icon: <CheckCircleOutlined />, label: '合作中', value: stats.activeCount, color: 'var(--color-success)' },
          { icon: <TrophyOutlined />, label: '一级客户', value: stats.levelOne, color: 'var(--color-warning)' },
          { icon: <UserOutlined />, label: '本月新增', value: stats.newThisMonth, color: 'var(--color-accent-purple)' },
        ].map(s => (
          <Col span={6} key={s.label}>
            <Card styles={{ body: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' } }}>
              <div style={{ fontSize: 28, color: s.color }}>{s.icon}</div>
              <div>
                <div className="u-fw-700" style={{ fontSize: 22, lineHeight: 1.2 }}>{s.value}</div>
                <div className="u-fs-14 u-mt-2" style={{ color: 'var(--color-text-tertiary)' }}>{s.label}</div>
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

      {/* 客户门户账号管理（D-732） */}
      <CustomerUserManager
        open={!!portalTarget}
        customerId={portalTarget?.id || ''}
        customerName={portalTarget?.name || ''}
        onClose={() => setPortalTarget(null)}
      />
    </>
  );
};

// ─── 页面主入口 ──────────────────────────────────────────────
// D-732：**取消付费门禁**（原 LockedView + useSubscription 已移除）。
// 事实依据：商店 CRM_MODULE 虽标价 ¥799/月，但 t_tenant_app 无任何租户开通、
// t_app_payment 0 笔付款 → 收费没带来一分钱收入，只导致"客户管理进不去 →
// 客户门户 0 账号 → 卖点无法验证"。用户拍板改为免费使用。
const CrmDashboard: React.FC = () => (
  <div style={{ padding: '24px' }}>
    <CustomerManagement />
  </div>
);

export default CrmDashboard;
