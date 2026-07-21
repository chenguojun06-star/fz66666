// ProcessKanbanDrawer — 工序质检看板主组件
// 已拆分为多个模块：types/constants/helpers + useProcessKanbanData Hook + 多个子组件
// 主组件只负责组合 Hook + 子组件，渲染 Drawer 视图切换

import React from 'react';
import { Drawer, Spin, Tabs, Tag, Space, Button, Badge, Divider } from 'antd';
import {
  SafetyCertificateOutlined, ReloadOutlined, AppstoreOutlined, FileTextOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import type { ProcessKanbanDrawerProps } from './ProcessKanbanDrawer.types';
import { useProcessKanbanData } from './useProcessKanbanData';
import RemarkTimelineContent from './RemarkTimelineContent';
import KanbanBoard from './KanbanBoard';
import QcTabContent from './QcTabContent';
import QcRecordForm from './QcRecordForm';
import BatchQcForm from './BatchQcForm';

const ProcessKanbanDrawer: React.FC<ProcessKanbanDrawerProps> = ({
  visible, onClose, orderId, orderNo, styleNo: _styleNo,
}) => {
  const kanban = useProcessKanbanData({ visible, orderId, orderNo });
  const {
    loading, activeTab, setActiveTab, nodeStats,
    qcFilter, setQcFilter, setSelectedIds,
    pendingQc, unqualified, repairDone, scannedRecords,
    filteredRecords, selectableIds, searchText, setSearchText,
    selectedIds, toggleSelect, toggleSelectAll,
    batchLoading, batchQcMode, setBatchQcMode, batchQcForm,
    qcRecord, setQcRecord, qcResult, setQcResult, qcForm, submitting,
    remarkPanelOpen, setRemarkPanelOpen, loadData,
    handleQualityInspect, handleSubmitQuality,
    handleLock, handleUnlock, handleRepairComplete,
    handleBatchQualityPass, handleBatchQualityUnqualified,
  } = kanban;

  return (
    <Drawer
      title={
        <Space>
          <SafetyCertificateOutlined />
          <span>工序质检看板</span>
          {orderNo && <Tag color="blue" style={{ fontSize: 14 }}>{orderNo}</Tag>}
        </Space>
      }
      placement="right" size={Math.round(window.innerWidth * 0.8)} open={visible} onClose={onClose}
      styles={{ body: { padding: '16px 20px' } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
      }
    >
      <Spin spinning={loading}>
        {qcRecord ? (
          <QcRecordForm
            qcRecord={qcRecord}
            qcResult={qcResult}
            setQcResult={setQcResult}
            qcForm={qcForm}
            submitting={submitting}
            orderNo={orderNo}
            remarkPanelOpen={remarkPanelOpen}
            setRemarkPanelOpen={setRemarkPanelOpen}
            onBack={() => setQcRecord(null)}
            onSubmit={handleSubmitQuality}
          />
        ) : batchQcMode === 'unqualified' ? (
          <BatchQcForm
            batchQcForm={batchQcForm}
            selectedCount={selectedIds.size}
            batchLoading={batchLoading}
            onBack={() => setBatchQcMode(false)}
            onSubmit={handleBatchQualityUnqualified}
          />
        ) : remarkPanelOpen && orderNo ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => setRemarkPanelOpen(false)} style={{ padding: 0 }}>
                返回菲号列表
              </Button>
              <Divider orientation="vertical" />
              <span style={{ fontWeight: 600, fontSize: 15 }}><FileTextOutlined style={{ marginRight: 6 }} />订单备注 — {orderNo}</span>
            </div>
            <RemarkTimelineContent targetType="order" targetNo={orderNo} canAddRemark />
          </div>
        ) : (
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
              key: 'qc',
              label: <Space><SafetyCertificateOutlined />菲号质检{pendingQc.length > 0 && <Badge count={pendingQc.length} />}</Space>,
              children: (
                <QcTabContent
                  orderId={orderId}
                  qcFilter={qcFilter}
                  setQcFilter={setQcFilter}
                  setSelectedIds={setSelectedIds}
                  pendingQc={pendingQc}
                  unqualified={unqualified}
                  repairDone={repairDone}
                  scannedRecords={scannedRecords}
                  filteredRecords={filteredRecords}
                  selectableIds={selectableIds}
                  searchText={searchText}
                  setSearchText={setSearchText}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  toggleSelectAll={toggleSelectAll}
                  batchLoading={batchLoading}
                  batchQcMode={batchQcMode}
                  setBatchQcMode={setBatchQcMode}
                  batchQcForm={batchQcForm}
                  handleQualityInspect={handleQualityInspect}
                  handleLock={handleLock}
                  handleUnlock={handleUnlock}
                  handleRepairComplete={handleRepairComplete}
                  handleBatchQualityPass={handleBatchQualityPass}
                />
              ),
            },
            {
              key: 'kanban',
              label: <Space><AppstoreOutlined />工序看板</Space>,
              children: <KanbanBoard nodeStats={nodeStats} />,
            },
          ]} />
        )}
      </Spin>
    </Drawer>
  );
};

export default ProcessKanbanDrawer;
