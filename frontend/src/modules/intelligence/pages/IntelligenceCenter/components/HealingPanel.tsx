import React from 'react';
import { Tag } from 'antd';
import { LiveDot, AnimatedNum } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

interface HealingPanelProps {
  healing: any;
  repairing: boolean;
  repairResult: { needManual: number; autoFixed: number } | null;
  onRepair: () => void;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const HealingPanel: React.FC<HealingPanelProps> = ({
  healing, repairing, repairResult, onRepair, collapsedPanels, toggleCollapse,
}) => {
  return (
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('healing')}>
        <LiveDot size={7} color={healing && healing.healthScore < 80 ? 'var(--color-warning)' : 'var(--color-success)'} />
        系统异常自愈诊断
        {healing && (
          <span className="c-card-badge" style={{
            background: healing.healthScore >= 80 ? 'rgba(82,196,26,0.12)' : 'rgba(212,137,6,0.12)',
            color: healing.healthScore >= 80 ? 'var(--color-success)' : 'var(--color-warning)',
            borderColor: healing.healthScore >= 80 ? '#73d13d55' : 'var(--color-warning)55',
          }}>
            健康 <AnimatedNum val={healing.healthScore} /> 分 · 发现 <AnimatedNum val={healing.issuesFound} /> 项
          </span>
        )}
        <CollapseChevron panelKey="healing" collapsed={!!collapsedPanels['healing']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['healing'] ? 0 : 500, transition: 'max-height 0.28s ease' }}>
        {healing?.items?.length ? (
          healing.items.slice(0, 7).map((item: any, i: number) => (
            <div key={i} className="c-heal-item">
              <span className={`c-heal-dot ${item.status === 'OK' ? 'dot-ok' : item.autoFixed ? 'dot-fixed' : 'dot-warn'}`} />
              <span className="c-heal-name">{item.checkName}</span>
              <span className="c-heal-detail">{item.detail}</span>
              <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                {item.autoFixed
                  ? <Tag style={{ fontSize: 14, background: 'rgba(45, 127, 249, 0.13)', color: 'var(--color-primary-light)', borderColor: '#4096ff55' }}>已自修</Tag>
                  : item.status !== 'OK'
                    ? <Tag style={{ fontSize: 14, background: 'var(--color-warning)22', color: 'var(--color-warning)', borderColor: 'var(--color-warning)55' }}>需处理</Tag>
                    : <Tag style={{ fontSize: 14, background: 'rgba(82, 196, 26, 0.13)', color: 'var(--color-success)', borderColor: '#73d13d55' }}>正常</Tag>
                }
              </span>
            </div>
          ))
        ) : <div className="c-empty">暂无诊断数据</div>}
        {healing && healing.needManual > 0 && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onRepair}
              disabled={repairing}
              style={{
                background: 'transparent', color: 'var(--color-primary)',
                border: '1px solid var(--color-primary)', borderRadius: 6, padding: '5px 16px', cursor: repairing ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 600, opacity: repairing ? 0.6 : 1,
              }}
            >
              {repairing ? '修复中…' : ' 一键修复'}
            </button>
            {repairResult && (
              <span style={{ fontSize: 14, color: repairResult.needManual < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                {repairResult.needManual < 0 ? '修复失败' : `已修复 ${repairResult.autoFixed} 项，${repairResult.needManual} 项需人工`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HealingPanel;
