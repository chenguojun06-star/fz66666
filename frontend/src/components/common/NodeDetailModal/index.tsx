import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Popconfirm, Space, Spin, Tabs, Tag } from 'antd';
import type { TabsProps } from 'antd';
import { FileTextOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import ResizableModal from '../ResizableModal';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { useUser } from '@/utils/AuthContext';
import ProcessTrackingTable from '@/components/production/ProcessTrackingTable';
import { useNodeDetailData } from './useNodeDetailData';
import { formatProcessDisplayName } from '@/utils/productionStage';
import PredictionCard from './PredictionCard';
import OperatorsTab from './OperatorsTab';
import NodeSettingsTab from './NodeSettingsTab';
import type { NodeType, HistoryItem, NodeOperationData, NodeDetailModalProps } from './types';

const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  visible,
  onClose,
  orderId,
  orderNo,
  nodeType,
  nodeName,
  stats: nodeStats,
  unitPrice,
  processList = [],
  isPatternProduction = false,
  extraData: _extraData,
  onSaved,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useUser();

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('processTracking');
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const {
    loading, factories, users, nodeOperations, setNodeOperations,
    orderSummary, processTrackingRecords,
    trackingLoading, repairLoading, loadWarnings, prediction, predicting,
    operatorSummary, cuttingSizeItems,
    handleUndoSuccess, handleRepairTracking,
  } = useNodeDetailData({
    visible, orderId, orderNo, nodeType, nodeName, nodeStats,
    isPatternProduction, processList, onSaved,
  });

  useEffect(() => {
    if (visible && orderId) {
      setActiveTab('processTracking');
    }
    if (!visible) {
      setActiveTab('processTracking');
      setAdminUnlocked(false);
    }
  }, [visible, orderId]);

  const isHighProgress = (nodeStats?.percent || 0) >= 80;
  const disableEdit = isHighProgress && !adminUnlocked;
  const nodeTypeKey = nodeType as NodeType;
  const currentNodeData = nodeOperations[nodeTypeKey] || {};

  const matchedProcess = useMemo(() => {
    const byName = (p: any, target: string) => {
      const candidates = [p?.name, p?.processName, p?.label, p?.title].map((v) => String(v || '').trim());
      return candidates.some((v) => v && v === target);
    };
    const pickedName = String(currentNodeData.delegateProcessName || '').trim();
    const nodeLabel = String(nodeName || '').trim();
    if (pickedName) {
      const byPicked = processList.find((p) => byName(p as any, pickedName));
      if (byPicked) return byPicked as any;
    }
    if (nodeLabel) {
      const byNode = processList.find((p) => byName(p as any, nodeLabel));
      if (byNode) return byNode as any;
    }
    return (processList[0] as any) || null;
  }, [currentNodeData.delegateProcessName, nodeName, processList]);

  const delegateProcessCode = useMemo(() => {
    return String((matchedProcess as any)?.id || (matchedProcess as any)?.processCode || (matchedProcess as any)?.code || '').trim();
  }, [matchedProcess]);

  const updateNodeData = (field: keyof NodeOperationData, value: string | number | undefined) => {
    setNodeOperations(prev => ({
      ...prev,
      [nodeTypeKey]: {
        ...prev[nodeTypeKey],
        [field]: value,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id,
        updatedByName: user?.name || user?.username || '未知',
      }
    }));
  };

  const handleFactoryChange = (factoryId: string | undefined) => {
    const factory = factories?.find(f => f.id === factoryId);
    setNodeOperations(prev => ({
      ...prev,
      [nodeTypeKey]: {
        ...prev[nodeTypeKey],
        delegateFactoryId: factoryId,
        delegateFactoryName: factory?.factoryName,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id,
        updatedByName: user?.name || user?.username || '未知',
      }
    }));
  };

  const generateChangeDescription = (data: NodeOperationData): string => {
    const parts: string[] = [];
    if (data.delegateType === 'person') {
      parts.push(`委派类型: 人员`);
      if (data.assignee) parts.push(`委派人员: ${data.assignee}`);
    } else {
      parts.push(`委派类型: 工厂`);
      if (data.delegateFactoryName) parts.push(`委派工厂: ${data.delegateFactoryName}`);
    }
    if (data.delegateProcessName) parts.push(`外发工序: ${formatProcessDisplayName(delegateProcessCode || undefined, data.delegateProcessName)}`);
    if (data.delegatePrice) parts.push(`单价: ¥${data.delegatePrice}`);
    if (data.processType) parts.push(`工艺类型: ${data.processType}`);
    if (typeof data.assigneeQuantity === 'number') parts.push(`领取数量: ${data.assigneeQuantity}`);
    if (data.receiveTime) parts.push(`领取时间: ${new Date(data.receiveTime).toLocaleString()}`);
    if (data.completeTime) parts.push(`完成时间: ${new Date(data.completeTime).toLocaleString()}`);
    if (data.remark) parts.push(`备注: ${data.remark.slice(0, 20)}${data.remark.length > 20 ? '...' : ''}`);
    return parts.join('; ') || '无';
  };

  const handleSave = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      const currentData = nodeOperations[nodeTypeKey] || {};
      const existingHistory = currentData.history || [];
      let actionType: string = existingHistory.length === 0 ? 'create' : 'update';
      if (adminUnlocked && isHighProgress) {
        actionType = 'admin_unlock_update';
      }
      const newHistoryItem: HistoryItem = {
        time: new Date().toISOString(),
        operatorName: user?.name || user?.username || '未知',
        action: actionType,
        changes: generateChangeDescription(currentData),
      };

      const updatedOperations = {
        ...nodeOperations,
        [nodeTypeKey]: {
          ...currentData,
          history: [...existingHistory, newHistoryItem].slice(-20),
        }
      };

      const res = await productionOrderApi.saveNodeOperations(
        orderId,
        JSON.stringify(updatedOperations)
      );
      if (res.code === 200) {
        message.success('保存成功');
        const qty = currentData.assigneeQuantity;
        if (!isPatternProduction && typeof qty === 'number' && qty > 0) {
          const nodeKey = String(nodeTypeKey);
          const scanType = (() => {
            if (nodeKey === 'cutting') return 'cutting';
            if (nodeKey === 'procurement') return 'production';
            if (nodeKey === 'warehousing') return 'warehouse';
            return 'production';
          })();

          const fixedProcessName = String(
            currentData.delegateProcessName || (matchedProcess as any)?.name || (matchedProcess as any)?.processName || nodeName || ''
          ).trim();
          const fixedUnitPrice = (() => {
            if (typeof currentData.delegatePrice === 'number') return currentData.delegatePrice;
            const picked = Number((matchedProcess as any)?.unitPrice);
            if (Number.isFinite(picked)) return picked;
            return Number(unitPrice) || 0;
          })();

          try {
            await productionScanApi.execute({
              orderId,
              orderNo: orderSummary.orderNo || orderNo,
              quantity: qty,
              scanType,
              progressStage: nodeName,
              processName: fixedProcessName || nodeName,
              processCode: delegateProcessCode || null,
              unitPrice: Number.isFinite(fixedUnitPrice) ? fixedUnitPrice : null,
              remark: 'PC同步',
              manual: true,
            });
          } catch (syncErr: unknown) {
            message.warning(syncErr instanceof Error ? syncErr.message : 'PC同步扫码失败');
          }
        }
        setAdminUnlocked(false);
        onSaved?.();
        onClose();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (err) {
      message.error('保存失败');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      const currentData = nodeOperations[nodeTypeKey] || {};
      const existingHistory = currentData.history || [];

      const clearHistoryItem: HistoryItem = {
        time: new Date().toISOString(),
        operatorName: user?.name || user?.username || '未知',
        action: 'clear',
        changes: '清空了所有设置',
      };

      const updatedOperations = {
        ...nodeOperations,
        [nodeTypeKey]: {
          history: [...existingHistory, clearHistoryItem].slice(-20),
          updatedAt: new Date().toISOString(),
          updatedBy: user?.id,
          updatedByName: user?.name || user?.username || '未知',
        }
      };

      const res = await productionOrderApi.saveNodeOperations(
        orderId,
        JSON.stringify(updatedOperations)
      );
      if (res.code === 200) {
        setNodeOperations(updatedOperations);
        message.success('已清空设置');
      } else {
        message.error(res.message || '清空失败');
      }
    } catch (err) {
      message.error('清空失败');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const hasSettings = !!(
    currentNodeData.delegateFactoryId ||
    currentNodeData.delegateProcessName ||
    currentNodeData.delegatePrice ||
    currentNodeData.processType ||
    currentNodeData.assignee ||
    currentNodeData.remark
  );

  return (
    <ResizableModal
      title={
        <Space>
          <span>{nodeName} 详情</span>
          {orderNo && <Tag color="blue">{orderNo}</Tag>}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      className="node-detail-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            {hasSettings && (
              <Popconfirm
                title="确认清空设置？"
                description="清空后可在操作历史中查看记录，但设置内容将被删除"
                onConfirm={handleClear}
                okText="确认清空"
                cancelText="取消"
                okButtonProps={{ danger: true, type: 'default' }}
              >
                <Button danger loading={saving}>
                  清空设置
                </Button>
              </Popconfirm>
            )}
          </div>
        </div>
      }
      width={nodeTypeKey === 'procurement' ? '40vw' : '60vw'}
      initialHeight={Math.round(window.innerHeight * 0.82)}
    >
      <Spin spinning={loading}>
        {loadWarnings.length > 0 && (
          <Alert
            style={{ marginBottom: 8 }}
            type="warning"
            showIcon
            title="部分数据加载失败"
            description={loadWarnings.join('；')}
          />
        )}
        {!isPatternProduction && orderId && (
          <PredictionCard
            predicting={predicting}
            prediction={prediction}
            orderId={orderId}
            orderNo={orderSummary.orderNo || ''}
            nodeName={nodeName}
            delegateProcessName={String(currentNodeData.delegateProcessName || '').trim() || undefined}
          />
        )}
        {(nodeTypeKey === 'cutting' || nodeTypeKey === 'procurement') && (
          <div style={{ marginBottom: 8 }}>
            <Button
             
              style={(nodeStats?.percent || 0) >= 100 ? { color: '#999', borderColor: '#d9d9d9' } : {}}
              onClick={() => navigate(
                nodeTypeKey === 'cutting'
                  ? `/production/cutting?orderNo=${encodeURIComponent(orderSummary.orderNo || orderNo || '')}`
                  : `/production/material?orderNo=${encodeURIComponent(orderSummary.orderNo || orderNo || '')}`
              )}
            >
              {nodeTypeKey === 'cutting' ? ' 前往裁剪管理 →' : ' 前往物料采购 →'}
              {(nodeStats?.percent || 0) >= 100 && (
                <span style={{ color: '#999', marginLeft: 4 }}>（已完成）</span>
              )}
            </Button>
          </div>
        )}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
         
          items={(() => {
            const isUnitPriceNode = typeof unitPrice === 'number';
            const showProductionTabs = !isPatternProduction && !isUnitPriceNode;
            return [
              {
                key: 'settings',
                label: <span><FileTextOutlined /> 工序委派</span>,
                children: (
                  <NodeSettingsTab
                    nodeName={nodeName}
                    nodeStats={nodeStats}
                    delegateProcessCode={delegateProcessCode}
                    processList={processList}
                    currentNodeData={currentNodeData}
                    matchedProcess={matchedProcess}
                    disableEdit={disableEdit}
                    saving={saving}
                    factories={factories || []}
                    users={users || []}
                    orderSummary={orderSummary}
                    orderNo={orderNo ?? ''}
                    unitPrice={unitPrice}
                    cuttingSizeItems={cuttingSizeItems}
                    updateNodeData={updateNodeData}
                    handleFactoryChange={handleFactoryChange}
                    handleSave={handleSave}
                  />
                ),
              },
              showProductionTabs && {
                key: 'operators',
                label: <span><UserOutlined /> 操作员 ({operatorSummary.length})</span>,
                children: <OperatorsTab operatorSummary={operatorSummary} />,
              },
              !isPatternProduction && {
                key: 'processTracking',
                label: <span><WalletOutlined /> 工序跟踪（工资结算） ({processTrackingRecords.length})</span>,
                children: (
                  <div>
                    <div style={{ marginBottom: 8, textAlign: 'right' }}>
                      <Button
                       
                        loading={repairLoading}
                        onClick={handleRepairTracking}
                        title="将已入库但跟踪记录为pending的历史数据补同步"
                      >
                        同步入库跟踪
                      </Button>
                    </div>
                    <ProcessTrackingTable
                      records={processTrackingRecords}
                      loading={trackingLoading}
                      orderId={orderId}
                      orderNo={orderSummary.orderNo || orderNo}
                      nodeType={nodeType}
                      nodeName={nodeName}
                      processList={processList.length > 0 ? processList : undefined}
                      onUndoSuccess={handleUndoSuccess}
                    />
                  </div>
                ),
              },
            ].filter(Boolean) as NonNullable<TabsProps['items']>;
          })()}
        />
      </Spin>
    </ResizableModal>
  );
};

export default NodeDetailModal;
