import React, { useMemo } from 'react';
import { Alert, Button, Table } from 'antd';
import { CloseOutlined, EditOutlined } from '@ant-design/icons';
import type { ProcessStageProgress } from './useSampleProcessProgress';
import { parseSizeDisplay, type SubProcessRow } from './SampleProcessList.helpers';
import { buildColumns } from './SampleProcessList.columns';
import useSampleProcessListData from './useSampleProcessListData';
import EditBasicInfoBar from './components/EditBasicInfoBar';
import StageTabs from './components/StageTabs';
import AssigneeModal from './components/AssigneeModal';
import PurchaseDrawer from './components/PurchaseDrawer';

interface SampleProcessListProps {
  stages: ProcessStageProgress[];
  loading: boolean;
  needsConfig?: boolean;
  orderId: string | null;
  orderNo: string | null;
  styleNo?: string;
  color?: string;
  quantity?: number;
  size?: string;
  receiver?: string;
  receiveTime?: string;
  patternProductionId?: string;
  onCompleteProcess?: (processCode: string) => Promise<void>;
  onRefresh?: () => void;
}

export default function SampleProcessList({
  stages, loading, needsConfig, orderId, orderNo,
  styleNo = '', color = '', quantity, size = '',
  receiver = '', receiveTime = '',
  patternProductionId,
  onCompleteProcess, onRefresh,
}: SampleProcessListProps) {
  const data = useSampleProcessListData({
    stages,
    needsConfig,
    patternProductionId,
    styleNo,
    color,
    size,
    quantity,
    receiver,
    receiveTime,
    onCompleteProcess,
    onRefresh,
  });

  const {
    activeTab,
    setActiveTab,
    actioningKey,
    purchaseDrawerOpen,
    setPurchaseDrawerOpen,
    sourceType,
    assignModalOpen,
    setAssignModalOpen,
    assigningRow,
    assignForm,
    assignLoading,
    editing,
    setEditing,
    savingField,
    setSavingField,
    currentStage,
    subTableData,
    currentStageEmpty,
    handleManualComplete,
    handleUndo,
    handleAssign,
    handleAssignSubmit,
    handlePurchaseClick,
    handleFieldSave,
    handleStartEdit,
  } = data;

  const columns = useMemo<ReturnType<typeof buildColumns>>(
    () => buildColumns({
      activeTab,
      currentStageKey: currentStage?.key,
      actioningKey,
      onAssign: handleAssign,
      onPurchaseClick: handlePurchaseClick,
      onManualComplete: handleManualComplete,
      onUndo: handleUndo,
    }),
    [activeTab, currentStage, actioningKey, handleAssign, handlePurchaseClick, handleManualComplete, handleUndo],
  );

  const completedCount = stages.filter(s => s.percent >= 100).length;

  const handleSaveField = (field: 'styleNo' | 'color' | 'size', value: string) => {
    setSavingField(field);
    handleFieldSave(value);
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          工序列表 <strong style={{ color: 'var(--color-text-primary)' }}>{completedCount}/{stages.length}</strong> 完成
        </span>
        {patternProductionId ? (
          <Button
            size="small"
            icon={editing ? <CloseOutlined /> : <EditOutlined />}
            onClick={() => editing ? setEditing(false) : handleStartEdit()}
            type={editing ? 'default' : 'link'}
          >
            {editing ? '取消编辑' : '编辑基本信息'}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <EditBasicInfoBar
          styleNo={styleNo}
          color={color}
          size={size}
          savingField={savingField}
          onSaveField={handleSaveField}
        />
      ) : (
        <div style={{
          display: 'flex',
          gap: 24,
          marginBottom: 8,
          padding: '4px 0',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
        }}>
          <span>款号: <strong style={{ color: 'var(--color-text-primary)' }}>{styleNo || '-'}</strong></span>
          <span>颜色: <strong style={{ color: 'var(--color-text-primary)' }}>{color || '-'}</strong></span>
          <span>尺码: <strong style={{ color: 'var(--color-text-primary)' }}>{parseSizeDisplay(size)}</strong></span>
        </div>
      )}

      <StageTabs stages={stages} activeTab={activeTab} onTabChange={setActiveTab} />

      {needsConfig ? (
        <Alert
          type="warning"
          showIcon
          message="该款号尚未配置子工序"
          description="请先在「款式工序配置」中添加子工序，配置后才会显示工序列表。"
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {/* 整体有工序配置，但当前切换到的阶段未配置子工序：
          采购和入库是"数据驱动"阶段（看采购单状态/仓库收货），不是生产工序，不需要配置子工序；
          裁剪/二次工艺/车缝/尾部是生产工序，未配置子工序时提示去配置 */}
      {currentStageEmpty ? (
        <Alert
          type={currentStage?.key === 'procurement' || currentStage?.key === 'warehousing' ? 'success' : 'info'}
          showIcon
          message={
            currentStage?.key === 'procurement'
              ? '采购阶段无需配置子工序'
              : currentStage?.key === 'warehousing'
              ? '入库阶段无需配置子工序'
              : `「${currentStage?.label || '当前阶段'}」尚未配置子工序`
          }
          description={
            currentStage?.key === 'procurement'
              ? '采购完成看采购单状态（到货率/确认完成），不是生产扫码工序。请在「采购管理」中操作采购单。'
              : currentStage?.key === 'warehousing'
              ? '入库完成看仓库收货（成品入库记录），不是生产扫码工序。请在「成品仓库」中操作入库。'
              : '该阶段未配置具体子工序，如需展示明细请在「款式工序配置」中为该阶段添加子工序。若该阶段无需子工序，可忽略此提示。'
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {/* 当前阶段未配置子工序时隐藏空表格，避免显示"暂无数据"造成误解 */}
      {!currentStageEmpty ? (
        <Table<SubProcessRow>
          columns={columns}
          dataSource={subTableData}
          rowKey="key"
          size="small"
          loading={loading}
          pagination={false}
          scroll={{ x: 720 }}
          style={{ fontSize: 13 }}
        />
      ) : null}

      <PurchaseDrawer
        open={purchaseDrawerOpen}
        onClose={() => setPurchaseDrawerOpen(false)}
        sourceType={sourceType}
        patternProductionId={patternProductionId}
        orderId={orderId}
        orderNo={orderNo}
        styleNo={styleNo}
        color={color}
        quantity={quantity}
      />

      <AssigneeModal
        open={assignModalOpen}
        assigningRow={assigningRow}
        loading={assignLoading}
        form={assignForm}
        onCancel={() => setAssignModalOpen(false)}
        onOk={handleAssignSubmit}
      />
    </div>
  );
}
