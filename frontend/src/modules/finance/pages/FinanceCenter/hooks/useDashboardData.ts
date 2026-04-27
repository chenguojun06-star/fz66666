import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import type { StatCardData, RankData, Factory, TimeRangeType, EChartData, SettlementRow } from '../dashboardTypes';
import { DEFAULT_STAT_DATA, DEFAULT_CHART_DATA } from '../dashboardTypes';
import { getDateRanges, calcChange, generateTrendData } from '../dashboardUtils';
import { Dayjs } from 'dayjs';

export const useDashboardData = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangeType>('month');
  const [customRange, setCustomRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedFactory, setSelectedFactory] = useState<string>('');
  const [factories, setFactories] = useState<Factory[]>([]);
  const [statData, setStatData] = useState<StatCardData>(DEFAULT_STAT_DATA);
  const [chartData, setChartData] = useState<EChartData>(DEFAULT_CHART_DATA);
  const [rankData, setRankData] = useState<RankData[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [healthCollapsed, setHealthCollapsed] = useState(false);
  const healthFetchedRef = useRef(false);
  const showSmartErrorNotice = isSmartFeatureEnabled('smart.production.precheck.enabled');

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  }, [showSmartErrorNotice]);

  useEffect(() => {
    if (healthFetchedRef.current) return;
    healthFetchedRef.current = true;
    intelligenceApi.getHealthIndex().then((res: any) => { if (res?.code === 200 && res.data) setHealthData(res.data); }).catch(() => {});
  }, []);

  const loadFactories = useCallback(async () => {
    try {
      const res = await api.get('/system/organization/tree');
      if (res.code === 200 && res.data) {
        const flattenTree = (nodes: any[]): Factory[] => {
          const result: Factory[] = [];
          for (const node of nodes) {
            if (node.factoryName) result.push({ id: String(node.id), factoryName: node.factoryName });
            if (node.children?.length) result.push(...flattenTree(node.children));
          }
          return result;
        };
        const allFactories = flattenTree(Array.isArray(res.data) ? res.data : [res.data]);
        const productionFactories = allFactories.filter(f => f.factoryName && !f.factoryName.includes('行政') && !f.factoryName.includes('办公'));
        const uniqueFactories = Array.from(new Map(productionFactories.map(f => [f.factoryName, f])).values());
        setFactories(uniqueFactories);
      }
    } catch {}
  }, []);

  useEffect(() => { loadFactories(); }, [loadFactories]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const ranges = getDateRanges(timeRange, customRange);
      const [currentRes, prevRes] = await Promise.all([
        api.get('/finance/finished-settlement/list', { params: { page: 1, pageSize: 5000, startDate: ranges.currentStart, endDate: ranges.currentEnd, factoryId: selectedFactory || undefined } }),
        api.get('/finance/finished-settlement/list', { params: { page: 1, pageSize: 5000, startDate: ranges.prevStart, endDate: ranges.prevEnd, factoryId: selectedFactory || undefined } }),
      ]);
      const currentRows: SettlementRow[] = (currentRes?.data?.records || []) as SettlementRow[];
      const prevRows: SettlementRow[] = (prevRes?.data?.records || []) as SettlementRow[];
      const curTotalAmount = currentRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
      const curInboundQty = currentRows.reduce((s, r) => s + (Number(r.inboundQuantity) || 0), 0);
      const curOrderCount = currentRows.length;
      const curDefectQty = currentRows.reduce((s, r) => s + (Number(r.defectQuantity) || 0), 0);
      const curMaterialCost = currentRows.reduce((s, r) => s + (Number(r.materialCost) || 0), 0);
      const curProductionCost = currentRows.reduce((s, r) => s + (Number(r.productionCost) || 0), 0);
      const curProfit = curTotalAmount - curMaterialCost - curProductionCost;
      const curProfitRate = curTotalAmount > 0 ? Math.round((curProfit / curTotalAmount) * 10000) / 100 : 0;
      const curDefectRate = curInboundQty > 0 ? Math.round((curDefectQty / curInboundQty) * 10000) / 100 : 0;
      const prevTotalAmount = prevRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
      const prevInboundQty = prevRows.reduce((s, r) => s + (Number(r.inboundQuantity) || 0), 0);
      const prevOrderCount = prevRows.length;
      const prevDefectQty = prevRows.reduce((s, r) => s + (Number(r.defectQuantity) || 0), 0);
      const prevProfitRate = prevTotalAmount > 0 ? Math.round(((prevTotalAmount - prevRows.reduce((s, r) => s + (Number(r.materialCost) || 0), 0) - prevRows.reduce((s, r) => s + (Number(r.productionCost) || 0), 0)) / prevTotalAmount) * 10000) / 100 : 0;
      setStatData({
        totalAmount: curTotalAmount, totalAmountChange: calcChange(curTotalAmount, prevTotalAmount),
        inboundQuantity: curInboundQty, inboundQuantityChange: calcChange(curInboundQty, prevInboundQty),
        orderCount: curOrderCount, orderCountChange: calcChange(curOrderCount, prevOrderCount),
        defectQuantity: curDefectQty, defectQuantityChange: calcChange(curDefectQty, prevDefectQty),
        profitRate: curProfitRate, profitRateChange: calcChange(curProfitRate, prevProfitRate),
        materialCost: curMaterialCost, productionCost: curProductionCost, profit: curProfit, defectRate: curDefectRate,
      });
      const trend = generateTrendData(currentRows, timeRange, ranges.currentStart, ranges.currentEnd);
      setChartData(trend);
      const factoryMap = new Map<string, number>();
      currentRows.forEach(r => { const name = r.factoryName || '未知'; factoryMap.set(name, (factoryMap.get(name) || 0) + (Number(r.totalAmount) || 0)); });
      const ranks = Array.from(factoryMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value], i) => ({ rank: i + 1, name, value }));
      setRankData(ranks);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error) {
      setStatData(DEFAULT_STAT_DATA);
      setChartData(DEFAULT_CHART_DATA);
      setRankData([]);
      reportSmartError('财务数据加载失败', '网络异常或服务不可用，请稍后重试', 'FINANCE_DASHBOARD_LOAD_FAILED');
    } finally { setLoading(false); }
  }, [timeRange, customRange, selectedFactory, showSmartErrorNotice, reportSmartError]);

  useEffect(() => { loadData(); }, [loadData]);

  return { loading, timeRange, setTimeRange, customRange, setCustomRange, selectedFactory, setSelectedFactory, factories, statData, chartData, rankData, smartError, healthData, healthCollapsed, setHealthCollapsed, loadData };
};
