/**
 * SmartStyleInsightCard — 下单智能分析卡 v2
 *
 * 展示在「下单管理」弹窗中，基于历史数据 + 工厂实时产能数据给出：
 *  - 本款下单频率、平均周期、确认准时率
 *  - 工厂日均产量、当前排期占用、风险单数
 *  - 第一屏 限制/紧张 风险 Banner
 *  - AI 文字建议
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Button, Spin, Tag, Tooltip } from 'antd';
import { RobotOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { productionOrderApi, intelligenceApi } from '@/services/production/productionApi';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import dayjs from 'dayjs';

interface Props {
  styleNo: string;
  factoryName?: string;
  /** 工厂实时产能数据（来自父组件 selectedFactoryStat）*/
  capacityData?: FactoryCapacityItem | null;
}

interface StyleInsight {
  orderCount: number;
  avgCycleDays: number;
  recommendLeadDays: number;
  activeOrderCount: number;
  factoryBusy: boolean;
  factoryActiveCount: number;
  freqPerYear: number;
  lastOrderDate: string;
  onTimeRate: number;
}

const SmartStyleInsightCard: React.FC<Props> = ({ styleNo, factoryName, capacityData }) => {
  const [insight, setInsight] = useState<StyleInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const calcInsight = useCallback(async () => {
    if (!styleNo) return;
    setLoading(true);
    setAiAdvice('');
    try {
      // 拉取该款历史订单（最近100条）
      const res = await productionOrderApi.list({ styleNo, pageSize: 100, page: 1 } as any) as any;
      const records: any[] = res?.data?.records ?? res?.records ?? [];

      if (records.length === 0) {
        setInsight(null);
        return;
      }

      // 平均生产周期（用 plannedEndDate - createTime）
      let totalDays = 0;
      let cycleCount = 0;
      let lateCount = 0;
      let onTimeCount = 0;
      for (const r of records) {
        if (r.createTime && r.plannedEndDate) {
          const days = dayjs(r.plannedEndDate).diff(dayjs(r.createTime), 'day');
          if (days > 0 && days < 180) { totalDays += days; cycleCount++; }
        }
        if (r.actualEndDate && r.plannedEndDate) {
          if (dayjs(r.actualEndDate).isAfter(dayjs(r.plannedEndDate))) lateCount++;
          else onTimeCount++;
        }
      }
      const avgCycleDays = cycleCount > 0 ? Math.round(totalDays / cycleCount) : 0;
      const onTimeTotal = lateCount + onTimeCount;
      // 只有实际有完工记录时才算准时率，避免"0完工→100%"的误导
      const onTimeRate = onTimeTotal > 0 ? Math.round((onTimeCount / onTimeTotal) * 100) : -1;

      // 下单频率（每年）
      const dates = records.map(r => r.createTime).filter(Boolean).sort();
      const firstDate = dates[0] as string | undefined;
      const monthsSpan = firstDate
        ? Math.max(1, dayjs().diff(dayjs(firstDate), 'month'))
        : 12;
      const freqPerYear = Math.round((records.length / monthsSpan) * 12 * 10) / 10;

      // 当前进行中订单（该款）
      const activeOrders = records.filter(r => r.status === 'production');
      const factoryActiveCount = factoryName
        ? activeOrders.filter(r => r.factoryName === factoryName).length
        : 0;
      const factoryBusy = factoryActiveCount >= 3;

      // 建议提前下单天数 = 平均周期 + 7 天缓冲
      const recommendLeadDays = avgCycleDays > 0 ? avgCycleDays + 7 : 0;

      // 最近一次下单时间
      const lastOrderDate = dates[dates.length - 1]
        ? dayjs(dates[dates.length - 1] as string).format('YYYY-MM-DD')
        : '';

      setInsight({
        orderCount: records.length,
        avgCycleDays,
        recommendLeadDays,
        activeOrderCount: activeOrders.length,
        factoryBusy,
        factoryActiveCount,
        freqPerYear,
        lastOrderDate,
        onTimeRate,
      });
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }, [styleNo, factoryName]);

  useEffect(() => {
    void calcInsight();
  }, [calcInsight]);

  const handleAiAdvice = async () => {
    if (!insight) return;
    setAiLoading(true);
    setAiAdvice('');
    try {
      const context = [
        `款号 ${styleNo} 历史下单 ${insight.orderCount} 次，`,
        insight.avgCycleDays > 0
          ? `平均生产周期 ${insight.avgCycleDays} 天，建议提前 ${insight.recommendLeadDays} 天下单；`
          : '暂无完整周期数据；',
        factoryName && insight.factoryBusy
          ? `当前 ${factoryName} 工厂同时在产 ${insight.factoryActiveCount} 个订单，存在爆单风险；`
          : '',
        `历史准时率 ${insight.onTimeRate}%，`,
        `年均翻单 ${insight.freqPerYear} 次。`,
        '请给出 2-3 条下单决策建议，包括：是否需要提前下单、是否需要换工厂、如何规避延期风险。',
      ].join('');
      const res = await intelligenceApi.aiAdvisorChat(context) as any;
      const answer = res?.data?.answer || res?.answer || '';
      setAiAdvice(answer || '暂未获得 AI 建议，请稍后重试');
    } catch {
      setAiAdvice('AI 请求失败，请检查网络后重试');
    } finally {
      setAiLoading(false);
    }
  };

  if (!styleNo) return null;

  if (loading) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <Spin size="small" />
        <span style={{ marginLeft: 8, fontSize: 12, color: '#8c8c8c' }}>
          正在分析历史数据…
        </span>
      </div>
    );
  }

  if (!insight) {
    return (
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '10px 14px',
        fontSize: 12, color: '#bbb', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>📊</span>
        <span>该款暂无历史订单数据</span>
        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={calcInsight}>
          重新加载
        </Button>
      </div>
    );
  }

  const { orderCount, avgCycleDays, recommendLeadDays, activeOrderCount,
    factoryBusy, factoryActiveCount, freqPerYear, lastOrderDate, onTimeRate } = insight;

  // 工厂产能信息（优先使用真实产能数据）
  const factoryOnTimeRate = capacityData?.deliveryOnTimeRate ?? -1;
  const displayOnTimeRate = factoryOnTimeRate >= 0 ? factoryOnTimeRate : onTimeRate;
  const avgDailyOutput = capacityData?.avgDailyOutput ?? 0;
  const estimatedDays = capacityData?.estimatedCompletionDays ?? -1;
  const atRiskCount = capacityData?.atRiskCount ?? 0;
  const overdueCount = capacityData?.overdueCount ?? 0;
  const factoryTotalOrders = capacityData?.totalOrders ?? 0;

  // 工厂风险等级
  const isFactoryHighRisk = overdueCount > 0 || (atRiskCount >= 2) || factoryBusy;
  const isFactoryMedRisk = !isFactoryHighRisk && (atRiskCount >= 1 || factoryActiveCount >= 2 || estimatedDays > 30);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f7ff 0%, #fafbff 100%)',
      border: '1px solid #d6e8ff',
      borderRadius: 10,
      padding: '12px 16px',
      fontSize: 12,
      marginTop: 8,
    }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1677ff' }}>
          📊 {styleNo} — 下单智能分析
        </span>
        <Button
          type="link" size="small"
          icon={<ReloadOutlined style={{ fontSize: 11 }} />}
          onClick={calcInsight}
          style={{ padding: 0, height: 'auto', color: '#8c8c8c', fontSize: 11 }}
        >
          刷新
        </Button>
      </div>

      {/* 工厂风险 Banner（选了工厂才显示）*/}
      {factoryName && capacityData && (isFactoryHighRisk || isFactoryMedRisk) && (
        <div style={{
          background: isFactoryHighRisk ? '#fff2f0' : '#fffbe6',
          border: `1px solid ${isFactoryHighRisk ? '#ffccc7' : '#ffe58f'}`,
          borderRadius: 6, padding: '6px 10px',
          marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <WarningOutlined style={{ color: isFactoryHighRisk ? '#ff4d4f' : '#faad14' }} />
          <span style={{ color: isFactoryHighRisk ? '#cf1322' : '#874d00', fontSize: 12, flex: 1 }}>
            {isFactoryHighRisk
              ? `${factoryName} 当前接单紧张：${overdueCount > 0 ? `${overdueCount} 单逾期` : ''}${atRiskCount > 0 ? `、${atRiskCount} 单高风险` : ''}，建议提前沟通排期`
              : `${factoryName} 在产 ${factoryTotalOrders} 单${atRiskCount > 0 ? `，其中 ${atRiskCount} 单偏慢` : ''}，排产较满`}
          </span>
        </div>
      )}

      {/* 2×2 核心指标格 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        {/* 左上：历史下单 + 翻单频率 */}
        <div style={{ background: '#fff', borderRadius: 7, padding: '7px 10px', border: '1px solid #e8f0fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#1677ff' }}>{orderCount}</span>
            <span style={{ fontSize: 11, color: freqPerYear >= 6 ? '#52c41a' : freqPerYear >= 2 ? '#1677ff' : '#8c8c8c' }}>
              {freqPerYear > 0 ? `${freqPerYear.toFixed(1)}次/年` : ''}
            </span>
          </div>
          <div style={{ color: '#8c8c8c', fontSize: 11 }}>历史下单</div>
        </div>

        {/* 右上：平均周期 + 建议提前天数 */}
        <div style={{ background: '#fff', borderRadius: 7, padding: '7px 10px', border: '1px solid #e8f0fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: avgCycleDays > 45 ? '#ff4d4f' : avgCycleDays > 30 ? '#faad14' : '#52c41a' }}>
              {avgCycleDays > 0 ? avgCycleDays : '-'}
            </span>
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
              {recommendLeadDays > 0 ? `提前${recommendLeadDays}天` : ''}
            </span>
          </div>
          <div style={{ color: '#8c8c8c', fontSize: 11 }}>平均周期(天)</div>
        </div>

        {/* 左下：准时率 / 工厂货期达成率 */}
        <div style={{ background: '#fff', borderRadius: 7, padding: '7px 10px', border: '1px solid #e8f0fe' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: displayOnTimeRate >= 80 ? '#52c41a' : displayOnTimeRate >= 60 ? '#faad14' : displayOnTimeRate >= 0 ? '#ff4d4f' : '#d9d9d9' }}>
            {displayOnTimeRate >= 0 ? `${displayOnTimeRate}%` : '-'}
          </div>
          <div style={{ color: '#8c8c8c', fontSize: 11 }}>
            {capacityData ? '工厂达成率' : '本款准时率'}
          </div>
        </div>

        {/* 右下：日均产量 or 在产单数 */}
        <div style={{ background: '#fff', borderRadius: 7, padding: '7px 10px', border: '1px solid #e8f0fe' }}>
          {avgDailyOutput > 0 ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#722ed1' }}>
                {Math.round(avgDailyOutput)}
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 11 }}>
                件/天{estimatedDays > 0 ? `·排期${estimatedDays}天` : ''}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: activeOrderCount >= 3 ? '#ff4d4f' : activeOrderCount >= 1 ? '#faad14' : '#52c41a' }}>
                {activeOrderCount}
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 11 }}>本款在产单</div>
            </>
          )}
        </div>
      </div>

      {/* 关键提示标签行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {recommendLeadDays > 0 && (
          <Tooltip title={`该款平均生产周期 ${avgCycleDays} 天，额外预留 7 天缓冲`}>
            <Tag color="blue" style={{ cursor: 'pointer', fontSize: 11 }}>
              📅 提前 {recommendLeadDays} 天下单
            </Tag>
          </Tooltip>
        )}
        {estimatedDays > 0 && (
          <Tooltip title={`${factoryName ?? '该工厂'} 按当前日均产量，现有订单还需约 ${estimatedDays} 天消化`}>
            <Tag color={estimatedDays > 30 ? 'orange' : 'default'} style={{ fontSize: 11 }}>
              ⏳ 工厂排期 {estimatedDays} 天
            </Tag>
          </Tooltip>
        )}
        {factoryName && factoryActiveCount > 0 && !capacityData && (
          <Tooltip title={`${factoryName} 正在生产 ${factoryActiveCount} 个该账期订单`}>
            <Tag color={factoryBusy ? 'red' : 'orange'} style={{ fontSize: 11 }}>
              {factoryBusy ? '🔴' : '🟡'} {factoryName} {factoryActiveCount} 单在产
            </Tag>
          </Tooltip>
        )}
        {lastOrderDate && (
          <Tag style={{ fontSize: 11, color: '#8c8c8c', background: '#f5f5f5', border: 'none' }}>
            最近下单 {lastOrderDate}
          </Tag>
        )}
      </div>

      {/* AI 建议区 */}
      {!aiAdvice && (
        <Button
          size="small"
          icon={<RobotOutlined />}
          loading={aiLoading}
          onClick={handleAiAdvice}
          type="primary"
          ghost
          style={{ fontSize: 12 }}
        >
          AI 给出下单建议
        </Button>
      )}
      {aiAdvice && (
        <div style={{
          background: '#fff', border: '1px solid #d6e8ff', borderRadius: 8,
          padding: '10px 12px', marginTop: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#1677ff' }}>
              <RobotOutlined style={{ marginRight: 6 }} />AI 下单建议
            </span>
            <Button
              type="link" size="small" loading={aiLoading}
              onClick={handleAiAdvice}
              style={{ padding: 0, height: 'auto', fontSize: 11 }}
            >
              重新生成
            </Button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#333', lineHeight: 1.7, fontFamily: 'inherit' }}>
            {aiAdvice}
          </pre>
        </div>
      )}
    </div>
  );
};

export default SmartStyleInsightCard;
