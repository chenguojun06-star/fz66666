import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, App, Button, Input, InputNumber, Popconfirm, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { FileTextOutlined, UnorderedListOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from './ResizableModal';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { useAuth } from '@/utils/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getScanTypeFromNodeKey, matchRecordToStage } from '@/utils/productionStage';
import ProcessTrackingTable from '@/components/production/ProcessTrackingTable';
import { getProductionProcessTracking } from '@/utils/api/production';

const { Text } = Typography;

const formatDelegationTime = (value?: string) => (value ? dayjs(value).format('MM/DD HH:mm') : '-');

const patternOperationLabels: Record<string, { text: string; color: string }> = {
  RECEIVE: { text: '领取', color: 'blue' },
  PLATE: { text: '车板', color: 'purple' },
  FOLLOW_UP: { text: '跟单', color: 'cyan' },
  COMPLETE: { text: '完成', color: 'green' },
  WAREHOUSE_IN: { text: '入库', color: 'orange' },
};

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
  id?: string;
  processCode?: string;
  code?: string;
  name: string;
  unitPrice?: number;
  quantity?: number;
  completedQuantity?: number;
  estimatedMinutes?: number;
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
  const { user } = useAuth(); // 获取当前用户
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [factories, setFactories] = useState<Factory[]>();
  const [nodeOperations, setNodeOperations] = useState<NodeOperations>({});
  const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [orderDetail, setOrderDetail] = useState<Record<string, unknown> | null>(null);
  const [orderSummary, setOrderSummary] = useState<{ orderNo?: string; styleNo?: string; orderQuantity?: number }>({
    orderNo,
  });
  const [activeTab, setActiveTab] = useState('settings');
  // 管理员解锁状态（允许在进度>=80%时仍然编辑）
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  // 工序跟踪（工资结算）数据
  const [processTrackingRecords, setProcessTrackingRecords] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orderId) {
        setOrderSummary({ orderNo });
        return;
      }
      try {
        const res = await productionOrderApi.list({ orderNo: orderId, page: 1, pageSize: 1 });
        const result = res as any;
        if (!cancelled && result.code === 200 && result.data) {
          const data = result.data as { records?: unknown[] };
          const records = data?.records || [];
          if (records.length > 0) {
            const orderData = records[0] as any;
            setOrderDetail(orderData);
            setOrderSummary({
              orderNo: String(orderData.orderNo || orderNo || '').trim() || undefined,
              styleNo: String(orderData.styleNo || '').trim() || undefined,
              orderQuantity: Number(orderData.orderQuantity ?? 0) || 0,
            });
          }
        }
      } catch {
        if (!cancelled) setOrderSummary({ orderNo });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
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

  // 加载工序跟踪数据（工资结算依据）
  const loadProcessTrackingData = useCallback(async () => {
    if (!orderId) {
      // 无订单ID，跳过加载工序跟踪数据
      return;
    }

    setTrackingLoading(true);
    try {
      // orderId是UUID字符串，不能转Number
      const response = await getProductionProcessTracking(orderId);
      // API返回的是 {code: 200, data: [...]} 结构，需要提取data字段
      const data = (response as any)?.data || [];
      const records = Array.isArray(data) ? data : [];
      // 工序跟踪记录加载完成
      setProcessTrackingRecords(records);
    } catch (error) {
      console.error('NodeDetailModal: 加载工序跟踪数据失败:', error);
      setProcessTrackingRecords([]);
    } finally {
      setTrackingLoading(false);
    }
  }, [orderId, orderNo]);

  // 弹窗打开时加载数据
  useEffect(() => {
    if (visible && orderId) {
      loadFactories();
      loadNodeOperations();
      // 样板生产不加载扫码记录和菲号明细（这些是大货生产的数据）
      if (!isPatternProduction) {
        loadScanRecords();
        loadBundles();
        loadProcessTrackingData(); // 加载工序跟踪数据
      } else {
        // 样板生产时清空这些数据
        setScanRecords([]);
        setBundles([]);
      }
    }
    // 重置状态
    if (!visible) {
      setActiveTab('settings');
      setAdminUnlocked(false); // 关闭弹窗时重置解锁状态
    }
  }, [visible, orderId, isPatternProduction, loadFactories, loadNodeOperations, loadScanRecords, loadBundles, loadProcessTrackingData]);

  // 筛选当前节点的扫码记录
  const filteredScanRecords = useMemo(() => {
    return scanRecords.filter((r) =>
      matchRecordToStage(r.progressStage, r.processName, String(nodeTypeKey || '').trim(), normalizeText(nodeName))
    );
  }, [scanRecords, nodeName, nodeTypeKey, normalizeText]);

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

  // 未使用的变量，保留供将来使用
  const _cuttingTotalQty = useMemo(() => {
    return bundles.reduce((sum, b) => sum + (b.quantity || 0), 0);
  }, [bundles]);

  // 裁剪数量按尺码汇总（用于显示）
  const cuttingSizeItems = useMemo(() => {
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    const sizeMap: Record<string, number> = {};
    sizes.forEach(s => { sizeMap[s] = 0; });

    bundles.forEach(b => {
      const size = (b.size || '').toUpperCase().trim();
      if (Object.prototype.hasOwnProperty.call(sizeMap, size)) {
        sizeMap[size] += (b.quantity || 0);
      }
    });

    return sizes
      .map(size => ({ size, quantity: sizeMap[size] }))
      .filter(item => item.quantity > 0); // 只显示有数量的尺码
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

  const formatHistoryTime = useCallback((value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'), []);

  const formatScanDetail = useCallback((record: ScanRecord) => {
    const parts: string[] = [];
    const nodeLabel = normalizeText(record.processName || record.progressStage);
    if (nodeLabel) parts.push(nodeLabel);
    if (typeof record.quantity === 'number') parts.push(`${record.quantity}件`);
    const colorSize = [record.color, record.size].filter(Boolean).join('/');
    if (colorSize) parts.push(colorSize);
    const bundle = record.cuttingBundleNo || record.cuttingBundleQrCode;
    if (bundle) parts.push(`菲号${bundle}`);
    if (record.scanCode) parts.push(`码:${record.scanCode}`);
    return parts.filter(Boolean).join(' · ') || '-';
  }, [normalizeText]);



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
  const _handlePriceChange = (value: number | null) => {
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
        // PC手动操作同步为扫码记录（确保PC/手机数据互通）
        const qty = currentData.assigneeQuantity;
        if (!isPatternProduction && typeof qty === 'number' && qty > 0) {
          const nodeKey = String(nodeTypeKey);
          const scanType = (() => {
            if (nodeKey === 'cutting') return 'cutting';
            if (nodeKey === 'procurement') return 'procurement';
            if (nodeKey === 'warehousing') return 'warehousing';
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

  // 进度百分比颜色
  const _getProgressColor = (percent: number) => {
    if (percent >= 100) return 'var(--color-success)';
    if (percent >= 50) return 'var(--color-info)';
    if (percent > 0) return 'var(--color-warning)';
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
        <span style={{ color: r.completed ? 'var(--color-success)' : 'var(--color-warning)' }}>
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
    const delegateUser = currentNodeData.updatedByName || currentNodeData.updatedBy || currentNodeData.assignee || '-';
    const orderInfoLine = `${orderSummary.orderNo || orderNo || '-'}  款号：${orderSummary.styleNo || '-'}  数量：${orderSummary.orderQuantity || 0} 件`;

    return (
      <div style={{ padding: '4px 0' }}>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
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
          <div>执行工厂</div>
          <div>委派单价</div>
          <div>委派人</div>
          <div>委派时间</div>
          <div>操作</div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
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
            allowClear
            showSearch
            placeholder="选择工厂"
            value={currentNodeData.delegateFactoryId}
            onChange={handleFactoryChange}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={factories?.map(f => ({ value: f.id, label: f.factoryName })) || []}
            disabled={disableEdit}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Input
            prefix="¥"
            value={Number.isFinite(fixedUnitPrice) ? fixedUnitPrice.toFixed(2) : '0.00'}
            disabled
            style={{ width: '100%', minWidth: 0 }}
          />
          <div style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>{delegateUser}</div>
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

  const _renderScanRecordsTab = () => (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">共 {filteredScanRecords.length} 条扫码记录</Text>
        <Text type="secondary">合计: {filteredScanRecords.reduce((s, r) => s + (r.quantity || 0), 0)} 件</Text>
      </div>
      <ResizableTable
        storageKey="node-detail-scan-records"
        size="small"
        rowKey="id"
        dataSource={filteredScanRecords}
        columns={scanColumns}
        pagination={{ pageSize: 10, size: 'small', showTotal: (total) => `共 ${total} 条`, showSizeChanger: false }}
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
            已完成: <span style={{ color: 'var(--color-success)' }}>{completedCount}</span> / {bundlesWithStatus.length}
          </Text>
        </div>
        <ResizableTable
          storageKey="node-detail-bundles"
          size="small"
          rowKey="id"
          dataSource={bundlesWithStatus}
          columns={bundleColumns}
          pagination={{ pageSize: 10, size: 'small', showTotal: (total) => `共 ${total} 条`, showSizeChanger: false }}
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
                okButtonProps={{ danger: true }}
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
              // 样板生产扫码记录Tab已移除（需要时可在工序跟踪查看）
              // 大货生产显示菲号明细、操作员 tab（扫码记录已合并到操作历史）
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
              // 工序跟踪（工资结算）- 所有大货生产都显示（不受 unitPrice 限制）
              !isPatternProduction && {
                key: 'processTracking',
                label: <span><WalletOutlined /> 工序跟踪（工资结算） ({processTrackingRecords.length})</span>,
                children: (
                  <ProcessTrackingTable
                    records={processTrackingRecords}
                    loading={trackingLoading}
                    nodeType={nodeType}
                    nodeName={nodeName}
                  />
                ),
              },

            ].filter(Boolean);
          })()}
        />
      </Spin>
    </ResizableModal>
  );
};

export default NodeDetailModal;
