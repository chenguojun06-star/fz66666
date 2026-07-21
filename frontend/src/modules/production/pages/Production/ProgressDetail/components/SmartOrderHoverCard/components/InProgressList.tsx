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
    <div style={{ marginBottom: 4 }}>
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
                fontSize: 11, color: '#888', fontWeight: 600,
                marginTop: idx > 0 ? 6 : 0, marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ color: 'var(--color-primary)' }}>◆</span>
                <span>{s.stageName}</span>
                <div style={{ flex: 1, height: 1, background: '#e8f4ff', marginLeft: 2 }} />
              </div>
            )}
            <div style={{ paddingLeft: isSubProcess ? 10 : 0, marginBottom: 6 }}>
              {/* 第一行：图标 + 工序名 + 进度条(60px) + 百分比 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, flexShrink: 0, fontSize: 11, textAlign: 'center', color: 'var(--color-primary)' }}>▶</span>
                <span style={{ minWidth: 40, maxWidth: 56, flexShrink: 0, fontWeight: 600, color: 'var(--color-primary)', fontSize: 11 }}>{s.label}</span>
                {/* 瓶颈标记：当前工序与 progressInsight 检测到的瓶颈匹配 */}
                {progressInsight?.bottleneck?.stage === s.label && (
                  <span style={{
                    background: '#F6FFED', color: 'var(--color-danger)',
                    borderRadius: 8, padding: '0 5px', fontSize: 11, fontWeight: 700,
                  }}>瓶颈</span>
                )}
                <div style={{ width: 60, flexShrink: 0, height: 4, background: '#f0f5ff', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, s.pct)}%`, height: '100%',
                    borderRadius: 2, background: 'var(--color-primary)',
                  }} />
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--color-primary)', fontWeight: 700, minWidth: 34, textAlign: 'right' }}>
                  {s.pct}%
                </span>
              </div>
              {/* 第二行：件数 + 操作人数 + 人均产能 + 最近扫码时间 + 预计完成日 */}
              <div style={{ paddingLeft: 17, fontSize: 11, color: '#aaa', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: '#888' }}>{s.qty}/{total}件</span>
                {s.workerCount > 0 && (
                  <span style={{
                    color: 'var(--color-primary)', background: '#e6f4ff',
                    padding: '0px 5px', borderRadius: 8, fontSize: 11, fontWeight: 600,
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
