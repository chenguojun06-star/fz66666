import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Modal, Input } from 'antd';
import { useEcStock } from './useEcStock';
import { useStyleCoverImages } from '@/hooks/useStyleCoverImages';
import type { StyleImageMap, SkuBriefMap, OrderBriefMap } from '@/hooks/useStyleCoverImages';
import type { UniversalStock, MergeGroup, GiftRule } from './useEcStock';

export interface UseSmartStockDataReturn {
  st: ReturnType<typeof useEcStock>;
  /** 款号/skuCode → 图片 URL（后端权威解析） */
  imageMap: StyleImageMap;
  /** skuCode → 款号/颜色/尺码摘要 */
  briefBySku: SkuBriefMap;
  /** 订单号 → 图片 URL（物流异常 / 平台账单等订单级列表） */
  orderImageMap: StyleImageMap;
  /** 订单号 → 款号/颜色/尺码摘要（订单级列表） */
  briefByOrderNo: OrderBriefMap;
  // 弹窗状态
  safeStockRecord: UniversalStock | null;
  setSafeStockRecord: React.Dispatch<React.SetStateAction<UniversalStock | null>>;
  splitVisible: boolean;
  setSplitVisible: React.Dispatch<React.SetStateAction<boolean>>;
  mergeGroup: MergeGroup | null;
  setMergeGroup: React.Dispatch<React.SetStateAction<MergeGroup | null>>;
  mergeModalOpen: boolean;
  setMergeModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  giftRuleRecord: GiftRule | null;
  setGiftRuleRecord: React.Dispatch<React.SetStateAction<GiftRule | null>>;
  giftRuleModalOpen: boolean;
  setGiftRuleModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // 扫描/对账进行中标记
  aiScanning: boolean;
  anomalyScanning: boolean;
  billReconciling: boolean;
  stockSyncing: boolean;
  // 事件处理
  handleResolve: (id: number) => Promise<void>;
  handleApprove: (id: number) => Promise<void>;
  handleReject: (id: number) => Promise<void>;
  handleAiScan: () => Promise<void>;
  handleSafeStock: (skuId: number, val: number) => Promise<void>;
  handleSyncStock: () => Promise<void>;
  handleMergeOutbound: (orderIds: number[], trackingNo: string, expressCompany: string) => Promise<void>;
  handleSaveGiftRule: (rule: GiftRule) => Promise<void>;
  handleDeleteGiftRule: (id: number) => Promise<void>;
  handleScanAnomalies: () => Promise<void>;
  handleHandleAnomaly: (id: number) => void;
  handleIgnoreAnomaly: (id: number) => Promise<void>;
  handleReconcileBills: () => Promise<void>;
  handleHandleBill: (id: number, status: number) => Promise<void>;
}

