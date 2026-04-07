import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Input, InputNumber, Popconfirm, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { FileTextOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import PredictionFeedbackBar from '@/components/common/PredictionFeedbackBar';
import ResizableModal from '../ResizableModal';
import dayjs from 'dayjs';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { useAuth } from '@/utils/AuthContext';
import ProcessTrackingTable from '@/components/production/ProcessTrackingTable';
import { useNodeDetailData } from './useNodeDetailData';
import type { NodeType, HistoryItem, NodeOperationData, OperatorSummary, NodeDetailModalProps } from './types';

const { Text } = Typography;

const formatDelegationTime = (value?: string) => (value ? dayjs(value).format('MM/DD HH:mm') : '-');


/**
 * 节点详情弹窗组件
 * 点击进度球弹出，显示节点详情并支持委派、指定、备注等操作
 */
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
  const { user } = useAuth(); // 获取当前用户

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

  // 弹窗开关时重置 UI 状态
  useEffect(() => {
    if (visible && orderId) {
      setActiveTab('processTracking');
    }
    if (!visible) {
      setActiveTab('processTracking');
      setAdminUnlocked(false);
    }
  }, [visible, orderId]);

  // 判断是否超过80%，超过则禁止修改（除非管理员解锁）
  const isHighProgress = (nodeStats?.percent || 0) >= 80;
  const disableEdit = isHighProgress && !adminUnlocked;

  // 将 nodeType 转换为 NodeType 类型，用于索引
  const nodeTypeKey = nodeType as NodeType;

  // 当前节点的操作数据
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

  // 更新当前节点数据
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

  // 选择委派工厂
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

  // 生成变更描述
  const generateChangeDescription = (data: NodeOperationData): string => {
    const parts: string[] = [];
    if (data.delegateType === 'person') {
      parts.push(`委派类型: 人员`);
      if (data.assignee) parts.push(`委派人员: ${data.assignee}`);
    } else {
      parts.push(`委派类型: 工厂`);
      if (data.delegateFactoryName) parts.push(`委派工厂: ${data.delegateFactoryName}`);
    }
    if (data.delegateProcessName) parts.push(`外发工序: ${data.delegateProcessName}`);
    if (data.delegatePrice) parts.push(`单价: ¥${data.delegatePrice}`);
    if (data.processType) parts.push(`工艺类型: ${data.processType}`);
    if (typeof data.assigneeQuantity === 'number') parts.push(`领取数量: ${data.assigneeQuantity}`);
    if (data.receiveTime) parts.push(`领取时间: ${new Date(data.receiveTime).toLocaleString()}`);
    if (data.completeTime) parts.push(`完成时间: ${new Date(data.completeTime).toLocaleString()}`);
    if (data.remark) parts.push(`备注: ${data.remark.slice(0, 20)}${data.remark.length > 20 ? '...' : ''}`);
    return parts.join('; ') || '无';
  };

  // 保存（带历史记录）
  const handleSave = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      // 为当前节点添加历史记录
      const currentData = nodeOperations[nodeTypeKey] || {};
      const existingHistory = currentData.history || [];
      // 判断操作类型：新建/普通更新/管理解锁修改
      let actionType: string = existingHistory.length === 0 ? 'create' : 'update';
      if (adminUnlocked && isHighProgress) {
        actionType = 'admin_unlock_update'; // 管理解锁后的修改
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
          history: [...existingHistory, newHistoryItem].slice(-20), // 只保留最近20条
        }
      };

      const res = await productionOrderApi.saveNodeOperations(
        orderId,
        JSON.stringify(updatedOperations)
      );
      if (res.code === 200) {
        message.success('保存成功');
        // PC手动操作同步为扫码记录（确保PC/手机数据互通）
        const qty = currentData.assigneeQuantity;
        if (!isPatternProduction && typeof qty === 'number' && qty > 0) {
          const nodeKey = String(nodeTypeKey);
          const scanType = (() => {
            if (nodeKey === 'cutting') return 'cutting';
            if (nodeKey === 'procurement') return 'procurement';
            if (nodeKey === 'warehousing') return 'warehouse'; // 修正：后端/DB/小程序均用 warehouse
            return 'production';
          })();

          // 提取工序名称和单价（修复：定义在函数作用域内）
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
          } catch (syncErr: any) {
            message.warning(syncErr?.message || 'PC同步扫码失败');
          }
        }
        setAdminUnlocked(false); // 保存后重置解锁状态
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

  // 清空当前节点设置
  const handleClear = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      const currentData = nodeOperations[nodeTypeKey] || {};
      const existingHistory = currentData.history || [];

      // 添加清空记录到历史
      const clearHistoryItem: HistoryItem = {
        time: new Date().toISOString(),
        operatorName: user?.name || user?.username || '未知',
        action: 'clear',
        changes: '清空了所有设置',
      };

      const updatedOperations = {
        ...nodeOperations,
        [nodeTypeKey]: {
          // 只保留历史记录，其他全部清空
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

  // 格式化时间
  const formatTime = (time?: string) => {
    if (!time) return '-';
    try {
      return new Date(time).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return time;
    }
  };

  // 扫码记录表格列
  // 操作员明细表格列
  const operatorColumns: ColumnsType<OperatorSummary> = [
    { title: '操作员', dataIndex: 'operatorName', ellipsis: true },
    { title: '完成数', dataIndex: 'totalQty', width: 70 },
    { title: '扫码次数', dataIndex: 'scanCount', width: 80 },
    { title: '最后操作', dataIndex: 'lastScanTime', width: 100, render: formatTime },
  ];

  // 设置面板内容
  const renderSettingsTab = () => {
    const fixedProcessName = String(
      currentNodeData.delegateProcessName || (matchedProcess as any)?.name || (matchedProcess as any)?.processName || nodeName || ''
    ).trim();
    const fixedUnitPrice = (() => {
      if (typeof currentNodeData.delegatePrice === 'number') return currentNodeData.delegatePrice;
      const picked = Number((matchedProcess as any)?.unitPrice);
      if (Number.isFinite(picked)) return picked;
      return Number(unitPrice) || 0;
    })();
    const orderInfoLine = `${orderSummary.orderNo || orderNo || '-'}  款号：${orderSummary.styleNo || '-'}  数量：${orderSummary.orderQuantity || 0} 件`;

    return (
      <div style={{ padding: '4px 0', minHeight: 400 }}>
        <Alert
          type="info"
          showIcon
          title="可以为不同的生产节点指定执行工厂"
          style={{ marginBottom: 10 }}
        />
        <div style={{
          padding: '8px 10px',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          marginBottom: 6,
          fontSize: "var(--font-size-xs)",
          color: 'var(--color-text-secondary)'
        }}>
          订单：{orderInfoLine}
        </div>

        {/* 裁剪数量展示（仅有裁剪数据时显示） */}
        {cuttingSizeItems.length > 0 && (
          <div style={{
            padding: '8px 10px',
            border: '1px solid #b7eb8f',
            background: 'rgba(34, 197, 94, 0.15)',
            borderRadius: 12,
            marginBottom: 6,
            fontSize: "var(--font-size-sm)",
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap'
          }}>
            <span style={{ color: '#595959', fontWeight: 600 }}>裁剪数量：</span>
            {cuttingSizeItems.map(item => (
              <span key={item.size} style={{
                color: 'var(--color-success)',
                fontWeight: 600,
                padding: '2px 8px',
                background: 'var(--color-bg-base)',
                borderRadius: 4,
                border: '1px solid #b7eb8f'
              }}>
                {item.size}: {item.quantity}
              </span>
            ))}
            <span style={{ color: 'var(--color-success)', fontWeight: 700, marginLeft: 4 }}>
              总计: {cuttingSizeItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 8,
          padding: '6px 8px',
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          fontSize: "var(--font-size-xs)",
          color: 'var(--color-text-secondary)',
          fontWeight: 600,
          width: '100%',
          overflow: 'hidden',
        }}>
          <div>生产节点</div>
          <div>当前状态</div>
          <div>工序编号</div>
          <div>工序名称</div>
          <div>数量</div>
          <div>委派类型</div>
          <div>执行工厂</div>
          <div>委派人员</div>
          <div>委派单价</div>
          <div>委派时间</div>
          <div>操作</div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 8,
          padding: '8px',
          border: '1px solid var(--color-border)',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          alignItems: 'center',
          marginBottom: 10,
          width: '100%',
          overflow: 'hidden',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 0 }}>{nodeName || '-'}</div>
          <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>
            {typeof nodeStats?.percent === 'number'
              ? (nodeStats.percent >= 100 ? '完成' : `${Math.round(nodeStats.percent)}%`)
              : '-'}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>{delegateProcessCode || '-'}</div>
          <Select
            value={fixedProcessName || undefined}
            placeholder="选择工序"
            options={processList.map((p) => ({ value: String((p as any)?.name || '').trim(), label: String((p as any)?.name || '').trim() })).filter((o) => o.value)}
            disabled
            style={{ width: '100%', minWidth: 0 }}
          />
          <InputNumber
            placeholder="数量"
            min={0}
            precision={0}
            value={typeof currentNodeData.assigneeQuantity === 'number' ? currentNodeData.assigneeQuantity : undefined}
            onChange={(v) => updateNodeData('assigneeQuantity', v)}
            disabled={disableEdit}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Select
            value={currentNodeData.delegateType || 'factory'}
            onChange={(v) => {
              updateNodeData('delegateType', v);
              if (v === 'factory') {
                updateNodeData('assigneeId', undefined);
                updateNodeData('assignee', undefined);
              } else {
                updateNodeData('delegateFactoryId', undefined);
                updateNodeData('delegateFactoryName', undefined);
              }
            }}
            options={[
              { value: 'factory', label: '工厂' },
              { value: 'person', label: '人员' },
            ]}
            disabled={disableEdit}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Select
            allowClear
            showSearch
            placeholder="选择工厂"
            value={currentNodeData.delegateFactoryId}
            onChange={handleFactoryChange}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={factories?.map(f => ({ value: f.id, label: f.factoryName })) || []}
            disabled={disableEdit || currentNodeData.delegateType === 'person'}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Select
            allowClear
            showSearch
            placeholder="选择人员"
            value={currentNodeData.assigneeId}
            onChange={(v, option) => {
              updateNodeData('assigneeId', v);
              updateNodeData('assignee', (option as any)?.label || v);
            }}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={users.map(u => ({ value: u.id, label: u.name || u.username }))}
            disabled={disableEdit || currentNodeData.delegateType === 'factory'}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Input
            prefix="¥"
            value={Number.isFinite(fixedUnitPrice) ? fixedUnitPrice.toFixed(2) : '0.00'}
            disabled
            style={{ width: '100%', minWidth: 0 }}
          />
          <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>{formatDelegationTime(currentNodeData.updatedAt)}</div>
          <Button size="small" type="primary" loading={saving} onClick={handleSave} disabled={disableEdit}>
            保存
          </Button>
        </div>

        <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--color-text-secondary)', marginBottom: 4 }}>委派历史</div>
        {currentNodeData.history && currentNodeData.history.length > 0 ? (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px' }}>
            {currentNodeData.history.slice().reverse().map((h, idx) => (
              <div key={`${h.time}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: idx === currentNodeData.history.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
                <div style={{ color: 'var(--color-text-primary)' }}>{h.operatorName || '-'}</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{formatDelegationTime(h.time)}</div>
                <div style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{h.changes || '-'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            暂无委派记录
          </div>
        )}
      </div>
    );
  };

  // 操作员明细 Tab
  const renderOperatorsTab = () => (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">共 {operatorSummary.length} 位操作员参与</Text>
        <Text type="secondary">
          总完成: {operatorSummary.reduce((s, o) => s + o.totalQty, 0)} 件
        </Text>
      </div>
      <ResizableTable
        storageKey="node-detail-operators"
        size="small"
        rowKey="operatorId"
        dataSource={operatorSummary}
        columns={operatorColumns}
        pagination={false}
        scroll={{ y: 300 }}
      />
    </div>
  );


  // 检查是否有设置数据
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
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Space>
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
        {/* 进度预测卡 */}
        {!isPatternProduction && orderId && (predicting || prediction) && (
          <div style={{
            background: 'linear-gradient(135deg,#f0f7ff 0%,#e8f4fd 100%)',
            border: '1px solid #91caff',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 8,
            fontSize: 13,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}></span>
              {predicting ? (
                <span style={{ color: '#1677ff' }}>预测中…</span>
              ) : prediction?.predictedFinishTime ? (
                <div>
                  <span style={{ color: '#333' }}>
                    预计完工：<b style={{ color: '#1677ff' }}>
                      {dayjs(prediction.predictedFinishTime).format('MM-DD HH:mm')}
                    </b>
                  </span>
                  {(prediction.confidence != null) && (
                    <span style={{ color: '#888', marginLeft: 4 }}>
                      置信 <b style={{ color: prediction.confidence >= 70 ? '#52c41a' : prediction.confidence >= 40 ? '#fa8c16' : '#ff4d4f' }}>
                        {prediction.confidence}%
                      </b>
                    </span>
                  )}
                  {prediction.reasons && prediction.reasons.length > 0 && (
                    <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>
                      · {prediction.reasons[0]}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            {!!prediction?.predictedFinishTime && (
              <PredictionFeedbackBar
                predictionId={prediction?.predictionId}
                predictedFinishTime={prediction?.predictedFinishTime}
                orderId={orderId}
                orderNo={orderSummary.orderNo}
                stageName={nodeName}
                processName={String(currentNodeData.delegateProcessName || nodeName || '').trim() || undefined}
              />
            )}
          </div>
        )}
        {(nodeTypeKey === 'cutting' || nodeTypeKey === 'procurement') && (
          <div style={{ marginBottom: 8 }}>
            <Button
              size="small"
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
          size="small"
          items={(() => {
            const isUnitPriceNode = typeof unitPrice === 'number';
            const showProductionTabs = !isPatternProduction && !isUnitPriceNode;
            return [
              {
                key: 'settings',
                label: <span><FileTextOutlined /> 工序委派</span>,
                children: renderSettingsTab(),
              },
              // 大货生产显示操作员 tab
              showProductionTabs && {
                key: 'operators',
                label: <span><UserOutlined /> 操作员 ({operatorSummary.length})</span>,
                children: renderOperatorsTab(),
              },
              // 工序跟踪（工资结算）- 所有大货生产都显示（不受 unitPrice 限制）
              !isPatternProduction && {
                key: 'processTracking',
                label: <span><WalletOutlined /> 工序跟踪（工资结算） ({processTrackingRecords.length})</span>,
                children: (() => {
                  // processList 已由调用方按节点提取子工序（getProcessesByNodeFromOrder），
                  // 直接传给 ProcessTrackingTable 的 Strategy-0 做动态匹配，无需二次过滤。
                  return (
                    <div>
                      <div style={{ marginBottom: 8, textAlign: 'right' }}>
                        <Button
                          size="small"
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
                  );
                })(),
              },

            ].filter(Boolean);
          })()}
        />
      </Spin>
    </ResizableModal>
  );
};

export default NodeDetailModal;
