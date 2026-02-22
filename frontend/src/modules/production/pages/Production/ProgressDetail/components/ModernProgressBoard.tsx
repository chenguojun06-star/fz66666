import React from 'react';
import { ProgressNode } from '../types';
import { clampPercent, defaultNodes, getNodeIndexFromProgress } from '../utils';
import './ModernProgressBoard.css';

type ModernProgressBoardProps = {
  nodes: ProgressNode[];
  progress: number;
  label: string;
  totalQty: number;
  doneQty: number;
  arrivalRate?: number;
  frozen?: boolean;
  nodeDoneMap?: Record<string, number>;
};

const ModernProgressBoard: React.FC<ModernProgressBoardProps> = ({ nodes, progress, label, totalQty, doneQty, arrivalRate, frozen, nodeDoneMap }) => {
  const pct = clampPercent(progress);
  const effectivePct = frozen ? 100 : pct;
  const ns = Array.isArray(nodes) && nodes.length ? nodes : defaultNodes;
  const nodeSize = ns.length > 12 ? 52 : ns.length > 8 ? 60 : 70;
  const currentIdx = getNodeIndexFromProgress(ns, effectivePct);
  const segPct = ns.length ? 100 / ns.length : 100;
  const safeTotal = Math.max(0, Number(totalQty) || 0);
  const safeDoneRaw = Math.max(0, Math.min(Number(doneQty) || 0, safeTotal));
  const safeDone = frozen ? safeTotal : safeDoneRaw;
  const remaining = Math.max(0, safeTotal - safeDone);
  const labelKey = `${label}-${effectivePct}-${safeDone}-${safeTotal}-${remaining}-${frozen ? 1 : 0}`;

  const stageQty = (i: number, name?: string) => {
    const total = Number(totalQty) || 0;
    if (total <= 0) return 0;
    if (i > currentIdx) return 0;
    const perNode = name && nodeDoneMap ? Number((nodeDoneMap as any)[name]) || 0 : undefined;
    const done = Number.isFinite(perNode as any) ? (perNode as number) : safeDone;
    if (done <= 0) return 0;
    if (frozen) return total;
    if (i <= currentIdx) return Math.max(0, Math.min(done, total));
    return 0;
  };

  return (
    <div className="mpb-wrap" aria-label={`生产进度 ${label} ${effectivePct}%`}>
      <div className={`mpb-glass ${frozen ? 'mpb-frozen' : ''}`}>
        <div className="mpb-row">
          <div className="mpb-nodesWrap">
            {ns.map((n, i) => {
              const isDoneNode = i < currentIdx || effectivePct >= 100;
              const isCurrent = !frozen && i === currentIdx && effectivePct > 0 && effectivePct < 100;
              const name = String(n?.name || '').trim() || '-';
              // const isProcurementNode = name.includes('采购') || name.includes('物料');
              const qty = stageQty(i, name);
              const nodeStart = i * segPct;
              const nodeFillRaw = segPct > 0 ? ((effectivePct - nodeStart) / segPct) * 100 : effectivePct;
              const fillPct = clampPercent(nodeFillRaw);
              const displayText = String(qty);
              const badgeKey = `${labelKey}-${i}-${displayText}`;
              return (
                <div key={String(n.id || n.name || i)} className="mpb-mark" title={`${name} ${qty}`}>
                  <div
                    key={badgeKey}
                    className={`mpb-node mpb-pop${isDoneNode ? ' mpb-nodeDone' : ''}${isCurrent ? ' mpb-nodeCurrent' : ''}`}
                    style={{ ['--p' as any]: `${fillPct}%`, width: nodeSize, height: nodeSize }}
                  >
                    <span className="mpb-nodeName">{name}</span>
                    <span className="mpb-nodeQty">{displayText}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mpb-right">
            <div className="mpb-percent">{effectivePct}%</div>
            <div key={labelKey} className="mpb-stats mpb-pop">
              {safeDone}/{safeTotal} · 剩 {remaining}
              {typeof arrivalRate === 'number' ? ` · 到位 ${clampPercent(arrivalRate)}%` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernProgressBoard;