export function useSmartStockData(): UseSmartStockDataReturn {
  const { message } = App.useApp();
  const st = useEcStock();
  const { imageMap, briefBySku, orderImageMap, briefByOrderNo, fetchBySkuCodes, fetchByOrderNos } = useStyleCoverImages();
  const [safeStockRecord, setSafeStockRecord] = useState<UniversalStock | null>(null);
  const [splitVisible, setSplitVisible] = useState(false);
  const [mergeGroup, setMergeGroup] = useState<MergeGroup | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [giftRuleRecord, setGiftRuleRecord] = useState<GiftRule | null>(null);
  const [giftRuleModalOpen, setGiftRuleModalOpen] = useState(false);

  useEffect(() => {
    st.fetchAlerts(); st.fetchSuggestions(); st.fetchStock(); st.fetchAllocations();
    st.fetchMergeCandidates(); st.fetchGiftRules();
    st.fetchAnomalies(); st.fetchBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 款式图 / 款号：把各 tab 的 skuCode 汇总后一次性批量解析。
  // 必须走后端 POST /style/sku/brief —— 真实 SKU 编码没有分隔符，
  // 前端 split('-') 猜款号会恒不命中（这正是以前款式图永远空白的根因）。
  const allSkuCodes = useMemo(() => {
    const codes: Array<string | null | undefined> = [];
    st.alerts.forEach(r => codes.push(r.skuCode));
    st.suggestions.forEach(r => codes.push(r.skuCode));
    st.stockList.forEach(r => codes.push(r.skuCode));
    st.allocations.forEach(r => codes.push(r.skuCode));
    st.mergeGroups.forEach(g => g.orders?.forEach(o => codes.push(o.skuCode)));
    st.giftRules.forEach(r => codes.push(r.giftSkuCode));
    return codes;
  }, [st.alerts, st.suggestions, st.stockList, st.allocations, st.mergeGroups, st.giftRules]);

  useEffect(() => {
    if (allSkuCodes.length > 0) fetchBySkuCodes(allSkuCodes);
  }, [allSkuCodes, fetchBySkuCodes]);

  // 订单级列表（物流异常只有 orderNo、平台账单只有 platformOrderNo）本身不含 skuCode，
  // 由后端 POST /ecommerce/orders/brief 回查订单表解析，这里汇总后一次性拉取。
  const allOrderNos = useMemo(
    () => st.anomalies.map(r => r.orderNo),
    [st.anomalies],
  );
  const allPlatformOrderNos = useMemo(
    () => st.bills.map(r => r.platformOrderNo),
    [st.bills],
  );

  useEffect(() => {
    if (allOrderNos.length > 0 || allPlatformOrderNos.length > 0) {
      fetchByOrderNos(allOrderNos, allPlatformOrderNos);
    }
  }, [allOrderNos, allPlatformOrderNos, fetchByOrderNos]);

  const handleResolve = useCallback(async (id: number) => {
    await st.resolveAlert(id); message.success('已处理');
  }, [st, message]);

  const handleApprove = useCallback(async (id: number) => {
    const res = await st.approveSuggestion(id);
    message.success(res?.message || '已审批');
  }, [st, message]);

  const handleReject = useCallback(async (id: number) => {
    await st.rejectSuggestion(id); message.info('已拒绝');
  }, [st, message]);

  const [aiScanning, setAiScanning] = useState(false);
  const handleAiScan = useCallback(async () => {
    setAiScanning(true);
    try {
      const created = await st.aiScanSuggestions();
      if (created > 0) {
        message.success(`AI 补货顾问已生成 ${created} 条建议`);
      } else {
        message.info('暂无新的缺货预警需要处理');
      }
    } catch {
      message.error('AI 扫描失败，请稍后重试');
    } finally {
      setAiScanning(false);
    }
  }, [st, message]);

  const handleSafeStock = useCallback(async (skuId: number, val: number) => {
    await st.updateSafeStock(skuId, val); message.success('已更新');
  }, [st, message]);

  // 库存全量重算：原来后端接口存在但界面上没有任何入口（孤儿接口），
  // 导致 t_ec_universal_stock 只能靠入库/出库被动刷新，长期为空也无人能手动补齐。
  const [stockSyncing, setStockSyncing] = useState(false);
  const handleSyncStock = useCallback(async () => {
    setStockSyncing(true);
    try {
      const skuCount = await st.syncAll();
      if (skuCount > 0) {
        message.success(`已重算 ${skuCount} 个 SKU 的库存`);
      } else {
        message.info('暂无 SKU 需要重算');
      }
    } catch {
      message.error('库存重算失败，请稍后重试');
    } finally {
      setStockSyncing(false);
    }
  }, [st, message]);

  const handleMergeOutbound = useCallback(async (orderIds: number[], trackingNo: string, expressCompany: string) => {
    try {
      const res = await st.mergeOutbound(orderIds, trackingNo, expressCompany);
      if (res?.failedOrderIds.length) {
        message.warning(`合单完成：成功 ${res.successCount} 笔，失败 ${res.failedOrderIds.length} 笔`);
      } else {
        message.success(`合单发货成功，共 ${res?.successCount} 笔订单`);
      }
    } catch {
      message.error('合单发货失败');
    }
  }, [st, message]);

  const handleSaveGiftRule = useCallback(async (rule: GiftRule) => {
    await st.saveGiftRule(rule);
    message.success(rule.id ? '规则已更新' : '规则已新增');
  }, [st, message]);

  const handleDeleteGiftRule = useCallback(async (id: number) => {
    await st.deleteGiftRule(id); message.success('已删除');
  }, [st, message]);

  // ==================== Phase 3: 物流异常 + 账单对账 ====================

  const [anomalyScanning, setAnomalyScanning] = useState(false);
  const handleScanAnomalies = useCallback(async () => {
    setAnomalyScanning(true);
    try {
      const created = await st.scanAnomalies();
      if (created > 0) message.success(`扫描完成，新增 ${created} 条异常预警`);
      else message.info('扫描完成，暂无新异常');
    } catch {
      message.error('扫描失败，请稍后重试');
    } finally { setAnomalyScanning(false); }
  }, [st, message]);

  const handleHandleAnomaly = useCallback((id: number) => {
    let remark = '';
    Modal.confirm({
      title: '处理物流异常',
      content: (
        <Input.TextArea
          placeholder="请输入处理备注（可选）"
          rows={3}
          onChange={(e) => { remark = e.target.value; }}
        />
      ),
      onOk: async () => {
        try {
          await st.handleAnomaly(id, remark);
          message.success('已标记处理');
        } catch {
          message.error('处理失败，请稍后重试');
          throw new Error('handle failed');
        }
      },
    });
  }, [st, message]);

  const handleIgnoreAnomaly = useCallback(async (id: number) => {
    await st.ignoreAnomaly(id);
    message.info('已忽略');
  }, [st, message]);

  const [billReconciling, setBillReconciling] = useState(false);
  const handleReconcileBills = useCallback(async () => {
    setBillReconciling(true);
    try {
      const res = await st.reconcileBills();
      if (res) {
        message.success(`对账完成：共 ${res.totalBills} 条，匹配 ${res.matched}，差异 ${res.mismatched + res.missingLocal}，新增 ${res.newBills}`);
      } else {
        message.info('对账完成，无账单数据');
      }
    } catch {
      message.error('对账失败，请稍后重试');
    } finally { setBillReconciling(false); }
  }, [st, message]);

  const handleHandleBill = useCallback(async (id: number, status: number) => {
    const label = status === 1 ? '确认' : status === 2 ? '申诉' : '忽略';
    await st.handleBill(id, status);
    message.success(`已${label}`);
  }, [st, message]);

  return {
    st,
    imageMap,
    briefBySku,
    orderImageMap,
    briefByOrderNo,
    safeStockRecord, setSafeStockRecord,
    splitVisible, setSplitVisible,
    mergeGroup, setMergeGroup,
    mergeModalOpen, setMergeModalOpen,
    giftRuleRecord, setGiftRuleRecord,
    giftRuleModalOpen, setGiftRuleModalOpen,
    aiScanning,
    anomalyScanning,
    billReconciling,
    stockSyncing,
    handleResolve,
    handleApprove,
    handleReject,
    handleAiScan,
    handleSafeStock,
    handleSyncStock,
    handleMergeOutbound,
    handleSaveGiftRule,
    handleDeleteGiftRule,
    handleScanAnomalies,
    handleHandleAnomaly,
    handleIgnoreAnomaly,
    handleReconcileBills,
    handleHandleBill,
  };
}
