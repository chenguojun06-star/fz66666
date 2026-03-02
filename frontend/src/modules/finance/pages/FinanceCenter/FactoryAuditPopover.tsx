import React, { useMemo } from 'react';
import { Popover, Progress, Tag, Divider } from 'antd';
import { RobotOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';

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

    return { auditedCount, totalCount, auditRate, profitRate, defectRate, suggestions };
  }, [record, auditedOrderNos]);

  const content = (
    <div style={{ width: 260 }}>
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
          {analysis.suggestions[0].startsWith('⚠️') || analysis.suggestions[0].includes('警')
            ? <WarningOutlined style={{ color: 'var(--color-warning)' }} />
            : <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
          智能建议
        </div>
        {analysis.suggestions.map((s, i) => (
          <div key={i} style={{ fontSize: 12, color: 'var(--neutral-text)', marginBottom: 4, paddingLeft: 4, borderLeft: '2px solid var(--primary-color)' }}>
            {s}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      placement="rightTop"
      trigger="hover"
      overlayStyle={{ maxWidth: 300 }}
    >
      {children}
    </Popover>
  );
};

export default FactoryAuditPopover;
