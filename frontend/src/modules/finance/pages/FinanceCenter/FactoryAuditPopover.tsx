import React, { useMemo } from 'react';
import { Popover, Progress, Tag, Divider } from 'antd';
import { RobotOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';

const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

interface FactorySummaryRow {
  factoryId: string;
  factoryName: string;
  factoryType?: string;
  orderCount: number;
  totalOrderQuantity: number;
  totalWarehousedQuantity: number;
  totalDefectQuantity: number;
  totalMaterialCost: number;
  totalProductionCost: number;
  totalAmount: number;
  totalProfit: number;
  orderNos: string[];
  [key: string]: unknown;
}

interface Props {
  record: FactorySummaryRow;
  auditedOrderNos: Set<string>;
  children: React.ReactNode;
}

const FactoryAuditPopover: React.FC<Props> = ({ record, auditedOrderNos, children }) => {
  const analysis = useMemo(() => {
    const auditedCount = (record.orderNos || []).filter(no => auditedOrderNos.has(no)).length;
    const totalCount = record.orderCount || 0;
    const auditRate = totalCount > 0 ? Math.round((auditedCount / totalCount) * 100) : 0;

    const profitRate = record.totalAmount > 0
      ? ((record.totalProfit / record.totalAmount) * 100)
      : 0;

    const defectRate = record.totalWarehousedQuantity > 0
      ? ((record.totalDefectQuantity / record.totalWarehousedQuantity) * 100)
      : 0;

    const costRatio = record.totalAmount > 0
      ? (((record.totalMaterialCost + record.totalProductionCost) / record.totalAmount) * 100)
      : 0;

    // AI 智能建议
    const suggestions: string[] = [];
    if (auditedCount < totalCount) {
      suggestions.push(`尚有 ${totalCount - auditedCount} 个订单未审核，终审前请确认已关单`);
    }
    if (profitRate < 0) {
      suggestions.push('⚠️ 整体利润为负，建议核查成本结构');
    } else if (profitRate < 5) {
      suggestions.push('利润率偏低（<5%），关注成本控制');
    }
    if (defectRate > 3) {
      suggestions.push(`次品率 ${defectRate.toFixed(1)}% 超3%，建议沟通工厂质量改进`);
    }
    if (costRatio > 90) {
      suggestions.push('成本占营收比 >90%，盈利空间压缩');
    }
    if (suggestions.length === 0) {
      suggestions.push('数据健康，可放心终审推送');
    }

    const topSuggestion = suggestions[0] ?? '数据健康，可放心终审推送';
    return { auditedCount, totalCount, auditRate, profitRate, defectRate, suggestions, topSuggestion };
  }, [record, auditedOrderNos]);

  const narrative = useMemo(() => {
    const seed = Math.round(analysis.profitRate * 10)
      + Math.round(analysis.defectRate * 10)
      + analysis.auditRate
      + analysis.totalCount;
    const summary = analysis.auditRate === 100
      ? choose(seed, [
        '审核覆盖已闭环，当前重点是确认利润与质量波动是否可接受。',
        '订单审核已经收口，接下来主要看利润和次品风险有没有隐藏波动。',
        '这家工厂审核进度已到位，可以把精力放在利润质量的最终确认上。',
      ])
      : choose(seed, [
        '还有订单没审核完，建议先补齐再做终审放行。',
        '审核链还没闭合，现在推进终审风险会偏高。',
        '当前不建议直接终审，先把未审核订单处理完更稳。',
      ]);

    const painPoint = analysis.profitRate < 0
      ? choose(seed + 3, [
        '利润已经转负，说明成本结构或损耗环节需要立即复盘。',
        '当前最需要警惕的是负利润继续扩大。',
        '这批数据里利润为负，核心问题不在流程而在成本失衡。',
      ])
      : analysis.defectRate > 3
      ? choose(seed + 5, [
        '次品率偏高，返修和损耗会持续侵蚀利润。',
        '质量波动已经明显，后续结算风险会上升。',
        '次品控制没压住，利润端会被持续拖慢。',
      ])
      : analysis.auditRate < 100
      ? choose(seed + 7, [
        '审核链未闭合是当前最大不确定项。',
        '未审核订单是现阶段最主要的风险源。',
        '先把审核闭环做完，再谈终审效率更合适。',
      ])
      : choose(seed + 11, [
        '当前主要关注利润和质量是否继续稳定。',
        '目前没有单点爆雷，重点是守住利润和质量底线。',
        '这批单看起来平稳，核心是防止质量回摆。',
      ]);

    const execute = analysis.auditRate < 100
      ? '先把未审核订单补齐，再进入终审。'
      : analysis.defectRate > 3
      ? '先和工厂复盘质量波动，再决定是否放行。'
      : '按当前口径推进终审，并持续盯利润与次品率。';

    return { summary, painPoint, execute };
  }, [analysis]);

  const content = (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <RobotOutlined style={{ color: 'var(--primary-color)' }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>AI 智能分析</span>
        <Tag color={analysis.auditedCount === analysis.totalCount ? 'success' : 'orange'} style={{ marginLeft: 'auto', fontSize: 11 }}>
          {analysis.auditedCount === analysis.totalCount ? '全部已审核' : `${analysis.auditedCount}/${analysis.totalCount} 已审核`}
        </Tag>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', marginBottom: 4 }}>
          订单审核进度
        </div>
        <Progress
          percent={analysis.auditRate}
          size="small"
          status={analysis.auditRate === 100 ? 'success' : 'active'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ textAlign: 'center', padding: '6px', background: 'var(--color-bg-container)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--neutral-text-secondary)' }}>利润率</div>
          <div style={{
            fontSize: 16, fontWeight: 600,
            color: analysis.profitRate >= 10 ? 'var(--color-success)' : analysis.profitRate >= 0 ? 'var(--color-warning)' : 'var(--color-danger)'
          }}>
            {analysis.profitRate.toFixed(1)}%
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '6px', background: 'var(--color-bg-container)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--neutral-text-secondary)' }}>次品率</div>
          <div style={{
            fontSize: 16, fontWeight: 600,
            color: analysis.defectRate <= 1 ? 'var(--color-success)' : analysis.defectRate <= 3 ? 'var(--color-warning)' : 'var(--color-danger)'
          }}>
            {analysis.defectRate.toFixed(1)}%
          </div>
        </div>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <div>
        <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          {analysis.topSuggestion.startsWith('⚠️') || analysis.topSuggestion.includes('警')
            ? <WarningOutlined style={{ color: 'var(--color-warning)' }} />
            : <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
          智能判断
        </div>
        <DecisionInsightCard
          compact
          insight={{
            level: analysis.profitRate < 0 || analysis.defectRate > 3 ? 'danger' : analysis.profitRate < 5 || analysis.auditRate < 100 ? 'warning' : 'success',
            title: analysis.auditRate === 100 ? '这家可进入终审' : '先补齐审核更稳',
            summary: narrative.summary,
            painPoint: narrative.painPoint,
            evidence: [
              `审核 ${analysis.auditedCount}/${analysis.totalCount}`,
              `利润率 ${analysis.profitRate.toFixed(1)}%`,
              `次品率 ${analysis.defectRate.toFixed(1)}%`,
            ],
            execute: narrative.execute,
            source: '财务数据推演',
            confidence: analysis.auditRate === 100 ? '可执行建议' : '建议先复核',
            note: analysis.suggestions.slice(1, 3).join('；') || undefined,
            labels: {
              summary: '现状',
              painPoint: '关注点',
              execute: '下一步',
              evidence: '数据',
              note: '补充',
            },
          }}
        />
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      placement="rightTop"
      trigger="hover"
      overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
    >
      {children}
    </Popover>
  );
};

export default FactoryAuditPopover;
