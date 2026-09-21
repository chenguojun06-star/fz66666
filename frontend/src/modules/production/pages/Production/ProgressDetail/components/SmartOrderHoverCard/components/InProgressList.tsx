/**
 * SmartOrderHoverCard 进行中工序列表
 *  - 全部展示进行中工序（pct > 0 && pct < 100）
 *  - 子工序模式：展示父工序分组标题
 *  - 显示：工序名 / 瓶颈标记 / 进度条 / 百分比 / 件数 / 人数 / 人均产能 / 最近扫码 / 预计完成日
 */
import React from 'react';
import dayjs from 'dayjs';
import type { StageItem } from '../helpers';
import type { ProgressInsight } from '../../../utils/progressIntelligence';

interface Props {
  inProgressList: StageItem[];
  total: number;
  speed: number;
  now: dayjs.Dayjs;
  progressInsight: ProgressInsight | null;
}

const InProgressList: React.FC<Props> = ({
  inProgressList,
  total,
  speed,
  now,
  progressInsight,
}) => {
  if (inProgressList.length === 0) return null;

  return (
    <div className="u-mb-4">
      {inProgressList.map((s, idx) => {
        const remainDays = speed > 0
          ? Math.ceil(Math.max(0, total - s.qty) / speed)
          : null;
        const estFinish = remainDays !== null
          ? now.add(remainDays, 'day').format('MM-DD')
          : null;
        // 子工序模式：展示父工序分组标题
        const showGroupHeader = s.stageName &&
          (idx === 0 || inProgressList[idx - 1].stageName !== s.stageName);
        const isSubProcess = !!s.stageName;
        return (
          <React.Fragment key={s.label}>
            {showGroupHeader && (
              <div style={{
                fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600,
                marginTop: idx > 0 ? 6 : 0, marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ color: 'var(--color-primary)' }}>◆</span>
                <span>{s.stageName}</span>
                <div className="u-flex-1 u-ml-2" style={{ height: 1, background: 'var(--color-blue-100)' }} />
              </div>
            )}
            <div style={{ paddingLeft: isSubProcess ? 10 : 0, marginBottom: 6 }}>
              {/* 第一行：图标 + 工序名 + 进度条(60px) + 百分比 */}
              <div className="u-d-flex u-ai-center" style={{ gap: 5 }}>
                <span className="u-fshrink-0 u-fs-11 u-ta-center" style={{ width: 12, color: 'var(--color-primary)' }}>▶</span>
                <span className="u-fshrink-0 u-fw-600 u-fs-11" style={{ minWidth: 40, maxWidth: 56, color: 'var(--color-primary)' }}>{s.label}</span>
                {/* 瓶颈标记：当前工序与 progressInsight 检测到的瓶颈匹配 */}
                {progressInsight?.bottleneck?.stage === s.label && (
                  <span style={{
                    background: 'var(--status-success-bg)', color: 'var(--color-danger)',
                    borderRadius: 8, padding: '0 5px', fontSize: 12, fontWeight: 700,
                  }}>瓶颈</span>
                )}
                <div className="u-fshrink-0 u-ov-hidden" style={{ width: 60, height: 4, background: 'var(--color-bg-highlight)', borderRadius: 2 }}>
                  <div style={{
                    width: `${Math.min(100, s.pct)}%`, height: '100%',
                    borderRadius: 2, background: 'var(--color-primary)',
                  }} />
                </div>
                <span className="u-fshrink-0 u-fs-11 u-fw-700 u-ta-right" style={{ color: 'var(--color-primary)', minWidth: 34 }}>
                  {s.pct}%
                </span>
              </div>
              {/* 第二行：件数 + 操作人数 + 人均产能 + 最近扫码时间 + 预计完成日 */}
              <div className="u-fs-11 u-mt-2 u-d-flex u-gap-8 u-fwrap-wrap u-ai-center" style={{ paddingLeft: 17, color: 'var(--color-text-quaternary)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{s.qty}/{total}件</span>
                {s.workerCount > 0 && (
                  <span style={{
                    color: 'var(--color-primary)', background: 'var(--status-processing-bg)',
                    padding: '0px 5px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  }}>
                     {s.workerCount}人
                  </span>
                )}
                {s.workerCount > 0 && speed > 0 && (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    约{(speed / s.workerCount).toFixed(1)}件/人·天
                  </span>
                )}
                {s.lastTime && <span>最近 {s.lastTime}</span>}
                {estFinish && <span style={{ color: 'var(--color-primary)' }}>预计 {estFinish}</span>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default React.memo(InProgressList);
