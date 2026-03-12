import React, { useMemo } from 'react';
import { Popover, Progress, Tag, Divider } from 'antd';
import { RobotOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';

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
            title: analysis.auditRate === 100 ? '可以进入终审' : '先补审核再终审',
            summary: analysis.auditRate === 100 ? '当前审核覆盖已经到位，可以把注意力放在利润和次品风险。' : '这家工厂还有订单没审完，终审前不要急着放行。',
            painPoint: analysis.profitRate < 0
              ? '利润已经转负，最大痛点是成本结构失真。'
              : analysis.defectRate > 3
              ? '次品率偏高，利润会继续被返修和损耗吞掉。'
              : analysis.auditRate < 100
              ? '审核链没闭合，后面出错会直接放大财务风险。'
              : '当前主要看利润和质量是否还稳。',
            evidence: [
              `审核 ${analysis.auditedCount}/${analysis.totalCount}`,
              `利润率 ${analysis.profitRate.toFixed(1)}%`,
              `次品率 ${analysis.defectRate.toFixed(1)}%`,
            ],
            execute: analysis.auditRate < 100 ? '先把未审核订单补齐，再做终审。' : analysis.defectRate > 3 ? '先找工厂复盘质量，再决定是否放行。' : '按当前口径推进终审，同时盯利润。',
            source: '财务规则',
            confidence: '中高置信',
            note: analysis.suggestions.slice(1, 3).join('；') || undefined,
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
