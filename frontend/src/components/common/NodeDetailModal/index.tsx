import React, { useEffect, useState, useMemo } from 'react';
import { App, Drawer, Space, Tag } from 'antd';
import ResizableModal from '../ResizableModal';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { useUser } from '@/utils/AuthContext';
import { useNodeDetailData } from './useNodeDetailData';
import { formatProcessDisplayName } from '@/utils/productionStage';
import NodeDetailBody from './components/NodeDetailBody';
import NodeDetailFooter from './components/NodeDetailFooter';
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
  sourceType,
  patternId,
  mode = 'modal',
  extraData: _extraData,
  onSaved,
  onOpenInspectDrawer,
  factoryType,
}) => {
  const { message } = App.useApp();
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
      setActiveTab((nodeType as NodeType) === 'procurement' ? 'purchase' : 'processTracking');
    }
    if (!visible) {
      setActiveTab((nodeType as NodeType) === 'procurement' ? 'purchase' : 'processTracking');
      setAdminUnlocked(false);
    }
  }, [visible, orderId, nodeType]);

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

  const footer = (
    <NodeDetailFooter
      nodeTypeKey={nodeTypeKey}
      currentNodeData={currentNodeData}
      saving={saving}
      onClear={handleClear}
    />
  );

  const body = (
    <NodeDetailBody
      loading={loading}
      loadWarnings={loadWarnings}
      isPatternProduction={isPatternProduction}
      orderId={orderId}
      orderNo={orderNo}
      orderSummary={orderSummary}
      nodeName={nodeName}
      nodeTypeKey={nodeTypeKey}
      nodeStats={nodeStats}
      mode={mode}
      predicting={predicting}
      prediction={prediction}
      currentNodeData={currentNodeData}
      delegateProcessCode={delegateProcessCode}
      processList={processList}
      matchedProcess={matchedProcess}
      disableEdit={disableEdit}
      saving={saving}
      factories={factories || []}
      users={users || []}
      unitPrice={unitPrice}
      cuttingSizeItems={cuttingSizeItems}
      operatorSummary={operatorSummary}
      processTrackingRecords={processTrackingRecords}
      trackingLoading={trackingLoading}
      repairLoading={repairLoading}
      sourceType={sourceType}
      patternId={patternId}
      factoryType={factoryType}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      updateNodeData={updateNodeData}
      handleFactoryChange={handleFactoryChange}
      handleSave={handleSave}
      handleRepairTracking={handleRepairTracking}
      handleUndoSuccess={handleUndoSuccess}
      onOpenInspectDrawer={onOpenInspectDrawer}
    />
  );

  const title = (
    <Space>
      <span>{nodeName} 详情</span>
      {orderNo && <Tag color="blue">{orderNo}</Tag>}
    </Space>
  );

  if (mode === 'drawer') {
    return (
      <Drawer
        title={title}
        open={visible}
        onClose={onClose}
        size="large"
        styles={{ wrapper: { width: '50%' }, body: { padding: 16 } }}
        footer={footer}
        destroyOnHidden
      >
        {body}
      </Drawer>
    );
  }

  return (
    <ResizableModal
      title={title}
      open={visible}
      onCancel={onClose}
      className="node-detail-modal"
      footer={footer}
      width="85vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
    >
      {body}
    </ResizableModal>
  );
};

export default NodeDetailModal;
