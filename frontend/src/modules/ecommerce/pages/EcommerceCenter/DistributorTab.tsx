import React, { useMemo } from 'react';
import { Button, Space } from 'antd';
import { TeamOutlined, PlusOutlined, DollarOutlined, ShoppingOutlined, AuditOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { DistributorProfile, DistributorLevel, DistributorPricePolicy, B2BOrder, DistributorBill } from './useDistributor';
import { useDistributorTabData } from './useDistributorTabData';
import { buildAllDistributorColumns } from './distributorColumns';
import ProfileModal from './components/ProfileModal';
import LevelModal from './components/LevelModal';
import PolicyModal from './components/PolicyModal';
import B2BOrderModal from './components/B2BOrderModal';

const DistributorTab: React.FC = () => {
  const data = useDistributorTabData();
  const {
    st,
    profileModal, setProfileModal,
    levelModal, setLevelModal,
    policyModal, setPolicyModal,
    b2bModal, setB2bModal,
    reconciling,
    handleSaveProfile, handleDeleteProfile, handleChangeProfileStatus,
    handleSaveLevel, handleDeleteLevel,
    handleSavePolicy, handleDeletePolicy,
    handleCreateB2B, handleCancelB2B, handleShipB2B, handleConfirmB2B,
    handleReconcile, handleHandleBill,
  } = data;

  const cols = useMemo(() => buildAllDistributorColumns({
    setProfileModal,
    setLevelModal,
    setPolicyModal,
    handleDeleteProfile,
    handleDeleteLevel,
    handleDeletePolicy,
    handleShipB2B,
    handleConfirmB2B,
    handleCancelB2B,
    handleHandleBill,
    handleChangeProfileStatus,
  }), [
    setProfileModal, setLevelModal, setPolicyModal,
    handleDeleteProfile, handleDeleteLevel, handleDeletePolicy,
    handleShipB2B, handleConfirmB2B, handleCancelB2B,
    handleHandleBill, handleChangeProfileStatus,
  ]);

  return (
    <div style={{ padding: '0 8px' }}>
      {/* 分销商档案 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
        <Space><TeamOutlined style={{ color: 'var(--color-primary)' }} /><strong>分销商档案</strong></Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setProfileModal({ open: true, record: null })}>新增分销商</Button>
      </div>
      <ResizableTable<DistributorProfile> dataSource={st.profiles} rowKey="id" size="small" columns={cols.profileCols} pagination={{ pageSize: 5 }} emptyDescription="暂无客户数据" />

      {/* 等级管理 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><TeamOutlined style={{ color: 'var(--color-accent-purple)' }} /><strong>分销商等级</strong></Space>
        <Button icon={<PlusOutlined />} onClick={() => setLevelModal({ open: true, record: null })}>新增等级</Button>
      </div>
      <ResizableTable<DistributorLevel> dataSource={st.levels} rowKey="id" size="small" columns={cols.levelCols} pagination={false} emptyDescription="暂无数据" />

      {/* 价格政策 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><DollarOutlined style={{ color: 'var(--color-success)' }} /><strong>价格政策</strong></Space>
        <Button icon={<PlusOutlined />} onClick={() => setPolicyModal({ open: true, record: null })}>新增政策</Button>
      </div>
      <ResizableTable<DistributorPricePolicy> dataSource={st.policies} rowKey="id" size="small" columns={cols.policyCols} pagination={{ pageSize: 5 }} emptyDescription="暂无数据" />

      {/* B2B 订单 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><ShoppingOutlined style={{ color: 'var(--color-warning)' }} /><strong>B2B 分销订单</strong></Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setB2bModal(true)}>创建B2B订单</Button>
      </div>
      <ResizableTable<B2BOrder> dataSource={st.b2bOrders} rowKey="id" size="small" columns={cols.b2bCols} pagination={{ pageSize: 5 }} emptyDescription="暂无订单数据" />

      {/* 分销对账 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><AuditOutlined style={{ color: 'var(--color-danger)' }} /><strong>分销对账</strong></Space>
        <Button loading={reconciling} onClick={handleReconcile}>触发对账</Button>
      </div>
      <ResizableTable<DistributorBill> dataSource={st.bills} rowKey="id" size="small" columns={cols.billCols} pagination={{ pageSize: 5 }} emptyDescription="暂无财务数据" />

      {/* 弹窗 */}
      <ProfileModal open={profileModal.open} record={profileModal.record} levels={st.levels} onClose={() => setProfileModal({ open: false, record: null })} onOk={handleSaveProfile} />
      <LevelModal open={levelModal.open} record={levelModal.record} onClose={() => setLevelModal({ open: false, record: null })} onOk={handleSaveLevel} />
      <PolicyModal open={policyModal.open} record={policyModal.record} levels={st.levels} onClose={() => setPolicyModal({ open: false, record: null })} onOk={handleSavePolicy} />
      <B2BOrderModal open={b2bModal} profiles={st.profiles} onClose={() => setB2bModal(false)} onOk={handleCreateB2B} />
    </div>
  );
};

export default DistributorTab;
