import React, { useState } from 'react';
import { LikeOutlined, DislikeOutlined } from '@ant-design/icons';
import type { RiskIndicator, SimulationResultData } from '@/services/intelligence/intelligenceApi';
import type { Message } from './types';
import styles from './index.module.css';

/** 风险量化指标卡 */
export const RiskIndicatorWidget: React.FC<{ items: RiskIndicator[] }> = ({ items }) => {
  if (!items?.length) return null;
  return (
    <div className={styles.riskIndicatorsWrapper}>
      {items.map((r, i) => {
        const lvl = (r.level || 'low').toLowerCase();
        const cls = lvl === 'high' ? styles.riskHigh : lvl === 'medium' ? styles.riskMedium : styles.riskLow;
        return (
          <div key={i} className={`${styles.riskCard} ${cls}`}>
            <span className={`${styles.riskProb} ${cls}`}>{Math.round(r.probability * 100)}%</span>
            <div className={styles.riskInfo}>
              <span className={styles.riskName}>{r.name}</span>
              {r.description && <span className={styles.riskDesc}>{r.description}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 数字孪生模拟结果 */
export const SimulationWidget: React.FC<{ data: SimulationResultData }> = ({ data }) => {
  if (!data?.scenarioDescription) return null;
  const rows = data.scenarioRows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className={styles.simulationWrapper}>
      <div className={styles.simulationTitle}>📐 模拟：{data.scenarioDescription}</div>
      {rows.length > 0 && (
        <table className={styles.simulationTable}>
          <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}>{cols.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      )}
      {data.recommendation && <div className={styles.simulationRec}>💡 {data.recommendation}</div>}
    </div>
  );
};

/** 澄清追问卡片 */
export const ClarificationCard: React.FC<{ missingInfo?: string[]; onAsk?: (question: string) => void }> = ({ missingInfo, onAsk }) => (
  <div className={styles.clarificationCard}>
    <span className={styles.clarificationLabel}>🤔 需要补充以下信息才能给出准确分析：</span>
    {missingInfo && missingInfo.length > 0 ? (
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {missingInfo.map((info, idx) => (
          <button
            key={idx}
            className={styles.actionBtn}
            style={{ fontSize: 12, padding: '2px 10px' }}
            onClick={() => onAsk?.(info)}
          >{info}</button>
        ))}
      </div>
    ) : (
      <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
        请提供：订单号 / 款号 / 工厂名 / 时间范围 等
      </div>
    )}
  </div>
);

/** 反馈评分组件 */
export const FeedbackWidget: React.FC<{
  msg: Message;
  onFeedback: (msg: Message, score: number) => void;
}> = ({ msg, onFeedback }) => {
  const [sent, setSent] = useState(false);
  // P0: 同时支持 HyperAdvisor traceId 消息 和 AI Agent agentCommandId 消息
  if ((!msg.traceId && !msg.agentCommandId) || sent) return null;
  const handleClick = (score: number) => { setSent(true); onFeedback(msg, score); };
  return (
    <div className={styles.feedbackRow}>
      <span className={styles.feedbackLabel}>这个回答有帮助吗？</span>
      <button className={styles.feedbackBtn} onClick={() => handleClick(5)} title="有用"><LikeOutlined /></button>
      <button className={styles.feedbackBtn} onClick={() => handleClick(1)} title="不太好"><DislikeOutlined /></button>
    </div>
  );
};
