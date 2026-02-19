import { useState, useMemo } from 'react';
import { ProductionOrder } from '@/types/production';
import api from '@/utils/api';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { mainStages, matchStageKey, stageKeyByType } from '../utils';

interface UseProcessDetailOptions {
  message: any; // antd message instance
  fetchProductionList: () => void;
}

/**
 * 工序详情弹窗 Hook
 * 管理工序详情查看、委派、同步等功能
 */
export function useProcessDetail({ message, fetchProductionList }: UseProcessDetailOptions) {
  // 弹窗状态
  const [processDetailVisible, setProcessDetailVisible] = useState(false);
  const [processDetailRecord, setProcessDetailRecord] = useState<ProductionOrder | null>(null);
  const [processDetailType, setProcessDetailType] = useState<string>('');
  const [procurementStatus, setProcurementStatus] = useState<any>(null);
  const [processStatus, setProcessStatus] = useState<any>(null);
  const [processDetailActiveTab, setProcessDetailActiveTab] = useState<string>('process');
  const [processDetailScanRecords, setProcessDetailScanRecords] = useState<any[]>([]);
  const [processDetailNodeOperations, setProcessDetailNodeOperations] = useState<Record<string, any> | null>(null);

  // 工厂列表（用于工序委派）
  const [factories, setFactories] = useState<any[]>([]);
  const [factoriesLoading, setFactoriesLoading] = useState(false);

  // 工序委派数据
  const [delegationData, setDelegationData] = useState<Record<string, {
    factoryId?: string;
    factoryContactPerson?: string;  // 工厂联系人
    factoryContactPhone?: string;   // 工厂联系电话
    processName?: string;
    quantity?: number;
    unitPrice?: number;
  }>>({});

  // 工序节点解析
  const workflowNodes = useMemo(() => {
    let nodes: any[] = [];
    try {
      if (processDetailRecord?.progressWorkflowJson) {
        const workflow = typeof processDetailRecord.progressWorkflowJson === 'string'
          ? JSON.parse(processDetailRecord.progressWorkflowJson)
          : processDetailRecord.progressWorkflowJson;

        const rawNodes = workflow?.nodes || [];
        if (rawNodes.length > 0 && rawNodes[0]?.name) {
          nodes = rawNodes.map((item: any, idx: number) => ({
            id: item.id || `proc_${idx}`,
            name: item.name || item.processName || '',
            progressStage: item.progressStage || '',
            unitPrice: Number(item.unitPrice) || 0,
            sortOrder: item.sortOrder ?? idx,
          }));
        } else {
          const processesByNode = workflow?.processesByNode || {};
          const allProcesses: any[] = [];
          let sortIdx = 0;
          for (const node of rawNodes) {
            const nodeId = node?.id || '';
            const nodeProcesses = processesByNode[nodeId] || [];
            for (const p of nodeProcesses) {
              allProcesses.push({
                id: p.id || `proc_${sortIdx}`,
                name: p.name || p.processName || '',
                progressStage: p.progressStage || node?.progressStage || node?.name || '',
                unitPrice: Number(p.unitPrice) || 0,
                sortOrder: sortIdx,
              });
              sortIdx++;
            }
          }
          nodes = allProcesses;
        }
      }

      if (nodes.length === 0 && Array.isArray(processDetailRecord?.progressNodeUnitPrices)) {
        nodes = processDetailRecord.progressNodeUnitPrices.map((item: any, idx: number) => ({
          id: item.id || item.processId || `node_${idx}`,
          name: item.name || item.processName || '',
          progressStage: item.progressStage || '',
          unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
          sortOrder: item.sortOrder ?? idx,
        }));
      }
    } catch (e) {
      console.error('解析工序配置失败:', e);
    }
    return nodes;
  }, [processDetailRecord]);

  // 工序按阶段分组
  const childProcessesByStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    mainStages.forEach(s => { map[s.key] = []; });
    workflowNodes.forEach((node) => {
      const stageKey = matchStageKey(String(node?.progressStage || ''), String(node?.name || ''));
      if (!map[stageKey]) {
        map[stageKey] = [];
      }
      map[stageKey].push(node);
    });
    return map;
  }, [workflowNodes]);

  // 当前激活的工序阶段
  const activeStageKeys = useMemo(() => {
    if (!processDetailType || processDetailType === 'all') {
      return mainStages.map(s => s.key);
    }
    const key = stageKeyByType[processDetailType] || processDetailType;
    return [key];
  }, [processDetailType]);

  /** 获取工厂列表 */
  const fetchFactories = async () => {
    setFactoriesLoading(true);
    try {
      const res = await api.get('/system/factory/list', {
        params: { page: 1, pageSize: 999, status: 'active' }
      });
      if (res.code === 200 && res.data?.records) {
        setFactories(res.data.records);
      }
    } catch (error) {
      console.error('[工厂列表] 获取失败:', error);
      setFactories([]);
    } finally {
      setFactoriesLoading(false);
    }
  };

  /** 打开工序详情弹窗 */
  const openProcessDetail = async (record: ProductionOrder, type: string) => {
    setProcessDetailRecord(record);
    setProcessDetailType(type);
    setProcessDetailVisible(true);
    setProcessDetailActiveTab('process');

    // 获取工厂列表
    fetchFactories();

    // 获取所有工序节点状态
    try {
      const res = await api.get(`/production/order/process-status/${record.id}`);
      if (res.code === 200 && res.data) {
        setProcessStatus(res.data);
      }
    } catch (error) {
      console.error('[工序状态] 获取失败:', error);
      setProcessStatus(null);
    }

    // 获取采购完成状态
    if (type === 'procurement' || type === 'all') {
      try {
        const res = await api.get(`/production/order/procurement-status/${record.id}`);
        if (res.code === 200 && res.data) {
          setProcurementStatus(res.data);
        }
      } catch (error) {
        console.error('[采购状态] 获取失败:', error);
        setProcurementStatus(null);
      }
    }

    // 获取扫码记录
    try {
      const res = await productionScanApi.listByOrderId(record.id, { page: 1, pageSize: 1000 });
      if (res.code === 200 && Array.isArray(res.data)) {
        setProcessDetailScanRecords(res.data);
      } else {
        setProcessDetailScanRecords([]);
      }
    } catch (error) {
      console.error('[扫码记录] 获取失败:', error);
      setProcessDetailScanRecords([]);
    }

    // 获取委派记录
    try {
      const res = await productionOrderApi.getNodeOperations(record.id);
      if (res.code === 200 && res.data) {
        const raw = res.data;
        const parsed = typeof raw === 'string' ? (() => {
          try { return JSON.parse(raw); } catch { return {}; }
        })() : raw;
        setProcessDetailNodeOperations(parsed || {});
      } else {
        setProcessDetailNodeOperations(null);
      }
    } catch (error) {
      console.error('[委派记录] 获取失败:', error);
      setProcessDetailNodeOperations(null);
    }
  };

  /** 关闭工序详情弹窗 */
  const closeProcessDetail = () => {
    setProcessDetailVisible(false);
    setProcessDetailRecord(null);
    setProcessDetailType('');
    setProcurementStatus(null);
    setProcessStatus(null);
    setProcessDetailActiveTab('process');
    setProcessDetailScanRecords([]);
    setProcessDetailNodeOperations(null);
  };

  /** 保存工序委派 */
  const saveDelegation = async (nodeKey: string, orderId: string) => {
    const data = delegationData[nodeKey];
    if (!data?.factoryId) {
      message.warning('请选择委派工厂');
      return;
    }

    try {
      await api.post('/production/order/delegate-process', {
        orderId,
        processNode: nodeKey,
        factoryId: data.factoryId,
        unitPrice: data.unitPrice || 0
      });
      message.success('工序委派保存成功');

      // 刷新工序状态
      if (processDetailRecord) {
        openProcessDetail(processDetailRecord, 'all');
      }
    } catch (error: any) {
      console.error('[工序委派] 保存失败:', error);
      message.error(error.message || '保存失败');
    }
  };

  /** 从模板同步工序单价到订单 */
  const syncProcessFromTemplate = async (record: ProductionOrder) => {
    const styleNo = String(record.styleNo || '').trim();
    if (!styleNo) {
      message.error('订单款号为空，无法同步');
      return;
    }

    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
      const result = res as any;
      if (result.code !== 200) {
        message.error('获取工序模板失败');
        return;
      }

      const rows = Array.isArray(result.data) ? result.data : [];
      if (rows.length === 0) {
        message.warning('未找到该款号的工序模板');
        return;
      }

      const allProcesses = rows.map((item: any, idx: number) => ({
        id: String(item.id || item.processCode || item.name || '').trim(),
        name: String(item.name || item.processName || '').trim(),
        unitPrice: Number(item.unitPrice) || 0,
        progressStage: String(item.progressStage || item.name || '').trim(),
        machineType: String(item.machineType || '').trim(),
        standardTime: Number(item.standardTime) || 0,
        sortOrder: idx,
      }));

      const processesByNode: Record<string, typeof allProcesses> = {};
      for (const p of allProcesses) {
        const stage = p.progressStage || p.name;
        if (!processesByNode[stage]) {
          processesByNode[stage] = [];
        }
        processesByNode[stage].push(p);
      }

      const progressWorkflowJson = JSON.stringify({
        nodes: allProcesses,
        processesByNode,
      });

      const updateRes = await productionOrderApi.quickEdit({
        id: record.id,
        progressWorkflowJson,
      });

      if (updateRes.code !== 200) {
        message.error(updateRes.message || '同步失败');
        return;
      }

      message.success(`已同步 ${allProcesses.length} 个工序`);
      fetchProductionList();
    } catch (e) {
      console.error('同步工序失败:', e);
      message.error('同步工序失败');
    }
  };

  return {
    // 弹窗状态
    processDetailVisible,
    processDetailRecord,
    processDetailType,
    procurementStatus,
    processStatus,
    processDetailActiveTab,
    setProcessDetailActiveTab,
    processDetailScanRecords,
    processDetailNodeOperations,
    // 工厂
    factories,
    factoriesLoading,
    // 委派
    delegationData,
    setDelegationData,
    // 工序解析
    workflowNodes,
    childProcessesByStage,
    activeStageKeys,
    // 操作
    openProcessDetail,
    closeProcessDetail,
    saveDelegation,
    syncProcessFromTemplate,
  };
}
