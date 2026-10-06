import React from 'react';
import { LiveDot } from './IntelligenceWidgets';
import { AutoScrollBox } from './OrderScrollPanel';
import CollapseChevron from '../CollapseChevron';
import type { StageBottleneckHeatmapResponse } from '@/services/intelligence/intelligenceApi';

interface StageBottleneckPanelProps {
  stageBottleneck: StageBottleneckHeatmapResponse | null;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

/** 等级 → 展示色（严重红 / 关注黄 / 正常青） */
const LEVEL_COLOR: Record<string, string> = {
  CRITICAL: 'var(--color-danger)',
  WARNING: 'var(--color-warning)',
  OK: 'var(--color-accent-neon)',
};
const LEVEL_TEXT: Record<string, string> = { CRITICAL: '严重', WARNING: '关注', OK: '正常' };

/**
 * 环节瓶颈热力看板（D-754 P2）
 *
 * 展示「工厂 × 环节」的相邻工序积压量与按在岗人力折算的消化天数，
 * 让管理层一眼看到瓶颈堵在哪个厂的哪道工序、不补人还要堵几天。
 */
const StageBottleneckPanel: React.FC<StageBottleneckPanelProps> = ({
  stageBottleneck, collapsedPanels, toggleCollapse,
}) => {
  const rows = stageBottleneck?.rows ?? [];
  const hasCritical = rows.some(r => r.level === 'CRITICAL');

  return (
    <div className="c-card c-hover-hl">
      <div className="c-card-title u-cur-pointer" onClick={() => toggleCollapse('stageBottleneck')}>
        <LiveDot size={7} color={hasCritical ? 'var(--color-danger)' : 'var(--color-accent-neon)'} />
        环节瓶颈热力
        <span className="c-card-badge cyan-badge">{rows.length} 处积压</span>
        <span className="u-fs-14" style={{ color: 'var(--color-blue-400)', letterSpacing: 0 }}>
          {stageBottleneck?.summary || '按当前人力折算各环节消化天数'}
        </span>
        <CollapseChevron panelKey="stageBottleneck" collapsed={!!collapsedPanels['stageBottleneck']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['stageBottleneck'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
        {rows.length ? (
          <AutoScrollBox className="c-orders-scroll">
            <table className="c-table">
              <thead>
                <tr>
                  <th>工厂</th>
                  <th>瓶颈环节</th>
                  <th>积压量</th>
                  <th>在岗人力</th>
                  <th>预计消化</th>
                  <th style={{ textAlign: 'left' }}>建议</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.factoryName}-${r.stage}-${i}`}>
                    <td>{r.factoryName}</td>
                    <td>
                      {r.upstreamStage} → <b style={{ color: LEVEL_COLOR[r.level] }}>{r.stage}</b>
                    </td>
                    <td>{r.backlogQty} 件</td>
                    <td>{r.workers} 人</td>
                    <td style={{ color: LEVEL_COLOR[r.level] }}>
                      {r.estClearDays == null ? '—' : `${r.estClearDays} 天`}
                      <span className="u-fs-13">&nbsp;{LEVEL_TEXT[r.level] ?? ''}</span>
                    </td>
                    <td style={{ textAlign: 'left' }}>{r.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AutoScrollBox>
        ) : (
          <div className="c-empty">各环节流转顺畅，没有明显积压</div>
        )}
      </div>
    </div>
  );
};

export default StageBottleneckPanel;