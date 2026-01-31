import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { App, Button, Card, Divider, Input, InputNumber, Popconfirm, Select, Space, Spin, Table, Tabs, Tag, Timeline, Typography, DatePicker } from 'antd';
import { SaveOutlined, TeamOutlined, ShopOutlined, FileTextOutlined, HistoryOutlined, UnorderedListOutlined, UserOutlined, DollarOutlined, ToolOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableModal from './ResizableModal';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { useAuth } from '@/utils/AuthContext';

const { Text, Title } = Typography;
const { TextArea } = Input;

/** 节点类型定义 */
type NodeType = 'procurement' | 'cutting' | 'sewing' | 'ironing' | 'quality' | 'packaging' | 'secondaryProcess';

/** 历史记录项 */
interface HistoryItem {
  time: string;
  operatorName: string;
  action: string; // 'create' | 'update' | 'clear'
  changes?: string; // 修改内容描述
}

/** 单个节点的操作数据 */
interface NodeOperationData {
  assignee?: string;
  assigneeId?: string;
  assigneeQuantity?: number;
  receiveTime?: string;
  completeTime?: string;
  delegateFactoryId?: string;
  delegateFactoryName?: string;
  delegatePrice?: number; // 委派单价/金额
  delegateProcessName?: string; // 外发工序名称
  processType?: string; // 二次工艺类型
  remark?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string; // 操作人名称
  history?: HistoryItem[]; // 操作历史记录
}

/** 所有节点操作数据 */
type NodeOperations = Partial<Record<NodeType, NodeOperationData>>;

/** 工厂信息 */
interface Factory {
  id: string;
  factoryName: string;
}

/** 节点统计信息 */
interface NodeStats {
  done: number;
  total: number;
  percent: number;
  remaining: number;
}

/** 扫码记录 */
interface ScanRecord {
  id: string;
  scanCode?: string;
  orderNo?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  processName?: string;
  progressStage?: string;
  operatorId?: string;
  operatorName?: string;
  scanTime?: string;
  cuttingBundleNo?: number;
  cuttingBundleQrCode?: string;
}

/** 菲号（裁剪扎号）记录 */
interface BundleRecord {
  id: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  qrCode?: string;
  status?: string;
  completed?: boolean;
  completedQty?: number;
}

/** 操作员汇总 */
interface OperatorSummary {
  operatorId: string;
  operatorName: string;
  totalQty: number;
  scanCount: number;
  lastScanTime?: string;
}

/** 工序单价项 */
interface ProcessPriceItem {
  name: string;
  unitPrice?: number;
  quantity?: number;
  completedQuantity?: number;
  estimatedMinutes?: number;
}

/** 样板生产扫码记录 */
interface PatternScanRecord {
  id: string;
  patternProductionId?: string;
  styleId?: string;
  styleNo?: string;
  color?: string;
  operationType?: string;
  operatorId?: string;
  operatorName?: string;
  operatorRole?: string;
  scanTime?: string;
  remark?: string;
}

/** 组件属性 */
interface NodeDetailModalProps {
  visible: boolean;
  onClose: () => void;
  orderId?: string;
  orderNo?: string;
  nodeType: string;
  nodeName: string;
  stats?: NodeStats;
  unitPrice?: number;
  /** 该节点下的所有子工序列表（含单价） */
  processList?: ProcessPriceItem[];
  /** 是否是样板生产（样板生产不显示菲号明细、扫码记录等） */
  isPatternProduction?: boolean;
  /** 额外数据（如采购进度信息、时间节点等） */
  extraData?: {
    procurementProgress?: {
      total: number;
      completed: number;
      percent: number;
      completedTime?: string;
      receiver?: string;
    };
    // 时间节点信息
    releaseTime?: string;
    deliveryTime?: string;
    receiveTime?: string;
    completeTime?: string;
    // 人员信息
    patternMaker?: string;
    receiver?: string;
  };
  onSaved?: () => void;
}

/** 节点是否支持委派工厂 */
const canDelegateFactory = (nodeType: NodeType): boolean => {
  // 采购节点不支持委派（采购由物料采购单管理）
  if (nodeType === 'procurement') return false;
  return ['sewing', 'secondaryProcess'].includes(nodeType);
};

/** 二次工艺类型选项 */
const secondaryProcessTypes = [
  '绣花', '印花', '烫钻', '钉珠', '压褶', '洗水', '染色', '其他'
];

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
  extraData,
  onSaved,
}) => {
  const { message } = App.useApp();
  const { user } = useAuth(); // 获取当前用户

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [factories, setFactories] = useState<Factory[]>();
  const [nodeOperations, setNodeOperations] = useState<NodeOperations>({});
  const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [patternScanRecords, setPatternScanRecords] = useState<PatternScanRecord[]>([]);
  const [activeTab, setActiveTab] = useState('settings');
  // 管理员解锁状态（允许在进度>=80%时仍然编辑）
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  // 判断是否超过80%，超过则禁止修改（除非管理员解锁）
  const isHighProgress = (nodeStats?.percent || 0) >= 80;
  const disableEdit = isHighProgress && !adminUnlocked;

  // 将 nodeType 转换为 NodeType 类型，用于索引
  const nodeTypeKey = nodeType as NodeType;

  // 当前节点的操作数据
  const currentNodeData = nodeOperations[nodeTypeKey] || {};

  const normalizeText = (input?: string): string => {
    const t = String(input || '').trim();
    if (!t) return '';
    try {
      const decoded = decodeURIComponent(escape(t));
      return decoded || t;
    } catch {
      return t;
    }
  };

  // 加载工厂列表
  const loadFactories = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { records: Factory[] } }>('/system/factory/list', {
        params: { page: 1, pageSize: 500 }
      });
      if (res.data?.records) {
        setFactories(res.data.records);
      }
    } catch (err) {
      console.error('加载工厂列表失败', err);
    }
  }, []);

  // 加载节点操作数据
  const loadNodeOperations = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await productionOrderApi.getNodeOperations(orderId);
      if (res.code === 200 && res.data) {
        const parsed = typeof res.data === 'string'
          ? JSON.parse(res.data)
          : res.data;
        setNodeOperations(parsed || {});
      }
    } catch (err) {
      console.error('加载节点操作数据失败', err);
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNo]);

  // 加载扫码记录
  const loadScanRecords = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await productionScanApi.listByOrderId(orderId, {});
      if (res.code === 200 && Array.isArray(res.data)) {
        setScanRecords(res.data as ScanRecord[]);
      }
    } catch (err) {
      console.error('加载扫码记录失败', err);
    }
  }, [orderId]);

  // 加载菲号列表
  const loadBundles = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get<{ code: number; data: { records: BundleRecord[] } }>('/production/cutting/list', {
        params: { productionOrderId: orderId, productionOrderNo: orderNo, page: 1, pageSize: 500 }
      });
      if (res.data?.records) {
        const list = Array.isArray(res.data.records) ? res.data.records : [];
        const filtered = orderNo
          ? list.filter((b) => String(b.qrCode || '').trim().startsWith(String(orderNo || '').trim()))
          : list;
        setBundles(filtered);
      }
    } catch (err) {
      console.error('加载菲号列表失败', err);
    }
  }, [orderId]);

  // 加载样板生产扫码记录
  const loadPatternScanRecords = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get<{ code: number; data: PatternScanRecord[] }>(
        `/production/pattern/${orderId}/scan-records`
      );
      if (res.code === 200 && Array.isArray(res.data)) {
        setPatternScanRecords(res.data);
      }
    } catch (err) {
      console.error('加载样板扫码记录失败', err);
    }
  }, [orderId]);

  // 弹窗打开时加载数据
  useEffect(() => {
    if (visible && orderId) {
      loadFactories();
      loadNodeOperations();
      // 样板生产不加载扫码记录和菲号明细（这些是大货生产的数据）
      if (!isPatternProduction) {
        loadScanRecords();
        loadBundles();
      } else {
        // 样板生产时清空这些数据，加载样板扫码记录
        setScanRecords([]);
        setBundles([]);
        loadPatternScanRecords();
      }
    }
    // 重置状态
    if (!visible) {
      setActiveTab('settings');
      setAdminUnlocked(false); // 关闭弹窗时重置解锁状态
      setPatternScanRecords([]); // 清空样板扫码记录
    }
  }, [visible, orderId, isPatternProduction, loadFactories, loadNodeOperations, loadScanRecords, loadBundles, loadPatternScanRecords]);

  // 筛选当前节点的扫码记录
  const filteredScanRecords = useMemo(() => {
    return scanRecords.filter(r => {
      const recordNode = r.progressStage || r.processName || '';
      return recordNode.includes(nodeName) || nodeName.includes(recordNode);
    });
  }, [scanRecords, nodeName]);

  // 计算菲号在当前节点的完成情况
  const bundlesWithStatus = useMemo(() => {
    return bundles.map(b => {
      // 查找这个菲号在当前节点的扫码记录
      const bundleScanRecords = filteredScanRecords.filter(r =>
        r.cuttingBundleNo === b.bundleNo || r.cuttingBundleQrCode === b.qrCode
      );
      const completedQty = bundleScanRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
      return {
        ...b,
        completed: completedQty >= (b.quantity || 0),
        completedQty,
      };
    });
  }, [bundles, filteredScanRecords]);

  const cuttingTotalQty = useMemo(() => {
    return bundles.reduce((sum, b) => sum + (b.quantity || 0), 0);
  }, [bundles]);

  // 汇总操作员数据
  const operatorSummary = useMemo((): OperatorSummary[] => {
    const map = new Map<string, OperatorSummary>();
    filteredScanRecords.forEach(r => {
      const id = r.operatorId || 'unknown';
      const name = r.operatorName || '未知';
      if (!map.has(id)) {
        map.set(id, { operatorId: id, operatorName: name, totalQty: 0, scanCount: 0 });
      }
      const item = map.get(id)!;
      item.totalQty += r.quantity || 0;
      item.scanCount += 1;
      if (!item.lastScanTime || (r.scanTime && r.scanTime > item.lastScanTime)) {
        item.lastScanTime = r.scanTime;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredScanRecords]);

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

  // 更新委派单价
  const handlePriceChange = (value: number | null) => {
    setNodeOperations(prev => ({
      ...prev,
      [nodeTypeKey]: {
        ...prev[nodeTypeKey],
        delegatePrice: value ?? undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id,
        updatedByName: user?.name || user?.username || '未知',
      }
    }));
  };

  // 生成变更描述
  const generateChangeDescription = (data: NodeOperationData): string => {
    const parts: string[] = [];
    if (data.delegateFactoryName) parts.push(`委派工厂: ${data.delegateFactoryName}`);
    if (data.delegateProcessName) parts.push(`外发工序: ${data.delegateProcessName}`);
    if (data.delegatePrice) parts.push(`单价: ¥${data.delegatePrice}`);
    if (data.processType) parts.push(`工艺类型: ${data.processType}`);
    if (data.assignee) parts.push(`负责人: ${data.assignee}`);
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

  // 进度百分比颜色
  const getProgressColor = (percent: number) => {
    if (percent >= 100) return '#52c41a';
    if (percent >= 50) return '#1890ff';
    if (percent > 0) return '#faad14';
    return '#d9d9d9';
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
  const scanColumns: ColumnsType<ScanRecord> = [
    { title: '扎号', dataIndex: 'cuttingBundleNo', width: 60, render: v => v || '-' },
    { title: '颜色', dataIndex: 'color', width: 70, ellipsis: true },
    { title: '尺码', dataIndex: 'size', width: 50 },
    { title: '数量', dataIndex: 'quantity', width: 50 },
    { title: '操作员', dataIndex: 'operatorName', width: 80, ellipsis: true, render: v => v || '-' },
    { title: '时间', dataIndex: 'scanTime', width: 100, render: formatTime },
  ];

  // 菲号明细表格列
  const bundleColumns: ColumnsType<BundleRecord> = [
    { title: '扎号', dataIndex: 'bundleNo', width: 60 },
    { title: '颜色', dataIndex: 'color', width: 80, ellipsis: true, render: (v) => normalizeText(v) || '-' },
    { title: '尺码', dataIndex: 'size', width: 50 },
    { title: '数量', dataIndex: 'quantity', width: 50 },
    {
      title: '完成',
      dataIndex: 'completedQty',
      width: 70,
      render: (v, r) => (
        <span style={{ color: r.completed ? '#52c41a' : '#faad14' }}>
          {v || 0}/{r.quantity || 0}
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'completed',
      width: 60,
      render: v => v ? <Tag color="success">✓</Tag> : <Tag>待做</Tag>
    },
  ];

  // 操作员明细表格列
  const operatorColumns: ColumnsType<OperatorSummary> = [
    { title: '操作员', dataIndex: 'operatorName', ellipsis: true },
    { title: '完成数', dataIndex: 'totalQty', width: 70 },
    { title: '扫码次数', dataIndex: 'scanCount', width: 80 },
    { title: '最后操作', dataIndex: 'lastScanTime', width: 100, render: formatTime },
  ];

  // 设置面板内容
  const renderSettingsTab = () => (
    <div style={{ padding: '4px 0' }}>
      {/* 时间节点信息（从样板生产传递） */}
      {extraData && (extraData.releaseTime || extraData.deliveryTime) && (
        <div style={{
          marginBottom: 6,
          padding: '6px 8px',
          background: '#f8f9fa',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          fontSize: 12,
          lineHeight: 1.1,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#1f2937', lineHeight: 1.1 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            时间信息
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', color: '#6b7280', lineHeight: 1.1 }}>
            {extraData.releaseTime && (
              <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', maxWidth: '100%', lineHeight: 1.1 }}>
                <b>下板:</b> {extraData.releaseTime}
              </span>
            )}
            {extraData.deliveryTime && (
              <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', maxWidth: '100%', lineHeight: 1.1 }}>
                <b>交板:</b> {extraData.deliveryTime}
              </span>
            )}
            {extraData.receiveTime && (
              <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', maxWidth: '100%', lineHeight: 1.1 }}>
                <b>领取:</b> {extraData.receiveTime}
              </span>
            )}
            {extraData.completeTime && (
              <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', maxWidth: '100%', lineHeight: 1.1 }}>
                <b>完成:</b> {extraData.completeTime}
              </span>
            )}
          </div>
          {(extraData.patternMaker || extraData.receiver) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 4, color: '#6b7280', lineHeight: 1.1 }}>
              {extraData.patternMaker && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', maxWidth: '100%', lineHeight: 1.1 }}>
                  <UserOutlined style={{ marginRight: 2 }} />
                  <b>纸样师傅:</b> {extraData.patternMaker}
                </span>
              )}
              {extraData.receiver && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', maxWidth: '100%', lineHeight: 1.1 }}>
                  <UserOutlined style={{ marginRight: 2 }} />
                  <b>领取人:</b> {extraData.receiver}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 采购进度特殊显示 */}
      {nodeName === '采购' && extraData?.procurementProgress && (
        <div style={{
          marginBottom: 12,
          padding: '12px 16px',
          background: extraData.procurementProgress.percent >= 100 ? '#f0fdf4' : '#fef3c7',
          borderRadius: 8,
          border: `1px solid ${extraData.procurementProgress.percent >= 100 ? '#86efac' : '#fbbf24'}`,
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8,
              lineHeight: 1.1,
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: extraData.procurementProgress.percent >= 100 ? '#059669' : '#d97706',
                lineHeight: 1.1,
              }}>
                {extraData.procurementProgress.percent >= 100 ? '✅ 采购已完成' : '⏳ 采购进行中'}
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: extraData.procurementProgress.percent >= 100 ? '#059669' : '#d97706',
                lineHeight: 1.1,
              }}>
                {extraData.procurementProgress.percent}%
              </div>
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 16px',
              fontSize: 13,
              color: '#6b7280',
              lineHeight: 1.1,
            }}>
              <span style={{ fontWeight: 600, color: '#1f2937', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden' }}>
                已完成采购单：{extraData.procurementProgress.completed} / {extraData.procurementProgress.total}
              </span>
              {extraData.procurementProgress.completedTime && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', lineHeight: 1.1 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  完成时间：<span style={{ fontWeight: 600, color: '#1f2937' }}>{extraData.procurementProgress.completedTime}</span>
                </span>
              )}
              {extraData.procurementProgress.receiver && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', lineHeight: 1.1 }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  操作人：<span style={{ fontWeight: 600, color: '#1f2937' }}>{extraData.procurementProgress.receiver}</span>
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'white',
              border: '1px solid #d1fae5',
              fontWeight: 700,
              color: '#059669',
              fontSize: 16
            }}>
              {(nodeStats?.done || 0)}/{nodeStats?.total || 0} {(nodeStats?.percent || 0).toFixed(0)}%
            </div>
            {processList.length > 0 && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#e6f4ff',
                border: '1px solid #bae0ff',
                color: '#0958d9'
              }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>工序单价明细 ({processList.length}项)</div>
                <div style={{ fontSize: 15 }}>采购: ¥{(unitPrice || 0).toFixed(2)}</div>
                <div style={{ fontSize: 15 }}>总计: ¥{processList.reduce((s, p) => s + (p.unitPrice || 0), 0).toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {unitPrice !== undefined && nodeName !== '采购' && (
        <div style={{
          marginBottom: 8,
          padding: '8px 12px',
          background: (nodeStats?.percent || 0) >= 100 ? '#f0fdf4' : '#fef3c7',
          borderRadius: 8,
          border: `1px solid ${(nodeStats?.percent || 0) >= 100 ? '#86efac' : '#fbbf24'}`,
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
              lineHeight: 1.1,
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: (nodeStats?.percent || 0) >= 100 ? '#059669' : '#d97706',
                lineHeight: 1.1,
              }}>
                {(nodeStats?.percent || 0) >= 100 ? `✅ ${nodeName}已完成` : `⏳ ${nodeName}进行中`}
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: (nodeStats?.percent || 0) >= 100 ? '#059669' : '#d97706',
                lineHeight: 1.1,
              }}>
                {(nodeStats?.percent || 0).toFixed(0)}%
              </div>
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 16px',
              fontSize: 13,
              color: '#6b7280',
              lineHeight: 1.1,
            }}>
              <span style={{ fontWeight: 600, color: '#1f2937', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden' }}>
                已完成：{nodeStats?.done || 0} / {nodeStats?.total || 0}
              </span>
              {currentNodeData.completeTime && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', lineHeight: 1.1 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  完成时间：<span style={{ fontWeight: 600, color: '#1f2937' }}>{new Date(currentNodeData.completeTime).toLocaleString('zh-CN')}</span>
                </span>
              )}
              {currentNodeData.assignee && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden', lineHeight: 1.1 }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  操作人：<span style={{ fontWeight: 600, color: '#1f2937' }}>{currentNodeData.assignee}</span>
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'white',
              border: '1px solid #d1fae5',
              fontWeight: 700,
              color: '#059669',
              fontSize: 16
            }}>
              {(nodeStats?.done || 0)}/{nodeStats?.total || 0} {(nodeStats?.percent || 0).toFixed(0)}%
            </div>
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#e6f4ff',
              border: '1px solid #bae0ff',
              color: '#0958d9'
            }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>工序单价明细 ({processList.length}项)</div>
              <div style={{ fontSize: 15 }}>{nodeName}: ¥{(unitPrice || 0).toFixed(2)}</div>
              <div style={{ fontSize: 15 }}>总计: ¥{processList.reduce((s, p) => s + (p.unitPrice || 0), 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}



      {/* 进度超过80%提示 + 管理解锁 */}
      {isHighProgress && (
        <div style={{
          marginBottom: 8,
          padding: '6px 10px',
          background: adminUnlocked ? '#f0f9ff' : '#fff7e6',
          borderRadius: 4,
          border: `1px solid ${adminUnlocked ? '#91caff' : '#ffd591'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Text type={adminUnlocked ? 'secondary' : 'warning'} style={{ fontSize: 12 }}>
            {adminUnlocked
              ? '🔓 已解锁编辑，修改后请保存'
              : `⚠️ 进度已达 ${(nodeStats?.percent || 0).toFixed(0)}%，设置已锁定`}
          </Text>
          {adminUnlocked ? (
            <Button
              size="small"
              onClick={() => setAdminUnlocked(false)}
              style={{ fontSize: 12 }}
            >
              重新锁定
            </Button>
          ) : (
            <Popconfirm
              title="管理解锁"
              description="解锁后可修改委派设置，确定要解锁吗？"
              onConfirm={() => {
                setAdminUnlocked(true);
                message.info('已解锁，可以修改设置');
              }}
              okText="确定解锁"
              cancelText="取消"
            >
              <Button size="small" type="link" danger style={{ fontSize: 12, padding: '0 4px' }}>
                管理解锁
              </Button>
            </Popconfirm>
          )}
        </div>
      )}

      {/* 二次工艺类型（仅二次工艺节点显示） */}
      {nodeTypeKey === 'secondaryProcess' && (
        <>
          <div style={{ marginBottom: 6 }}>
            <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
              <FileTextOutlined /> 工艺类型
            </Text>
            <Select
              allowClear
              placeholder="选择工艺类型"
              style={{ width: '100%' }}
              value={currentNodeData.processType}
              onChange={(v) => updateNodeData('processType', v)}
              options={secondaryProcessTypes.map(t => ({ value: t, label: t }))}
              disabled={disableEdit}
            />
          </div>
          <Divider style={{ margin: '6px 0' }} />
        </>
      )}

      {/* 委派工厂（仅支持委派的节点显示） */}
      {canDelegateFactory(nodeTypeKey as NodeType) && (
        <>

          {/* 委派工序统计信息 */}
          {currentNodeData.delegateFactoryId && processList.length > 0 && (
            <div style={{
              marginBottom: 10,
              padding: '10px 12px',
              background: '#fff7e6',
              borderRadius: 6,
              border: '1px solid #ffd591'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 12, color: '#d46b08' }}>
                  <ToolOutlined /> 委派工序明细
                </Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    总数量: <Text strong>{nodeStats?.total || 0}</Text> 件
                  </Text>
                  <Text strong style={{ fontSize: 13, color: '#d46b08' }}>
                    预计总金额: ¥{(processList.reduce((s, p) => s + (p.unitPrice || 0), 0) * (nodeStats?.total || 0)).toFixed(2)}
                  </Text>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                {processList.map((p, i) => (
                  <div key={i} style={{
                    padding: '6px 8px',
                    background: 'white',
                    borderRadius: 4,
                    border: '1px solid #ffe7ba'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>单价: ¥{(p.unitPrice || 0).toFixed(2)}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#f97316' }}>小计: ¥{((p.unitPrice || 0) * (nodeStats?.total || 0)).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 单行：委派工厂 + 外发工序 + 单价 + 负责人 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, lineHeight: 1.1, flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 280 }}>
              <Text strong style={{ fontSize: 13 }}>
                <ShopOutlined /> 委派工厂
              </Text>
              <Select
                allowClear
                showSearch
                placeholder="选择帮忙做货的工厂"
                style={{ width: 200 }}
                value={currentNodeData.delegateFactoryId}
                onChange={handleFactoryChange}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={factories?.map(f => ({ value: f.id, label: f.factoryName })) || []}
                disabled={disableEdit}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 220 }}>
              <Text strong style={{ fontSize: 13 }}>
                <ToolOutlined /> 外发工序
              </Text>
              <Input
                placeholder="车缝、锁边"
                value={currentNodeData.delegateProcessName}
                onChange={(e) => updateNodeData('delegateProcessName', e.target.value)}
                disabled={disableEdit}
                style={{ width: 160 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 220 }}>
              <Text strong style={{ fontSize: 13 }}>
                <DollarOutlined /> 单价
              </Text>
              <Space.Compact>
                <InputNumber
                  placeholder="元/件"
                  style={{ width: 120 }}
                  min={0}
                  precision={2}
                  value={currentNodeData.delegatePrice}
                  onChange={handlePriceChange}
                  disabled={disableEdit}
                />
                <Button disabled style={{ pointerEvents: 'none' }}>元</Button>
              </Space.Compact>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 220 }}>
              <Text strong style={{ fontSize: 13 }}>
                <TeamOutlined /> 负责人
              </Text>
              <Input
                placeholder="姓名"
                value={currentNodeData.assignee}
                onChange={(e) => updateNodeData('assignee', e.target.value)}
                disabled={disableEdit}
                style={{ width: 140 }}
              />
            </div>
          </div>
          {currentNodeData.delegatePrice && nodeStats?.total && (
            <Text type="secondary" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>
              预计总金额: ¥{(currentNodeData.delegatePrice * nodeStats.total).toFixed(2)}
            </Text>
          )}

          <Divider style={{ margin: '6px 0' }} />
        </>
      )}

      <div style={{ marginBottom: 6 }}>
        <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
          <ClockCircleOutlined /> 领取与完成时间
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserOutlined />
            <Text type="secondary">领取人</Text>
            <Input
              placeholder="账号/姓名"
              value={currentNodeData.assignee}
              onChange={(e) => updateNodeData('assignee', e.target.value)}
              disabled={disableEdit}
              style={{ width: 160 }}
            />
            <Text type="secondary">数量</Text>
            <InputNumber
              placeholder="件数"
              style={{ width: 120 }}
              min={0}
              precision={0}
              max={cuttingTotalQty || nodeStats?.total || 0}
              value={typeof currentNodeData.assigneeQuantity === 'number' ? currentNodeData.assigneeQuantity : undefined}
              onChange={(v) => {
                const max = cuttingTotalQty || nodeStats?.total || 0;
                const n = typeof v === 'number' ? Math.max(0, Math.min(v, max)) : undefined;
                updateNodeData('assigneeQuantity', n);
              }}
              disabled={disableEdit}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined />
            <Text type="secondary">领取时间</Text>
            <DatePicker
              showTime
              style={{ width: 220 }}
              value={currentNodeData.receiveTime ? dayjs(currentNodeData.receiveTime) : undefined}
              onChange={(v) => updateNodeData('receiveTime', v ? v.toISOString() : undefined)}
              disabled={disableEdit}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined />
            <Text type="secondary">完成时间</Text>
            <DatePicker
              showTime
              style={{ width: 220 }}
              value={currentNodeData.completeTime ? dayjs(currentNodeData.completeTime) : undefined}
              onChange={(v) => updateNodeData('completeTime', v ? v.toISOString() : undefined)}
              disabled={disableEdit}
            />
          </div>
        </div>
      </div>

      {/* 备注 */}
      <div style={{ marginBottom: 4 }}>
        <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
          <FileTextOutlined /> 备注
        </Text>
        <TextArea
          rows={1}
          placeholder="加急、特殊要求等"
          value={currentNodeData.remark}
          onChange={(e) => updateNodeData('remark', e.target.value)}
          maxLength={200}
          disabled={disableEdit}
        />
      </div>

      {/* 更新时间和操作人 */}
      {currentNodeData.updatedAt && (
        <div style={{ marginTop: 4, padding: '6px 10px', background: '#f5f5f5', borderRadius: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            更新: {new Date(currentNodeData.updatedAt).toLocaleString()}
            {currentNodeData.updatedByName && (
              <span style={{ marginLeft: 8 }}>
                by <span style={{ color: '#1890ff' }}>{currentNodeData.updatedByName}</span>
              </span>
            )}
          </Text>
        </div>
      )}
    </div>
  );

  // 扫码记录 Tab
  // 样板生产扫码记录 Tab
  const renderPatternScanRecordsTab = () => {
    const operationLabels: Record<string, { text: string; color: string }> = {
      RECEIVE: { text: '领取', color: 'blue' },
      PLATE: { text: '车板', color: 'purple' },
      FOLLOW_UP: { text: '跟单', color: 'cyan' },
      COMPLETE: { text: '完成', color: 'green' },
      WAREHOUSE_IN: { text: '入库', color: 'orange' },
    };

    const patternScanColumns: ColumnsType<PatternScanRecord> = [
      {
        title: '时间',
        dataIndex: 'scanTime',
        width: 150,
        render: (v) => v ? new Date(v).toLocaleString('zh-CN') : '-',
      },
      {
        title: '操作类型',
        dataIndex: 'operationType',
        width: 100,
        render: (v) => {
          const op = operationLabels[v] || { text: v, color: 'default' };
          return <Tag color={op.color}>{op.text}</Tag>;
        },
      },
      {
        title: '操作员',
        dataIndex: 'operatorName',
        width: 100,
      },
      {
        title: '角色',
        dataIndex: 'operatorRole',
        width: 80,
        render: (v) => {
          const roles: Record<string, string> = {
            PLATE_WORKER: '车板师',
            MERCHANDISER: '跟单员',
            WAREHOUSE: '仓管',
          };
          return roles[v] || v || '-';
        },
      },
      {
        title: '备注',
        dataIndex: 'remark',
        ellipsis: true,
      },
    ];

    return (
      <div style={{ padding: '4px 0' }}>
        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">共 {patternScanRecords.length} 条操作记录</Text>
        </div>
        <Table
          size="small"
          rowKey="id"
          dataSource={patternScanRecords}
          columns={patternScanColumns}
          pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
          scroll={{ y: 280 }}
          locale={{ emptyText: '暂无扫码记录' }}
        />
      </div>
    );
  };

  const renderScanRecordsTab = () => (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">共 {filteredScanRecords.length} 条扫码记录</Text>
        <Text type="secondary">合计: {filteredScanRecords.reduce((s, r) => s + (r.quantity || 0), 0)} 件</Text>
      </div>
      <Table
        size="small"
        rowKey="id"
        dataSource={filteredScanRecords}
        columns={scanColumns}
        pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
        scroll={{ y: 280 }}
      />
    </div>
  );

  // 菲号明细 Tab
  const renderBundlesTab = () => {
    const completedCount = bundlesWithStatus.filter(b => b.completed).length;
    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">共 {bundlesWithStatus.length} 个扎号</Text>
          <Text type="secondary">
            已完成: <span style={{ color: '#52c41a' }}>{completedCount}</span> / {bundlesWithStatus.length}
          </Text>
        </div>
        <Table
          size="small"
          rowKey="id"
          dataSource={bundlesWithStatus}
          columns={bundleColumns}
          pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
          scroll={{ y: 280 }}
        />
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
      <Table
        size="small"
        rowKey="operatorId"
        dataSource={operatorSummary}
        columns={operatorColumns}
        pagination={false}
        scroll={{ y: 300 }}
      />
    </div>
  );

  // 操作历史 Tab
  const renderHistoryTab = () => {
    const history = currentNodeData.history || [];
    const getActionColor = (action: string) => {
      switch (action) {
        case 'create': return 'green';
        case 'update': return 'blue';
        case 'clear': return 'red';
        case 'admin_unlock_update': return 'orange'; // 管理解锁修改
        default: return 'gray';
      }
    };
    const getActionText = (action: string) => {
      switch (action) {
        case 'create': return '创建';
        case 'update': return '修改';
        case 'clear': return '清空';
        case 'admin_unlock_update': return '管理解锁修改';
        default: return action;
      }
    };

    return (
      <div style={{ padding: '8px 0' }}>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            <ClockCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
            <div>暂无操作记录</div>
          </div>
        ) : (
          <Timeline
            style={{ maxHeight: 350, overflowY: 'auto', padding: '8px 0' }}
            items={[...history].reverse().map((item, index) => ({
              key: index,
              color: getActionColor(item.action),
              children: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Tag color={getActionColor(item.action)} style={{ margin: 0 }}>
                      {getActionText(item.action)}
                    </Tag>
                    <Text strong>{item.operatorName}</Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(item.time).toLocaleString()}
                  </Text>
                  {item.changes && (
                    <div style={{ marginTop: 4, fontSize: 13, color: '#666' }}>
                      {item.changes}
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </div>
    );
  };

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
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />} loading={saving}>
                  清空设置
                </Button>
              </Popconfirm>
            )}
          </div>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Space>
        </div>
      }
      width="60vw"
      initialHeight={580}
    >
      <Spin spinning={loading}>
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
                label: <span><FileTextOutlined /> 设置</span>,
                children: renderSettingsTab(),
              },
              // 样板生产显示专用的扫码记录Tab
              isPatternProduction && {
                key: 'patternScanRecords',
                label: <span><HistoryOutlined /> 操作记录 ({patternScanRecords.length})</span>,
                children: renderPatternScanRecordsTab(),
              },
              // 大货生产显示扫码记录、菲号明细、操作员 tab
              showProductionTabs && {
                key: 'scanRecords',
                label: <span><HistoryOutlined /> 扫码记录 ({filteredScanRecords.length})</span>,
                children: renderScanRecordsTab(),
              },
              showProductionTabs && {
                key: 'bundles',
                label: <span><UnorderedListOutlined /> 菲号明细 ({bundlesWithStatus.length})</span>,
                children: renderBundlesTab(),
              },
              showProductionTabs && {
                key: 'operators',
                label: <span><UserOutlined /> 操作员 ({operatorSummary.length})</span>,
                children: renderOperatorsTab(),
              },
              {
                key: 'history',
                label: <span><ClockCircleOutlined /> 操作历史 ({currentNodeData.history?.length || 0})</span>,
                children: renderHistoryTab(),
              },
            ].filter(Boolean);
          })()}
        />
      </Spin>
    </ResizableModal>
  );
};

export default NodeDetailModal;
