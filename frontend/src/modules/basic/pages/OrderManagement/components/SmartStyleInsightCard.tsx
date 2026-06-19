/**
 * SmartStyleInsightCard — 下单智能分析卡 v2
 *
 * 展示在「下单管理」弹窗中，基于历史数据 + 工厂实时产能数据给出：
 *  - 本款下单频率、平均周期、确认准时率
 *  - 工厂日均产量、当前排期占用、风险单数
 *  - 第一屏 限制/紧张 风险 Banner
 *  - AI 文字建议
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Space, Spin, Tag } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { DownOutlined, ReloadOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons';
import { productionOrderApi } from '@/services/production/productionApi';
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
  const [aiAdviceVisible, setAiAdviceVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const calcInsight = useCallback(async () => {
    if (!styleNo) return;
    setLoading(true);
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

  const orderCount = insight?.orderCount ?? 0;
  const avgCycleDays = insight?.avgCycleDays ?? 0;
  const recommendLeadDays = insight?.recommendLeadDays ?? 0;
  const activeOrderCount = insight?.activeOrderCount ?? 0;
  const factoryBusy = insight?.factoryBusy ?? false;
  const factoryActiveCount = insight?.factoryActiveCount ?? 0;
  const freqPerYear = insight?.freqPerYear ?? 0;
  const lastOrderDate = insight?.lastOrderDate ?? '';
  const onTimeRate = insight?.onTimeRate ?? -1;

  const factoryOnTimeRate = capacityData?.deliveryOnTimeRate ?? -1;
  const displayOnTimeRate = factoryOnTimeRate >= 0 ? factoryOnTimeRate : onTimeRate;
  const avgDailyOutput = capacityData?.avgDailyOutput ?? 0;
  const estimatedDays = capacityData?.estimatedCompletionDays ?? -1;
  const atRiskCount = capacityData?.atRiskCount ?? 0;
  const overdueCount = capacityData?.overdueCount ?? 0;
  const factoryTotalOrders = capacityData?.totalOrders ?? 0;

  const isFactoryHighRisk = overdueCount > 0 || (atRiskCount >= 2) || factoryBusy;
  const isFactoryMedRisk = !isFactoryHighRisk && (atRiskCount >= 1 || factoryActiveCount >= 2 || estimatedDays > 30);
  const aiAdviceItems = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    items.push({
      label: '建议动作',
      value: isFactoryHighRisk
        ? '优先换厂或锁排期'
        : isFactoryMedRisk
          ? '先锁档期再下单'
          : '可按当前工厂推进',
    });
    items.push({
      label: '关键数据',
      value: avgCycleDays > 0
        ? `周期 ${avgCycleDays} 天 / 建议提前 ${recommendLeadDays} 天`
        : `本款在产 ${activeOrderCount} 单 / 年翻单 ${freqPerYear.toFixed(1)} 次`,
    });
    items.push({
      label: '风险判断',
      value: displayOnTimeRate >= 0
        ? `达成率 ${displayOnTimeRate}%${overdueCount > 0 ? ` / 逾期 ${overdueCount} 单` : ''}${atRiskCount > 0 ? ` / 高风险 ${atRiskCount} 单` : ''}`
        : `当前工厂在产 ${factoryTotalOrders} 单 / 日均 ${Math.round(avgDailyOutput || 0)} 件`,
    });
    return items;
  }, [activeOrderCount, atRiskCount, avgCycleDays, avgDailyOutput, displayOnTimeRate, factoryTotalOrders, freqPerYear, isFactoryHighRisk, isFactoryMedRisk, overdueCount, recommendLeadDays]);
  const metricItems = [
    { value: orderCount, suffix: freqPerYear > 0 ? `${freqPerYear.toFixed(1)}次/年` : '', label: '历史下单', color: 'var(--color-primary)' },
    { value: avgCycleDays > 0 ? avgCycleDays : '-', suffix: recommendLeadDays > 0 ? `提前${recommendLeadDays}天` : '', label: '平均周期', color: avgCycleDays > 45 ? 'var(--color-danger)' : avgCycleDays > 30 ? 'var(--color-warning)' : 'var(--color-success)' },
    { value: displayOnTimeRate >= 0 ? `${displayOnTimeRate}%` : '-', suffix: capacityData ? '工厂达成' : '本款达成', label: '交期达成', color: displayOnTimeRate >= 80 ? 'var(--color-success)' : displayOnTimeRate >= 60 ? 'var(--color-warning)' : displayOnTimeRate >= 0 ? 'var(--color-danger)' : 'var(--color-border-antd)' },
    avgDailyOutput > 0
      ? { value: Math.round(avgDailyOutput), suffix: estimatedDays > 0 ? `${estimatedDays}天` : '', label: '日产/排期', color: 'var(--color-accent-purple)' }
      : { value: activeOrderCount, suffix: '在产', label: '本款在产', color: activeOrderCount >= 3 ? 'var(--color-danger)' : activeOrderCount >= 1 ? 'var(--color-warning)' : 'var(--color-success)' },
  ];
  const quickTags = [
    recommendLeadDays > 0 ? `提前${recommendLeadDays}天` : '',
    estimatedDays > 0 ? `排期${estimatedDays}天` : '',
    overdueCount > 0 ? `逾期${overdueCount}` : '',
    atRiskCount > 0 ? `风险${atRiskCount}` : '',
    lastOrderDate ? `最近 ${lastOrderDate}` : '',
  ].filter(Boolean);

  if (!styleNo) return null;

  if (loading) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <Spin />
        <span style={{ marginLeft: 8, fontSize: 14, color: 'var(--color-text-tertiary)' }}>
          正在分析历史数据…
        </span>
      </div>
    );
  }

  if (!insight) {
    return (
      <div style={{
        background: 'var(--color-bg-container)', borderRadius: 8, padding: '10px 14px',
        fontSize: 14, color: 'var(--color-text-quaternary)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span></span>
        <span>该款暂无历史订单数据</span>
        <Button type="link" icon={<ReloadOutlined />} onClick={calcInsight}>
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <div style={{
      background: '#f0f5ff',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      padding: '12px 14px',
      fontSize: 14,
      marginTop: 8,
    }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 8, cursor: 'pointer' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-primary)' }}>
          {styleNo} 下单分析
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button
            type="link"
            icon={<ReloadOutlined style={{ fontSize: 13 }} />}
            onClick={(e) => { e.stopPropagation(); void calcInsight(); }}
            style={{ padding: 0, height: 'auto', color: 'var(--color-text-tertiary)', fontSize: 14 }}
          >
            刷新
          </Button>
          {collapsed ? <RightOutlined style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }} /> : <DownOutlined style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }} />}
        </div>
      </div>

      {!collapsed && <>
      {factoryName && capacityData && (isFactoryHighRisk || isFactoryMedRisk) && (
        <div style={{
          background: isFactoryHighRisk ? '#F6FFED' : '#FFFBE6',
          border: `1px solid ${isFactoryHighRisk ? '#ffccc7' : '#ffe58f'}`,
          borderRadius: 6, padding: '6px 10px',
          marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <WarningOutlined style={{ color: isFactoryHighRisk ? 'var(--color-danger)' : 'var(--color-warning)' }} />
          <span style={{ color: isFactoryHighRisk ? 'var(--color-error)' : '#874d00', fontSize: 14, flex: 1 }}>
            {isFactoryHighRisk
              ? `${factoryName} 当前接单紧张：${overdueCount > 0 ? `${overdueCount} 单逾期` : ''}${atRiskCount > 0 ? `、${atRiskCount} 单高风险` : ''}，建议提前沟通排期`
              : `${factoryName} 在产 ${factoryTotalOrders} 单${atRiskCount > 0 ? `，其中 ${atRiskCount} 单偏慢` : ''}，排产较满`}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        {metricItems.map((item) => (
          <div key={item.label} style={{ background: 'var(--color-bg-base)', borderRadius: 7, padding: '7px 10px', border: '1px solid #e8f0fe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</span>
              <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{item.suffix}</span>
            </div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {quickTags.map((text) => (
          <Tag key={text} style={{ fontSize: 14, color: '#667085', background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', marginInlineEnd: 0 }}>
            {text}
          </Tag>
        ))}
      </div>

      {!aiAdviceVisible && (
        <Button
         
          icon={<XiaoyunCloudAvatar size={18} active />}
          onClick={() => setAiAdviceVisible(true)}
          type="primary"
          ghost
          style={{ fontSize: 14 }}
        >
          AI 下单建议
        </Button>
      )}
      {aiAdviceVisible && (
        <div style={{
          background: 'var(--color-bg-base)', border: '1px solid #d6e8ff', borderRadius: 8,
          padding: '10px 12px', marginTop: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-primary)' }}>
              <XiaoyunCloudAvatar size={16} active /> AI 下单建议
            </span>
            <Space size={8}>
              <Button
                type="link"
                onClick={() => setAiAdviceVisible(false)}
                style={{ padding: 0, height: 'auto', fontSize: 14 }}
              >
                关闭
              </Button>
            </Space>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {aiAdviceItems.map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: '18px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}</span>
                <span style={{ fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>}
    </div>
  );
};

export default SmartStyleInsightCard;
